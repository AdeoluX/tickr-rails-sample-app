import { randomUUID } from 'node:crypto';
import { db, inTransaction } from './db.js';
import { tickrGet, tickrPost, TickrError } from './tickr.js';
import { httpError, referenceFor } from './auth.js';
import { config } from './config.js';
import { plainReason } from './reasons.js';

const naira = (kobo) => kobo / 100;
const kobo = (amount) => Math.round(Number(amount) * 100);
const memberById = (id) => db.prepare('SELECT * FROM members WHERE id = ?').get(id);

/** What the app needs to know about a member. */
export function publicMember(member) {
    return {
        id: member.id,
        name: member.name,
        email: member.email,
        savings: naira(member.savings_kobo),
        onboarding: { state: member.onboarding_state, error: member.onboarding_error },
        hasInvestmentAccount: member.onboarding_state === 'ACTIVE',
        maxTransfer: config.maxTransferKobo ? naira(config.maxTransferKobo) : null
    };
}

export const requireActive = (member) => {
    if (member.onboarding_state !== 'ACTIVE') throw httpError(409, 'Open your investment account first');
};

// ─── Onboarding ──────────────────────────────────────────────────────────────

/** Sends the member's KYC to Tickr Rails, which opens a CSCS and broker account for them. */
export async function startOnboarding(member, kyc) {
    if (['PROCESSING', 'ACTIVE'].includes(member.onboarding_state)) throw httpError(409, 'Your account is already being set up');
    const result = await tickrPost('/clients', { kyc: { ...kyc, email: member.email } });
    db.prepare(`UPDATE members SET platform_client_id = ?, polling_id = ?, onboarding_state = 'PROCESSING', onboarding_error = NULL WHERE id = ?`)
        .run(result.platformClientId, result.pollingId, member.id);
    return memberById(member.id);
}

/**
 * Brings the member's onboarding up to date. Webhooks normally do this; polling covers a missed
 * webhook. The account is ready once Tickr Rails can return it.
 */
export async function refreshOnboarding(member) {
    if (member.onboarding_state !== 'PROCESSING') return { member, step: null };
    let step = null;
    try {
        const job = await tickrGet(`/clients/jobs/${member.polling_id}/status`);
        step = job.step ?? null;
        if (job.state === 'failed') {
            markOnboarding(member.platform_client_id, 'FAILED', job.failedReason || 'Account setup failed');
            return { member: memberById(member.id), step };
        }
    } catch (error) { if (!(error instanceof TickrError)) throw error; }

    try {
        await tickrGet(`/clients/${member.platform_client_id}/account`);
        markOnboarding(member.platform_client_id, 'ACTIVE');
    } catch (error) { if (!(error instanceof TickrError)) throw error; } // not ready yet
    return { member: memberById(member.id), step };
}

export function markOnboarding(platformClientId, state, error = null) {
    db.prepare(`UPDATE members SET onboarding_state = ?, onboarding_error = ? WHERE platform_client_id = ? AND onboarding_state <> 'ACTIVE'`)
        .run(state, plainReason(error), platformClientId);
}

// ─── Coop savings and the investment account ────────────────────────────────

const MIN_TRANSFER = 100;

const checkAmount = (value) => {
    if (!(value >= MIN_TRANSFER * 100)) throw httpError(400, `Enter at least ₦${MIN_TRANSFER}`);
    if (config.maxTransferKobo && value > config.maxTransferKobo) throw httpError(400, `You can move up to ₦${naira(config.maxTransferKobo).toLocaleString('en-NG')} at a time`);
};

/**
 * Moves money from coop savings into the member's investment account. Savings are taken at once,
 * so they cannot be spent twice; if Tickr Rails reports the deposit failed, they are put back.
 */
export async function fundInvesting(member, amount) {
    requireActive(member);
    const value = kobo(amount);
    checkAmount(value);

    const id = randomUUID();
    const reference = referenceFor(member.id, 'DEP');
    inTransaction(() => {
        const { changes } = db.prepare('UPDATE members SET savings_kobo = savings_kobo - ? WHERE id = ? AND savings_kobo >= ?').run(value, member.id, value);
        if (!changes) throw httpError(400, 'Your coop savings are not enough for this amount');
        db.prepare(`INSERT INTO transfers (id, member_id, type, amount_kobo, reference) VALUES (?, ?, 'DEPOSIT', ?, ?)`).run(id, member.id, value, reference);
    });

    try {
        const result = await tickrPost(`/clients/${member.platform_client_id}/transactions`, {
            type: 'DEPOSIT', amount: naira(value), currency: 'NGN', reference, notes: 'From Coopsaas savings'
        });
        db.prepare('UPDATE transfers SET tickr_transaction_id = ? WHERE id = ?').run(result.transactionId, id);
    } catch (error) {
        // Tickr Rails refused it outright, so nothing moved: give the savings back
        settleTransfer(id, 'FAILED', error.message);
        throw error;
    }
    return db.prepare('SELECT * FROM transfers WHERE id = ?').get(id);
}

/** Moves money from the investment account back to coop savings, credited once Tickr Rails confirms it. */
export async function withdrawToSavings(member, amount) {
    requireActive(member);
    const value = kobo(amount);
    checkAmount(value);

    const summary = await tickrGet(`/clients/${member.platform_client_id}/trading-summary`);
    if (value > kobo(summary.availableBalance ?? 0)) throw httpError(400, 'That is more than your available investing cash');

    const id = randomUUID();
    const reference = referenceFor(member.id, 'WDR');
    db.prepare(`INSERT INTO transfers (id, member_id, type, amount_kobo, reference) VALUES (?, ?, 'WITHDRAWAL', ?, ?)`).run(id, member.id, value, reference);
    try {
        const result = await tickrPost(`/clients/${member.platform_client_id}/transactions`, {
            type: 'WITHDRAWAL', amount: naira(value), currency: 'NGN', reference, notes: 'To Coopsaas savings'
        });
        db.prepare('UPDATE transfers SET tickr_transaction_id = ? WHERE id = ?').run(result.transactionId, id);
    } catch (error) {
        settleTransfer(id, 'FAILED', error.message);
        throw error;
    }
    return db.prepare('SELECT * FROM transfers WHERE id = ?').get(id);
}

/**
 * Records the final outcome of a transfer, once. A failed deposit returns the savings; a posted
 * withdrawal adds to them. Safe to call again for the same transfer.
 */
export function settleTransfer(transferId, status, reason = null) {
    return inTransaction(() => {
        const transfer = db.prepare('SELECT * FROM transfers WHERE id = ?').get(transferId);
        if (!transfer || transfer.status !== 'PENDING') return false;
        db.prepare(`UPDATE transfers SET status = ?, failure_reason = ?, updated_at = datetime('now') WHERE id = ?`).run(status, reason, transferId);
        const credit = (transfer.type === 'DEPOSIT' && status === 'FAILED') || (transfer.type === 'WITHDRAWAL' && status === 'POSTED');
        if (credit) db.prepare('UPDATE members SET savings_kobo = savings_kobo + ? WHERE id = ?').run(transfer.amount_kobo, transfer.member_id);
        return true;
    });
}

/** Checks pending transfers against Tickr Rails, in case a webhook was missed. */
export async function refreshTransfers(member) {
    const pending = db.prepare(`SELECT * FROM transfers WHERE member_id = ? AND status = 'PENDING' AND tickr_transaction_id IS NOT NULL`).all(member.id);
    if (!pending.length) return;
    const page = await tickrGet(`/clients/${member.platform_client_id}/transactions?size=100`);
    for (const transfer of pending) {
        const tx = page.transactions.find(t => t.id === transfer.tickr_transaction_id);
        if (tx && ['POSTED', 'EXECUTED'].includes(tx.status)) settleTransfer(transfer.id, 'POSTED');
        else if (tx && tx.status === 'FAILED') settleTransfer(transfer.id, 'FAILED', 'Tickr Rails could not post it');
    }
}

export const listTransfers = (member) =>
    db.prepare('SELECT * FROM transfers WHERE member_id = ? ORDER BY created_at DESC LIMIT 50').all(member.id).map(t => ({
        id: t.id, type: t.type, amount: naira(t.amount_kobo), status: t.status, reason: plainReason(t.failure_reason),
        reference: t.reference, createdAt: t.created_at
    }));

// ─── Orders ──────────────────────────────────────────────────────────────────

/** Checks an order with Tickr Rails, then places it. */
export async function placeOrder(member, { instrument, side, quantity, priceType, limitPrice, estimatedPrice }) {
    requireActive(member);
    const order = {
        platformClientId: member.platform_client_id,
        instrument: String(instrument || '').toUpperCase(),
        type: side === 'sell' ? 'sell' : 'buy',
        quantity: Number(quantity),
        priceType: priceType === 'LIMIT' ? 'LIMIT' : 'MARKET',
        ...(priceType === 'LIMIT' ? { limitPrice: Number(limitPrice) } : { estimatedPrice: Number(estimatedPrice) || undefined }),
        timeInForce: 'DAY',
        reference: referenceFor(member.id, 'ORD')
    };
    if (!order.instrument) throw httpError(400, 'Choose a stock');
    if (!Number.isInteger(order.quantity) || order.quantity < 1) throw httpError(400, 'Enter a whole number of shares');

    const check = await tickrPost('/trades/validate', order);
    if (check && check.isValid === false) throw httpError(400, (check.errors || []).join('. ') || 'Tickr Rails rejected this order');

    // Tickr Rails does not check the balance when validating, so Coopsaas checks buys itself
    if (order.type === 'buy' && check?.totalRequired) {
        const summary = await tickrGet(`/clients/${member.platform_client_id}/trading-summary`);
        if (check.totalRequired > Number(summary.availableBalance ?? 0)) {
            throw httpError(400, `This order needs about ₦${check.totalRequired.toLocaleString('en-NG')}. Add money to your investing cash first.`);
        }
    }

    const placed = await tickrPost('/trades', order);
    db.prepare('INSERT INTO orders (trade_id, member_id, reference) VALUES (?, ?, ?)').run(placed.tradeId, member.id, order.reference);
    return placed;
}

export async function cancelOrder(member, tradeId) {
    const owned = db.prepare('SELECT 1 FROM orders WHERE trade_id = ? AND member_id = ?').get(tradeId, member.id);
    if (!owned) throw httpError(404, 'Order not found');
    return tickrPost(`/trades/${tradeId}/cancel`);
}

export const memberForTrade = (tradeId) => db.prepare('SELECT member_id FROM orders WHERE trade_id = ?').get(tradeId)?.member_id ?? null;
export const memberForClient = (platformClientId) => db.prepare('SELECT id FROM members WHERE platform_client_id = ?').get(platformClientId)?.id ?? null;

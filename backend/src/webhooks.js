import { createHmac, timingSafeEqual } from 'node:crypto';
import { db } from './db.js';
import { config } from './config.js';
import { markOnboarding, memberForClient, memberForTrade, settleTransfer } from './members.js';
import { plainReason } from './reasons.js';

const MAX_AGE_MS = 5 * 60_000;

/** True when the body was signed with Coopsaas's webhook secret. Compared in constant time. */
const signatureValid = (rawBody, header) => {
    if (!config.tickrWebhookSecret || typeof header !== 'string') return false;
    const expected = `sha256=${createHmac('sha256', config.tickrWebhookSecret).update(rawBody).digest('hex')}`;
    const a = Buffer.from(expected), b = Buffer.from(header);
    return a.length === b.length && timingSafeEqual(a, b);
};

/**
 * Receives a webhook from Tickr Rails. Checks the signature and age, ignores repeats by event id,
 * and updates Coopsaas's records. Answers quickly: Tickr Rails waits at most 5 seconds.
 */
export function handleTickrWebhook(req, res) {
    const raw = req.body instanceof Buffer ? req.body : Buffer.from('');
    if (!signatureValid(raw, req.get('x-tickr-signature'))) return res.status(401).json({ error: 'Bad signature' });

    let body;
    try { body = JSON.parse(raw.toString('utf8')); } catch { return res.status(400).json({ error: 'Not JSON' }); }
    if (Date.now() - Date.parse(body.timestamp) > MAX_AGE_MS) return res.status(400).json({ error: 'Too old' });

    const { id, event, payload = {}, occurredAt } = body;
    const memberId = payload.platformClientId ? memberForClient(payload.platformClientId)
        : payload.tradeId ? memberForTrade(payload.tradeId)
        : payload.transactionId ? db.prepare('SELECT member_id FROM transfers WHERE tickr_transaction_id = ?').get(payload.transactionId)?.member_id ?? null
        : null;

    const { changes } = db.prepare('INSERT OR IGNORE INTO webhook_events (id, event, member_id, payload, occurred_at) VALUES (?, ?, ?, ?, ?)')
        .run(id, event, memberId, JSON.stringify(payload), occurredAt || body.timestamp);
    if (!changes) return res.json({ ok: true, duplicate: true }); // seen it already

    try {
        apply(event, payload);
    } catch (error) {
        console.error(`[webhook] Could not apply ${event} ${id}:`, error.message);
    }
    res.json({ ok: true });
}

function apply(event, payload) {
    const transfer = payload.transactionId && db.prepare('SELECT id FROM transfers WHERE tickr_transaction_id = ?').get(payload.transactionId);
    switch (event) {
        case 'client.onboarded': return markOnboarding(payload.platformClientId, 'ACTIVE');
        case 'client.onboarding_failed': return markOnboarding(payload.platformClientId, 'FAILED', payload.reason || 'Account setup failed');
        case 'transaction.successful': return transfer && settleTransfer(transfer.id, 'POSTED');
        case 'transaction.failed': return transfer && settleTransfer(transfer.id, 'FAILED', payload.reason || 'Failed');
        default: return; // trade events are shown in the activity feed; order status is read from Tickr Rails
    }
}

/** The member's activity feed, newest first. */
export const listActivity = (memberId) =>
    db.prepare('SELECT id, event, payload, occurred_at FROM webhook_events WHERE member_id = ? ORDER BY occurred_at DESC LIMIT 50').all(memberId)
        .map(e => {
            const payload = JSON.parse(e.payload);
            if (payload.reason) payload.reason = plainReason(payload.reason);
            return { id: e.id, event: e.event, payload, occurredAt: e.occurred_at };
        });

import './setup.js';
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac, randomUUID } from 'node:crypto';
import { db } from '../src/db.js';
import { handleTickrWebhook } from '../src/webhooks.js';
import { settleTransfer } from '../src/members.js';

const SECRET = process.env.TICKR_WEBHOOK_SECRET;
const savings = (id) => db.prepare('SELECT savings_kobo FROM members WHERE id = ?').get(id).savings_kobo;
const transferStatus = (id) => db.prepare('SELECT status FROM transfers WHERE id = ?').get(id).status;

let memberId;
beforeEach(() => {
    db.exec('DELETE FROM webhook_events; DELETE FROM transfers; DELETE FROM orders; DELETE FROM sessions; DELETE FROM members;');
    memberId = randomUUID();
    db.prepare(`INSERT INTO members (id, email, name, password_hash, savings_kobo, platform_client_id, onboarding_state)
                VALUES (?, ?, 'Ada Obi', 'x:y', 100000, 'client-1', 'ACTIVE')`).run(memberId, `${memberId}@test`);
});

const transfer = (type, amountKobo, tickrId) => {
    const id = randomUUID();
    db.prepare(`INSERT INTO transfers (id, member_id, type, amount_kobo, reference, tickr_transaction_id) VALUES (?, ?, ?, ?, ?, ?)`)
        .run(id, memberId, type, amountKobo, `REF-${id}`, tickrId);
    return id;
};

/** Sends a webhook the way Tickr Rails does, and returns the response. */
const deliver = (body, { secret = SECRET, signature } = {}) => {
    const raw = Buffer.from(JSON.stringify(body));
    const header = signature ?? `sha256=${createHmac('sha256', secret).update(raw).digest('hex')}`;
    const res = { statusCode: 200, body: null, status(c) { this.statusCode = c; return this; }, json(b) { this.body = b; return this; } };
    handleTickrWebhook({ body: raw, get: (name) => (name.toLowerCase() === 'x-tickr-signature' ? header : undefined) }, res);
    return res;
};

const event = (name, payload, overrides = {}) => ({
    id: `evt_${randomUUID()}`, event: name, payload, occurredAt: new Date().toISOString(), timestamp: new Date().toISOString(), ...overrides
});

test('refuses a webhook with a wrong or missing signature', () => {
    assert.equal(deliver(event('client.onboarded', {}), { secret: 'whsec_someone_else' }).statusCode, 401);
    assert.equal(deliver(event('client.onboarded', {}), { signature: '' }).statusCode, 401);
});

test('refuses a webhook sent more than 5 minutes ago, so a captured one cannot be replayed', () => {
    const old = new Date(Date.now() - 6 * 60_000).toISOString();
    assert.equal(deliver(event('client.onboarded', {}, { timestamp: old })).statusCode, 400);
});

test('a failed deposit puts the savings back, once, even if the webhook arrives twice', () => {
    const id = transfer('DEPOSIT', 40000, 'tx-1'); // savings were already reduced when it was sent
    const failed = event('transaction.failed', { transactionId: 'tx-1', reason: 'Account frozen' });

    assert.equal(deliver(failed).statusCode, 200);
    assert.equal(transferStatus(id), 'FAILED');
    assert.equal(savings(memberId), 140000);

    const again = deliver(failed);
    assert.equal(again.body.duplicate, true);
    assert.equal(savings(memberId), 140000);
});

test('a posted withdrawal adds to savings once', () => {
    const id = transfer('WITHDRAWAL', 25000, 'tx-2');
    deliver(event('transaction.successful', { transactionId: 'tx-2', type: 'WITHDRAWAL', amount: 250 }));
    assert.equal(transferStatus(id), 'POSTED');
    assert.equal(savings(memberId), 125000);

    // The same outcome found again by polling changes nothing
    assert.equal(settleTransfer(id, 'POSTED'), false);
    assert.equal(savings(memberId), 125000);
});

test('a posted deposit leaves savings as they are', () => {
    const id = transfer('DEPOSIT', 40000, 'tx-3');
    deliver(event('transaction.successful', { transactionId: 'tx-3', type: 'DEPOSIT', amount: 400 }));
    assert.equal(transferStatus(id), 'POSTED');
    assert.equal(savings(memberId), 100000);
});

test('an outcome cannot be changed once settled', () => {
    const id = transfer('DEPOSIT', 40000, 'tx-4');
    assert.equal(settleTransfer(id, 'POSTED'), true);
    assert.equal(settleTransfer(id, 'FAILED', 'late news'), false);
    assert.equal(transferStatus(id), 'POSTED');
    assert.equal(savings(memberId), 100000);
});

test('onboarding webhooks open or fail the member, and are kept for the activity feed', () => {
    db.prepare(`UPDATE members SET onboarding_state = 'PROCESSING' WHERE id = ?`).run(memberId);
    deliver(event('client.onboarded', { platformClientId: 'client-1' }));
    assert.equal(db.prepare('SELECT onboarding_state FROM members WHERE id = ?').get(memberId).onboarding_state, 'ACTIVE');
    assert.equal(db.prepare('SELECT count(*) AS n FROM webhook_events WHERE member_id = ?').get(memberId).n, 1);
});

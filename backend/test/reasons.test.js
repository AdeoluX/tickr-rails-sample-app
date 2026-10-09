import { test } from 'node:test';
import assert from 'node:assert/strict';
import { plainReason } from '../src/reasons.js';

test('keeps the readable sentence from a broker error', () => {
    assert.equal(
        plainReason('MyWealth createCashTransaction failed: {"code":"400","details":"Requested amount {200,000.00} is greater than the maximum allowed value {50,000.00}"}'),
        'Requested amount 200,000.00 is greater than the maximum allowed value 50,000.00'
    );
    assert.equal(plainReason('Error occurred while creating CSCS account: Invalid bank code'), 'Invalid bank code');
});

test('never shows a member a bare technical failure', () => {
    assert.equal(plainReason('MyWealth createClient failed: {"detail":"Failed to read request","status":400}'), 'The broker could not process these details');
});

test('nothing in, nothing out', () => {
    assert.equal(plainReason(null), null);
    assert.equal(plainReason(''), null);
});

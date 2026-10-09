import express from 'express';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { config } from './config.js';
import { db } from './db.js';
import { tickrGet, TickrError } from './tickr.js';
import { createMember, endSession, requireMember, startSession, verifyLogin } from './auth.js';
import {
    cancelOrder, fundInvesting, listTransfers, placeOrder, publicMember, refreshOnboarding, refreshTransfers,
    requireActive, startOnboarding, withdrawToSavings
} from './members.js';
import { handleTickrWebhook, listActivity } from './webhooks.js';

const app = express();

// Webhooks need the exact bytes Tickr Rails signed, so this route reads the raw body
app.post('/webhooks/tickr', express.raw({ type: 'application/json', limit: '1mb' }), handleTickrWebhook);
app.use(express.json({ limit: '100kb' }));

/** Wraps a handler: answers with its result, or with the error's status and message. */
const route = (fn) => async (req, res) => {
    try {
        res.json(await fn(req, res) ?? { ok: true });
    } catch (error) {
        const status = error.status && error.status >= 400 && error.status < 600 ? error.status : 500;
        if (status >= 500) console.error(`[${req.method} ${req.path}]`, error.message);
        // A Tickr Rails 401 or 403 is Coopsaas's misconfiguration, not the member's fault
        const message = error instanceof TickrError && [401, 403].includes(error.status)
            ? 'Investing is unavailable right now. Please try again later.' : error.message;
        res.status(error instanceof TickrError && [401, 403].includes(error.status) ? 503 : status).json({ error: message });
    }
};
const fresh = (req) => db.prepare('SELECT * FROM members WHERE id = ?').get(req.member.id);

// ─── What the app needs to know before sign-in ────────────────────────────────
app.get('/api/config', (_req, res) => res.json({ sandbox: config.sandbox }));

// ─── Account ─────────────────────────────────────────────────────────────────
app.post('/api/auth/signup', route((req, res) => {
    const id = createMember(req.body);
    startSession(res, id);
    return publicMember(db.prepare('SELECT * FROM members WHERE id = ?').get(id));
}));
app.post('/api/auth/login', route((req, res) => {
    const id = verifyLogin(req.body);
    startSession(res, id);
    return publicMember(db.prepare('SELECT * FROM members WHERE id = ?').get(id));
}));
app.post('/api/auth/logout', route((req, res) => { endSession(req, res); }));
app.get('/api/me', requireMember, route(async (req) => {
    const { member, step } = await refreshOnboarding(req.member);
    return { ...publicMember(member), onboardingStep: step };
}));

// ─── Opening an investment account ───────────────────────────────────────────
app.post('/api/onboarding', requireMember, route(async (req) => publicMember(await startOnboarding(req.member, req.body))));

// ─── Home: portfolio, investing cash and coop savings ────────────────────────
app.get('/api/home', requireMember, route(async (req) => {
    requireActive(req.member);
    await refreshTransfers(req.member).catch(() => undefined);
    const id = req.member.platform_client_id;
    const [portfolio, trading] = await Promise.all([
        tickrGet(`/clients/${id}/portfolio-summary`),
        tickrGet(`/clients/${id}/trading-summary`)
    ]);
    return {
        member: publicMember(fresh(req)),
        portfolio: { totalValue: portfolio.totalValue ?? 0, holdings: portfolio.holdings ?? [] },
        cash: { balance: trading.cashBalance ?? portfolio.cashBalance ?? 0, available: trading.availableBalance ?? 0 }
    };
}));

// ─── Markets ─────────────────────────────────────────────────────────────────
const daysAgo = (days) => new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);
let securitiesCache = { at: 0, list: [] };
app.get('/api/markets/securities', requireMember, route(async () => {
    if (Date.now() - securitiesCache.at > 60_000) {
        const page = await tickrGet(`/markets/${config.marketCode}/securities?size=200`);
        securitiesCache = { at: Date.now(), list: page.securities ?? [] };
    }
    return securitiesCache.list;
}));
app.get('/api/markets/securities/:secId', requireMember, route(async (req) => {
    const secId = encodeURIComponent(req.params.secId);
    const [snapshot, history] = await Promise.all([
        tickrGet(`/markets/${config.marketCode}/securities/${secId}/snapshot`).catch(() => null),
        tickrGet(`/markets/${config.marketCode}/securities/${secId}/price-history?startDate=${daysAgo(90)}&endDate=${daysAgo(0)}`).catch(() => null)
    ]);
    return { snapshot, history };
}));
app.get('/api/markets/movers', requireMember, route(async () => {
    const [gainers, losers] = await Promise.all([
        tickrGet(`/markets/${config.marketCode}/top-gainers`).catch(() => []),
        tickrGet(`/markets/${config.marketCode}/top-losers`).catch(() => [])
    ]);
    return { gainers, losers };
}));

// ─── Orders ──────────────────────────────────────────────────────────────────
app.get('/api/orders', requireMember, route(async (req) => {
    requireActive(req.member);
    return tickrGet(`/trades/client/${req.member.platform_client_id}?size=50`);
}));
app.post('/api/orders', requireMember, route((req) => placeOrder(req.member, req.body)));
app.post('/api/orders/:tradeId/cancel', requireMember, route((req) => cancelOrder(req.member, req.params.tradeId)));

// ─── Moving money ────────────────────────────────────────────────────────────
app.get('/api/wallet', requireMember, route(async (req) => {
    if (req.member.onboarding_state === 'ACTIVE') await refreshTransfers(req.member).catch(() => undefined);
    return { savings: publicMember(fresh(req)).savings, transfers: listTransfers(req.member) };
}));
app.post('/api/wallet/fund', requireMember, route((req) => fundInvesting(req.member, req.body.amount)));
app.post('/api/wallet/withdraw', requireMember, route((req) => withdrawToSavings(req.member, req.body.amount)));

// ─── Activity: webhooks from Tickr Rails ─────────────────────────────────────
app.get('/api/activity', requireMember, route((req) => listActivity(req.member.id)));

// ─── The members' app, once built ────────────────────────────────────────────
const web = fileURLToPath(new URL('../../frontend/dist/', import.meta.url));
if (existsSync(web)) {
    app.use(express.static(web));
    app.get(/^\/(?!api|webhooks).*/, (_req, res) => res.sendFile('index.html', { root: web }));
}

// Tests import the app without starting a server
export default app;
if (process.env.NODE_ENV !== 'test') app.listen(config.port, () => {
    console.log(`Coopsaas Invest backend on http://localhost:${config.port}`);
    console.log(`Tickr Rails: ${config.tickrBaseUrl}${config.tickrWebhookSecret ? '' : ' (no webhook secret set: webhooks will be refused)'}`);
});

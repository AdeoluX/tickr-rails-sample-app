import { randomBytes, randomUUID, scryptSync, timingSafeEqual, createHash, createHmac } from 'node:crypto';
import { db } from './db.js';
import { config } from './config.js';

const SESSION_DAYS = 7;
const COOKIE = 'coop_session';

const hashPassword = (password) => {
    const salt = randomBytes(16).toString('hex');
    return `${salt}:${scryptSync(password, salt, 64).toString('hex')}`;
};
const passwordMatches = (password, stored) => {
    const [salt, hash] = stored.split(':');
    const candidate = scryptSync(password, salt, 64);
    return timingSafeEqual(candidate, Buffer.from(hash, 'hex'));
};
const tokenHash = (token) => createHash('sha256').update(token + config.sessionSecret).digest('hex');

export const httpError = (status, message) => Object.assign(new Error(message), { status });

export function createMember({ name, email, password }) {
    name = String(name ?? '').trim();
    email = String(email ?? '').trim().toLowerCase();
    if (name.length < 2) throw httpError(400, 'Enter your name');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw httpError(400, 'Enter a valid email address');
    if (String(password ?? '').length < 8) throw httpError(400, 'Use a password of 8 or more characters');
    if (db.prepare('SELECT 1 FROM members WHERE email = ?').get(email)) throw httpError(409, 'An account with this email already exists');

    const id = randomUUID();
    db.prepare('INSERT INTO members (id, email, name, password_hash, savings_kobo) VALUES (?, ?, ?, ?, ?)')
        .run(id, email, name, hashPassword(password), config.startingSavingsKobo);
    return id;
}

export function verifyLogin({ email, password }) {
    const member = db.prepare('SELECT id, password_hash FROM members WHERE email = ?').get(String(email ?? '').trim().toLowerCase());
    if (!member || !passwordMatches(String(password ?? ''), member.password_hash)) throw httpError(401, 'Email or password is wrong');
    return member.id;
}

export function startSession(res, memberId) {
    const token = randomBytes(32).toString('hex');
    const expires = new Date(Date.now() + SESSION_DAYS * 86_400_000);
    db.prepare('INSERT INTO sessions (token_hash, member_id, expires_at) VALUES (?, ?, ?)').run(tokenHash(token), memberId, expires.toISOString());
    res.cookie(COOKIE, token, { httpOnly: true, sameSite: 'lax', expires, path: '/' });
}

export function endSession(req, res) {
    const token = readCookie(req);
    if (token) db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(tokenHash(token));
    res.clearCookie(COOKIE, { path: '/' });
}

const readCookie = (req) => {
    const header = req.headers.cookie || '';
    const match = header.split(';').map(c => c.trim()).find(c => c.startsWith(`${COOKIE}=`));
    return match ? decodeURIComponent(match.slice(COOKIE.length + 1)) : null;
};

/** Puts the signed-in member on req.member, or answers 401. */
export function requireMember(req, res, next) {
    const token = readCookie(req);
    const row = token && db.prepare(`
        SELECT m.* FROM sessions s JOIN members m ON m.id = s.member_id
        WHERE s.token_hash = ? AND s.expires_at > ?`).get(tokenHash(token), new Date().toISOString());
    if (!row) return res.status(401).json({ error: 'Please sign in' });
    req.member = row;
    next();
}

/** A unique reference for each request Coopsaas sends Tickr Rails, so it can be matched later and never sent twice. */
export const referenceFor = (memberId, kind) =>
    `COOP-${kind}-${createHmac('sha256', config.sessionSecret).update(memberId).digest('hex').slice(0, 6)}-${Date.now().toString(36)}-${randomBytes(2).toString('hex')}`.toUpperCase();

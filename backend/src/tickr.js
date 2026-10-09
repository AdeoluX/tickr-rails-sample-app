import { config } from './config.js';

/** An error from Tickr Rails, with its HTTP status and its own message. */
export class TickrError extends Error {
    constructor(status, message) {
        super(message);
        this.status = status;
    }
}

/**
 * Calls the Tickr Rails API as Coopsaas. Returns the `data` part of the response. Every call carries
 * Coopsaas's API key, which only this server knows.
 */
export async function tickr(method, path, body) {
    let response;
    try {
        response = await fetch(`${config.tickrBaseUrl}/api/v1${path}`, {
            method,
            headers: { 'x-api-key': config.tickrApiKey, ...(body ? { 'Content-Type': 'application/json' } : {}) },
            body: body ? JSON.stringify(body) : undefined,
            signal: AbortSignal.timeout(30_000)
        });
    } catch (error) {
        throw new TickrError(502, `Could not reach Tickr Rails: ${error.cause?.code || error.message}`);
    }

    const json = await response.json().catch(() => ({}));
    if (!response.ok || json.success === false) {
        if (response.status === 429) {
            throw new TickrError(429, `Tickr Rails is busy. Try again in ${response.headers.get('retry-after') || 'a few'} seconds.`);
        }
        throw new TickrError(response.status, json.error || json.message || `Tickr Rails returned ${response.status}`);
    }
    return json.data;
}

export const tickrGet = (path) => tickr('GET', path);
export const tickrPost = (path, body) => tickr('POST', path, body ?? {});

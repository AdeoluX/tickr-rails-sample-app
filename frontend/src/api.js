/** Calls the Coopsaas backend. The browser never sees the Tickr Rails key: the backend holds it. */
export async function api(path, { method = 'GET', body } = {}) {
    const response = await fetch(`/api${path}`, {
        method,
        credentials: 'same-origin',
        headers: body ? { 'Content-Type': 'application/json' } : undefined,
        body: body ? JSON.stringify(body) : undefined
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw Object.assign(new Error(data.error || 'Something went wrong. Please try again.'), { status: response.status });
    return data;
}

export const naira = (value, digits = 2) =>
    `₦${Number(value || 0).toLocaleString('en-NG', { minimumFractionDigits: digits, maximumFractionDigits: digits })}`;

export const when = (value) => {
    if (!value) return '';
    const date = new Date(value.endsWith?.('Z') || value.includes?.('T') ? value : `${value.replace(' ', 'T')}Z`);
    return date.toLocaleString('en-NG', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
};

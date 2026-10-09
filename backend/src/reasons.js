/**
 * Tickr Rails passes on the broker's own error text, such as
 *   MyWealth createCashTransaction failed: {"code":"400","details":"Requested amount {200,000.00} is greater than ..."}
 * Members should never see that. This keeps the readable sentence and drops the technical wrapping.
 */
export function plainReason(reason) {
    if (!reason) return null;
    const text = String(reason);
    const json = text.slice(text.indexOf('{'));
    try {
        const parsed = JSON.parse(json);
        const sentence = parsed.details || parsed.detail || parsed.message || parsed.title;
        if (typeof sentence === 'string' && sentence.trim()) return tidy(sentence);
    } catch { /* not JSON: use the text as it is */ }
    return tidy(text.replace(/^[A-Za-z]+ [A-Za-z]+ failed:\s*/, '').replace(/^Error occurred while [^:]+:\s*/, ''));
}

const tidy = (s) => {
    const clean = s.replace(/[{}]/g, '').replace(/\s+/g, ' ').trim();
    if (/failed to read request|bad request/i.test(clean)) return 'The broker could not process these details';
    return clean.charAt(0).toUpperCase() + clean.slice(1);
};

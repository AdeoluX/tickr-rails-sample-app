/** Settings, read once from the environment. The Tickr Rails key never leaves this server. */
const required = (name) => {
    const value = process.env[name];
    if (!value || value.includes('replace_me')) {
        console.error(`Missing ${name}. Copy .env.example to .env and fill it in.`);
        process.exit(1);
    }
    return value;
};

export const config = {
    port: Number(process.env.PORT || 4100),
    tickrBaseUrl: (process.env.TICKR_BASE_URL || 'http://localhost:3001').replace(/\/$/, ''),
    tickrApiKey: required('TICKR_API_KEY'),
    tickrWebhookSecret: process.env.TICKR_WEBHOOK_SECRET && !process.env.TICKR_WEBHOOK_SECRET.includes('replace_me')
        ? process.env.TICKR_WEBHOOK_SECRET : null,
    sessionSecret: required('SESSION_SECRET'),
    startingSavingsKobo: Math.round(Number(process.env.STARTING_SAVINGS || 1_000_000) * 100),
    /** An optional cap per deposit or withdrawal, in naira. None by default. */
    maxTransferKobo: Number(process.env.MAX_TRANSFER) > 0 ? Math.round(Number(process.env.MAX_TRANSFER) * 100) : null,
    marketCode: 'NGX',
    /** True against a Tickr Rails sandbox: the app offers test details for opening an account. */
    sandbox: process.env.SANDBOX !== 'false'
};

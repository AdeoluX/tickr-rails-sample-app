import { useState } from 'react';
import { api, naira, when } from '../api.js';
import { Sheet, Status, usePoll } from '../components/ui.jsx';
import { brand } from '../brand.js';

const holdingName = (h) => h.symbol || h.secId || h.ticker || h.instrument || h.securityName || 'Holding';
const holdingValue = (h) => Number(h.currentValue ?? h.value ?? h.marketValue ?? 0);

export default function Home({ onOpenStock, toast }) {
    const [home, setHome] = useState(null);
    const [wallet, setWallet] = useState(null);
    const [error, setError] = useState('');
    const [move, setMove] = useState(null); // 'fund' or 'withdraw'

    const load = async () => {
        try {
            const [h, w] = await Promise.all([api('/home'), api('/wallet')]);
            setHome(h); setWallet(w); setError('');
        } catch (err) { setError(err.message); }
    };
    usePoll(load, 15000);

    if (!home) return error ? <div className="error">{error}</div> : <div className="empty"><span className="spinner" /></div>;
    const holdings = home.portfolio.holdings.filter(h => Number(h.quantity) > 0);
    const pending = wallet?.transfers.filter(t => t.status === 'PENDING') ?? [];

    return (
        <>
            {error && <div className="error">{error}</div>}
            <div className="card hero">
                <div className="label">Investments</div>
                <div className="big">{naira(home.portfolio.totalValue + home.cash.balance)}</div>
                <div className="row">
                    <div>Shares<strong>{naira(home.portfolio.totalValue)}</strong></div>
                    <div>Investing cash<strong>{naira(home.cash.available)}</strong></div>
                </div>
                <div className="actions">
                    <button className="btn small light" onClick={() => setMove('fund')}>Add money</button>
                    <button className="btn small light" onClick={() => setMove('withdraw')}>Move to savings</button>
                </div>
            </div>

            <div className="card savings">
                <div>
                    <div className="muted">{brand.savingsName}</div>
                    <div className="amount">{naira(wallet?.savings)}</div>
                </div>
                {pending.length > 0 && <span className="chip wait">{pending.length} transfer{pending.length > 1 ? 's' : ''} in progress</span>}
            </div>

            <div className="section-title">Your shares</div>
            <div className="list">
                {holdings.length === 0 && <div className="empty">No shares yet. Find a stock in Markets to buy your first.</div>}
                {holdings.map((h, i) => (
                    <button className="item" key={i} onClick={() => onOpenStock(holdingName(h))}>
                        <div className="avatar">{holdingName(h).slice(0, 4)}</div>
                        <div className="grow"><div className="name">{holdingName(h)}</div><div className="sub">{Number(h.quantity).toLocaleString()} shares</div></div>
                        <div className="right"><b>{naira(holdingValue(h))}</b></div>
                    </button>
                ))}
            </div>

            {wallet?.transfers.length > 0 && <>
                <div className="section-title">Transfers</div>
                <div className="list">
                    {wallet.transfers.slice(0, 6).map(t => (
                        <div className="item" key={t.id}>
                            <div className="grow">
                                <div className="name">{t.type === 'DEPOSIT' ? 'Savings to investing' : 'Investing to savings'}</div>
                                <div className="sub">{when(t.createdAt)}{t.reason ? ` · ${t.reason}` : ''}</div>
                            </div>
                            <div className="right"><b>{naira(t.amount)}</b><div><Status value={t.status} /></div></div>
                        </div>
                    ))}
                </div>
            </>}

            {move && <MoveMoney kind={move} savings={wallet?.savings ?? 0} available={home.cash.available} limit={home.member.maxTransfer}
                onClose={() => setMove(null)} onDone={(message) => { setMove(null); toast(message); load(); }} />}
        </>
    );
}

function MoveMoney({ kind, savings, available, limit, onClose, onDone }) {
    const fund = kind === 'fund';
    const [amount, setAmount] = useState('');
    const [error, setError] = useState('');
    const [busy, setBusy] = useState(false);
    const max = Math.min(fund ? savings : available, limit || Infinity);

    const submit = async (e) => {
        e.preventDefault();
        setBusy(true); setError('');
        try {
            await api(fund ? '/wallet/fund' : '/wallet/withdraw', { method: 'POST', body: { amount: Number(amount) } });
            onDone(fund ? 'Sent to your investment account. It shows once the broker confirms it.' : `On its way to your ${brand.savingsName.toLowerCase()}.`);
        } catch (err) { setError(err.message); setBusy(false); }
    };

    return (
        <Sheet onClose={onClose}>
            <h2>{fund ? 'Add money to investing' : 'Move money to savings'}</h2>
            <p className="muted">{fund ? `From your ${brand.savingsName.toLowerCase()}: ${naira(savings)} available.` : `From your investing cash: ${naira(available)} available.`}{limit ? ` Up to ${naira(limit, 0)} at a time.` : ''}</p>
            {error && <div className="error">{error}</div>}
            <form onSubmit={submit}>
                <label className="field"><span>Amount in naira</span>
                    <input type="number" min="100" step="0.01" max={max} value={amount} onChange={(e) => setAmount(e.target.value)} autoFocus required />
                </label>
                <div className="actions" style={{ marginTop: 0, marginBottom: 12 }}>
                    {[10000, 50000, 100000].map(v => <button type="button" key={v} className="btn small ghost" onClick={() => setAmount(String(Math.min(v, max)))}>{naira(v, 0)}</button>)}
                </div>
                <button className="btn" disabled={busy || !amount}>{busy ? 'Sending…' : fund ? 'Add money' : 'Move to savings'}</button>
            </form>
        </Sheet>
    );
}

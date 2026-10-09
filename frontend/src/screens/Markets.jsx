import { useEffect, useMemo, useState } from 'react';
import { api, naira } from '../api.js';
import { Sheet, Sparkline } from '../components/ui.jsx';

export default function Markets({ onOpenStock }) {
    const [list, setList] = useState(null);
    const [movers, setMovers] = useState(null);
    const [query, setQuery] = useState('');
    const [error, setError] = useState('');

    useEffect(() => {
        api('/markets/securities').then(setList).catch(err => setError(err.message));
        api('/markets/movers').then(setMovers).catch(() => undefined);
    }, []);

    const shown = useMemo(() => {
        const q = query.trim().toLowerCase();
        const all = (list ?? []).filter(s => s.status === 'ACTIVE' || !s.status);
        return (q ? all.filter(s => s.ticker.toLowerCase().includes(q) || s.name.toLowerCase().includes(q)) : all).slice(0, 60);
    }, [list, query]);

    return (
        <>
            {error && <div className="error">{error}</div>}
            {movers?.gainers?.length > 0 && <>
                <div className="section-title">Top gainers today</div>
                <div className="movers">
                    {movers.gainers.slice(0, 8).map(m => (
                        <button className="mover" key={m.secId} onClick={() => onOpenStock(m.secId)}>
                            <b>{m.secId}</b><span className="up">+{Number(m.percChange).toFixed(1)}%</span><div className="muted">{naira(m.lastPx ?? m.close)}</div>
                        </button>
                    ))}
                </div>
            </>}
            <div className="section-title">Nigerian Exchange</div>
            <input className="search" placeholder="Search stocks, for example MTN or Dangote" value={query} onChange={(e) => setQuery(e.target.value)} />
            <div className="list">
                {!list && !error && <div className="empty"><span className="spinner" /></div>}
                {list && shown.length === 0 && <div className="empty">No stock matches “{query}”.</div>}
                {shown.map(s => (
                    <button className="item" key={s.securityId} onClick={() => onOpenStock(s.ticker)}>
                        <div className="avatar">{s.imageUrl ? <img src={s.imageUrl} alt="" loading="lazy" /> : s.ticker.slice(0, 4)}</div>
                        <div className="grow"><div className="name">{s.ticker}</div><div className="sub">{s.name}</div></div>
                        <div className="right"><b>{naira(s.price)}</b></div>
                    </button>
                ))}
            </div>
        </>
    );
}

/** A stock's quote, recent price line and the buy or sell form. */
export function StockSheet({ ticker, onClose, onPlaced }) {
    const [detail, setDetail] = useState(null);
    const [side, setSide] = useState('buy');
    const [type, setType] = useState('MARKET');
    const [quantity, setQuantity] = useState('');
    const [limit, setLimit] = useState('');
    const [error, setError] = useState('');
    const [busy, setBusy] = useState(false);

    useEffect(() => { api(`/markets/securities/${encodeURIComponent(ticker)}`).then(setDetail).catch(err => setError(err.message)); }, [ticker]);

    const quote = detail?.snapshot;
    const closes = detail?.history?.priceHistory?.map(p => p.close) ?? [];
    const last = Number(quote?.lastPrice || closes[closes.length - 1] || 0);
    const first = closes[0];
    const change = first ? ((last - first) / first) * 100 : null;
    const price = type === 'LIMIT' ? Number(limit) : last;
    const total = (Number(quantity) || 0) * (price || 0);

    const submit = async (e) => {
        e.preventDefault();
        setBusy(true); setError('');
        try {
            await api('/orders', { method: 'POST', body: { instrument: ticker, side, quantity: Number(quantity), priceType: type, limitPrice: Number(limit) || undefined, estimatedPrice: last || undefined } });
            onPlaced(`${side === 'buy' ? 'Buy' : 'Sell'} order for ${quantity} ${ticker} sent to the broker.`);
        } catch (err) { setError(err.message); setBusy(false); }
    };

    return (
        <Sheet onClose={onClose}>
            <h2>{ticker}</h2>
            {!detail && !error && <div className="empty"><span className="spinner" /></div>}
            {detail && <>
                <div className="price">{naira(last)}</div>
                {change !== null && <div className={change >= 0 ? 'up' : 'down'}>{change >= 0 ? '+' : ''}{change.toFixed(1)}% over 3 months</div>}
                <Sparkline points={closes} />
                {quote && <div className="quote">
                    <div><span>Open</span><b>{naira(quote.open)}</b></div>
                    <div><span>High</span><b>{naira(quote.high)}</b></div>
                    <div><span>Low</span><b>{naira(quote.low)}</b></div>
                    <div><span>Best bid</span><b>{naira(quote.bestBidPx)}</b></div>
                    <div><span>Best offer</span><b>{naira(quote.bestOfferPx)}</b></div>
                    <div><span>Volume</span><b>{Number(quote.volume || 0).toLocaleString()}</b></div>
                </div>}
            </>}
            {error && <div className="error">{error}</div>}
            <form onSubmit={submit}>
                <div className="segment">
                    <button type="button" className={side === 'buy' ? 'on' : ''} onClick={() => setSide('buy')}>Buy</button>
                    <button type="button" className={side === 'sell' ? 'on' : ''} onClick={() => setSide('sell')}>Sell</button>
                </div>
                <div className="grid2">
                    <label className="field"><span>Shares</span><input type="number" min="1" step="1" value={quantity} onChange={(e) => setQuantity(e.target.value)} required /></label>
                    <label className="field"><span>Order type</span>
                        <select value={type} onChange={(e) => setType(e.target.value)}><option value="MARKET">At market price</option><option value="LIMIT">At my price</option></select>
                    </label>
                </div>
                {type === 'LIMIT' && <label className="field"><span>Your price per share</span><input type="number" min="0.01" step="0.01" value={limit} onChange={(e) => setLimit(e.target.value)} required /></label>}
                <div className="total"><span>Estimated total</span><b>{naira(total)}</b></div>
                <button className={`btn ${side === 'sell' ? 'sell' : ''}`} disabled={busy || !quantity}>{busy ? 'Placing…' : `${side === 'buy' ? 'Buy' : 'Sell'} ${ticker}`}</button>
                <p className="muted" style={{ textAlign: 'center' }}>Orders last for today. Market orders fill at the best available price.</p>
            </form>
        </Sheet>
    );
}

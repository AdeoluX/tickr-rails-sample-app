import { useState } from 'react';
import { api, naira, when } from '../api.js';
import { Status, usePoll } from '../components/ui.jsx';

const CANCELLABLE = ['PENDING', 'BOOKED', 'EXECUTING'];

export default function Orders({ toast }) {
    const [page, setPage] = useState(null);
    const [error, setError] = useState('');
    const [busy, setBusy] = useState({});

    const load = () => api('/orders').then(p => { setPage(p); setError(''); }).catch(err => setError(err.message));
    usePoll(load, 8000);

    const cancel = async (trade) => {
        setBusy({ ...busy, [trade.id]: true });
        try { await api(`/orders/${trade.id}/cancel`, { method: 'POST' }); toast(`Cancelling your ${trade.instrument} order.`); load(); }
        catch (err) { toast(err.message); }
        finally { setBusy(b => ({ ...b, [trade.id]: false })); }
    };

    if (!page) return error ? <div className="error">{error}</div> : <div className="empty"><span className="spinner" /></div>;
    return (
        <>
            {error && <div className="error">{error}</div>}
            <div className="section-title">Your orders</div>
            <div className="list">
                {page.trades.length === 0 && <div className="empty">No orders yet.</div>}
                {page.trades.map(t => {
                    const price = Number(t.price || t.limitPrice || 0);
                    return (
                        <div className="item" key={t.id}>
                            <div className={`avatar ${t.type === 'sell' ? 'down' : 'up'}`}>{t.type === 'sell' ? 'SELL' : 'BUY'}</div>
                            <div className="grow">
                                <div className="name">{t.quantity.toLocaleString()} {t.instrument}</div>
                                <div className="sub">{t.priceType === 'LIMIT' ? `At ${naira(t.limitPrice)}` : 'At market price'} · {when(t.createdAt)}</div>
                            </div>
                            <div className="right">
                                <Status value={t.status} />
                                {price > 0 && <div className="sub">{naira(price * t.quantity)}</div>}
                                {CANCELLABLE.includes(t.status) && <button className="link" disabled={busy[t.id]} onClick={() => cancel(t)}>Cancel</button>}
                            </div>
                        </div>
                    );
                })}
            </div>
            <p className="muted" style={{ textAlign: 'center' }}>Order statuses update from the broker every few minutes while the market is open.</p>
        </>
    );
}

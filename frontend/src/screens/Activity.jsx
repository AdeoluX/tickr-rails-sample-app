import { useState } from 'react';
import { api, naira, when } from '../api.js';
import { usePoll } from '../components/ui.jsx';
import { brand } from '../brand.js';

/** Plain words for each webhook Tickr Rails sends. */
const describe = (e) => {
    const p = e.payload;
    switch (e.event) {
        case 'client.onboarded': return ['Your investment account is open', 'You can now add money and buy shares.'];
        case 'client.onboarding_failed': return ['We could not open your account', p.reason];
        case 'transaction.successful': return [p.type === 'WITHDRAWAL' ? 'Money moved to savings' : 'Money added to investing', naira(p.amount)];
        case 'transaction.failed': return ['A transfer did not go through', p.reason];
        case 'trade.booked': return ['Order accepted by the broker', `${p.type?.toUpperCase?.() ?? ''} ${p.quantity ?? ''} ${p.instrument ?? ''}`];
        case 'trade.executed': return ['Order filled', `${p.quantity ?? ''} ${p.instrument ?? ''}${p.price ? ` at ${naira(p.price)}` : ''}`];
        case 'trade.updated': return [`Order ${String(p.status || '').toLowerCase().replace('_', ' ')}`, `${p.quantity ?? ''} ${p.instrument ?? ''}`];
        case 'trade.cancelled': return ['Order cancelled', p.instrument];
        case 'trade.cancel_failed': return ['Order could not be cancelled', p.reason];
        case 'trade.failed': return ['Order failed', p.reason];
        default: return [e.event, ''];
    }
};

export default function Activity() {
    const [events, setEvents] = useState(null);
    usePoll(() => api('/activity').then(setEvents).catch(() => undefined), 8000);
    if (!events) return <div className="empty"><span className="spinner" /></div>;
    return (
        <>
            <div className="section-title">Activity</div>
            <div className="list">
                {events.length === 0 && <div className="empty">Updates about your account, transfers and orders appear here.</div>}
                {events.map(e => {
                    const [title, detail] = describe(e);
                    return (
                        <div className="item" key={e.id}>
                            <div className="grow"><div className="name">{title}</div><div className="sub">{detail}</div></div>
                            <div className="right sub">{when(e.occurredAt)}</div>
                        </div>
                    );
                })}
            </div>
            <p className="muted" style={{ textAlign: 'center' }}>Sent by {brand.poweredBy} as signed webhooks, checked before they are shown.</p>
        </>
    );
}

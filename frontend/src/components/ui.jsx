import { useEffect, useState } from 'react';

/** A sheet that slides up from the bottom, like a mobile app. Closes on the scrim or Escape. */
export function Sheet({ onClose, children }) {
    useEffect(() => {
        const key = (e) => e.key === 'Escape' && onClose();
        window.addEventListener('keydown', key);
        return () => window.removeEventListener('keydown', key);
    }, [onClose]);
    return (
        <div className="scrim" onClick={onClose}>
            <div className="sheet" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
                <div className="grab" />
                {children}
            </div>
        </div>
    );
}

/** A short message at the bottom of the screen. */
export function useToast() {
    const [message, setMessage] = useState(null);
    useEffect(() => {
        if (!message) return;
        const t = setTimeout(() => setMessage(null), 3500);
        return () => clearTimeout(t);
    }, [message]);
    return [message ? <div className="toast" role="status">{message}</div> : null, setMessage];
}

/** Runs `fn` now and every `ms`, while the component is on screen. */
export function usePoll(fn, ms, deps = []) {
    useEffect(() => {
        let live = true;
        const run = () => live && fn();
        run();
        const t = setInterval(run, ms);
        return () => { live = false; clearInterval(t); };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, deps);
}

/** A small price line for the last few months. */
export function Sparkline({ points, width = 320, height = 64 }) {
    if (!points || points.length < 2) return null;
    const min = Math.min(...points), max = Math.max(...points);
    const span = max - min || 1;
    const path = points.map((p, i) => `${(i / (points.length - 1)) * width},${height - 4 - ((p - min) / span) * (height - 8)}`).join(' ');
    const rising = points[points.length - 1] >= points[0];
    return (
        <svg viewBox={`0 0 ${width} ${height}`} width="100%" height={height} aria-label={`Price ${rising ? 'up' : 'down'} over the period`}>
            <polyline points={path} fill="none" stroke={rising ? 'var(--up)' : 'var(--down)'} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
        </svg>
    );
}

export const Logo = () => <img src="/favicon.svg" alt="" />;

const STATUS = {
    good: ['EXECUTED', 'POSTED', 'ACTIVE'],
    bad: ['REJECTED', 'FAILED', 'CANCELLED', 'EXPIRED'],
    wait: ['PENDING', 'BOOKED', 'EXECUTING', 'CANCEL_PENDING', 'PROCESSING']
};
const LABEL = { BOOKED: 'Open', EXECUTING: 'Part filled', EXECUTED: 'Filled', CANCEL_PENDING: 'Cancelling', POSTED: 'Done' };
export const Status = ({ value }) => {
    const kind = Object.keys(STATUS).find(k => STATUS[k].includes(value)) || '';
    const text = LABEL[value] || (value ? value[0] + value.slice(1).toLowerCase().replace('_', ' ') : '');
    return <span className={`chip ${kind}`}>{text}</span>;
};

export const Icon = {
    home: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 11l9-7 9 7"/><path d="M5 10v10h14V10"/></svg>,
    markets: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 17l6-6 4 4 8-8"/><path d="M14 7h7v7"/></svg>,
    orders: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 8h8M8 12h8M8 16h5"/></svg>,
    activity: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8a6 6 0 10-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.7 21a2 2 0 01-3.4 0"/></svg>
};

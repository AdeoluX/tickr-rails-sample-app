import { useEffect, useState } from 'react';
import { api } from './api.js';
import { Icon, Logo, useToast } from './components/ui.jsx';
import { brand } from './brand.js';
import Auth from './screens/Auth.jsx';
import { OpenAccount, SettingUp } from './screens/Onboarding.jsx';
import Home from './screens/Home.jsx';
import Markets, { StockSheet } from './screens/Markets.jsx';
import Orders from './screens/Orders.jsx';
import Activity from './screens/Activity.jsx';

const TABS = [['home', 'Home'], ['markets', 'Markets'], ['orders', 'Orders'], ['activity', 'Activity']];

export default function App() {
    const [member, setMember] = useState(undefined); // undefined while loading, null when signed out
    const [tab, setTab] = useState('home');
    const [stock, setStock] = useState(null);
    const [toast, showToast] = useToast();
    const [sandbox, setSandbox] = useState(false);

    useEffect(() => {
        api('/me').then(setMember).catch(() => setMember(null));
        api('/config').then(c => setSandbox(Boolean(c.sandbox))).catch(() => undefined);
    }, []);

    const signOut = async () => { await api('/auth/logout', { method: 'POST' }).catch(() => undefined); setMember(null); setTab('home'); };

    if (member === undefined) return <div className="centre"><span className="spinner" /></div>;
    if (member === null) return <Auth onSignedIn={setMember} />;
    if (member.onboarding.state === 'PROCESSING') return <SettingUp onChange={setMember} />;
    if (member.onboarding.state !== 'ACTIVE') {
        return <OpenAccount member={member} sandbox={sandbox} onStarted={() => setMember({ ...member, onboarding: { state: 'PROCESSING' } })} />;
    }

    return (
        <div className="app">
            <header className="top">
                <div className="brand"><Logo /><div>{brand.name}<small>Hi, {member.name.split(' ')[0]}</small></div></div>
                <button className="link" onClick={signOut}>Sign out</button>
            </header>
            <main>
                {tab === 'home' && <Home onOpenStock={setStock} toast={showToast} />}
                {tab === 'markets' && <Markets onOpenStock={setStock} />}
                {tab === 'orders' && <Orders toast={showToast} />}
                {tab === 'activity' && <Activity />}
            </main>
            <div className="tabs"><nav>
                {TABS.map(([key, label]) => (
                    <button key={key} className={tab === key ? 'on' : ''} onClick={() => setTab(key)} aria-current={tab === key ? 'page' : undefined}>
                        {Icon[key]}{label}
                    </button>
                ))}
            </nav></div>
            {stock && <StockSheet ticker={stock} onClose={() => setStock(null)} onPlaced={(m) => { setStock(null); showToast(m); setTab('orders'); }} />}
            {toast}
        </div>
    );
}

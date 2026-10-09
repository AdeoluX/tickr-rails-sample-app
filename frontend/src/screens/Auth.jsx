import { useState } from 'react';
import { api } from '../api.js';
import { Logo } from '../components/ui.jsx';
import { brand } from '../brand.js';

export default function Auth({ onSignedIn }) {
    const [mode, setMode] = useState('signin');
    const [form, setForm] = useState({ name: '', email: '', password: '' });
    const [error, setError] = useState('');
    const [busy, setBusy] = useState(false);
    const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

    const submit = async (e) => {
        e.preventDefault();
        setBusy(true); setError('');
        try {
            onSignedIn(await api(mode === 'signin' ? '/auth/login' : '/auth/signup', { method: 'POST', body: form }));
        } catch (err) { setError(err.message); } finally { setBusy(false); }
    };

    return (
        <div className="centre">
            <div className="brand"><Logo /><div>{brand.name}<small>{brand.tagline}</small></div></div>
            <h1>{mode === 'signin' ? 'Welcome back' : `Join ${brand.name}`}</h1>
            <p className="lead">{mode === 'signin' ? 'Sign in to see your savings and investments.' : `New members get demo ${brand.savingsName.toLowerCase()} to invest.`}</p>
            <form onSubmit={submit}>
                {error && <div className="error">{error}</div>}
                {mode === 'signup' && <label className="field"><span>Full name</span><input value={form.name} onChange={set('name')} autoComplete="name" required /></label>}
                <label className="field"><span>Email</span><input type="email" value={form.email} onChange={set('email')} autoComplete="email" required /></label>
                <label className="field"><span>Password</span><input type="password" value={form.password} onChange={set('password')} autoComplete={mode === 'signin' ? 'current-password' : 'new-password'} minLength={8} required /></label>
                <button className="btn" disabled={busy}>{busy ? 'Please wait…' : mode === 'signin' ? 'Sign in' : 'Create account'}</button>
            </form>
            <button className="link" style={{ marginTop: 12 }} onClick={() => { setMode(mode === 'signin' ? 'signup' : 'signin'); setError(''); }}>
                {mode === 'signin' ? 'New here? Create an account' : 'Already a member? Sign in'}
            </button>
            <div className="powered">Investing powered by {brand.poweredBy}</div>
        </div>
    );
}

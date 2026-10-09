import { useState } from 'react';
import { api } from '../api.js';
import { Logo, usePoll } from '../components/ui.jsx';
import { brand } from '../brand.js';

/** CBN bank codes, which CSCS expects in the sort code field. */
const BANKS = [['058', 'GTBank'], ['044', 'Access Bank'], ['057', 'Zenith Bank'], ['011', 'First Bank'], ['033', 'UBA'], ['035', 'Wema Bank'], ['232', 'Sterling Bank'], ['050', 'Ecobank']];

const digits = (n) => Array.from({ length: n }, () => Math.floor(Math.random() * 10)).join('');

/** Test details for the sandbox: a fresh BVN each time, since each BVN can be used once. */
const testDetails = (member) => {
    const [first, ...rest] = member.name.split(' ');
    return {
        title: 'MR', firstName: first || 'Ada', lastName: rest.join(' ') || 'Member', phone: `+23480${digits(8)}`,
        gender: 'MALE', maritalStatus: 'SINGLE', dateOfBirth: '1990-05-14', bvn: `22${digits(9)}`,
        mothersMaidenName: 'Okafor', nextOfKinName: 'Chidi Member', nextOfKinPhone: `+23481${digits(8)}`,
        street: '12 Adeola Odeku Street', city: 'Victoria Island', state: 'Lagos', postCode: '101241',
        accountNumber: digits(10), sortCode: '058'
    };
};

export function OpenAccount({ member, sandbox, onStarted }) {
    const [f, setF] = useState({
        title: 'MR', firstName: member.name.split(' ')[0] || '', lastName: member.name.split(' ').slice(1).join(' '), phone: '',
        gender: 'MALE', maritalStatus: 'SINGLE', dateOfBirth: '', bvn: '', mothersMaidenName: '', nextOfKinName: '', nextOfKinPhone: '',
        street: '', city: '', state: 'Lagos', postCode: '', accountNumber: '', sortCode: '058'
    });
    const [error, setError] = useState(member.onboarding.state === 'FAILED' ? `Last attempt failed: ${member.onboarding.error}` : '');
    const [busy, setBusy] = useState(false);
    const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
    const input = (k, label, props = {}) => <label className="field"><span>{label}</span><input value={f[k]} onChange={set(k)} required {...props} /></label>;
    const choose = (k, label, options) => (
        <label className="field"><span>{label}</span>
            <select value={f[k]} onChange={set(k)}>{options.map(([v, t]) => <option key={v} value={v}>{t}</option>)}</select>
        </label>
    );

    const submit = async (e) => {
        e.preventDefault();
        setBusy(true); setError('');
        try {
            await api('/onboarding', { method: 'POST', body: {
                title: f.title, firstName: f.firstName.trim(), lastName: f.lastName.trim(), phone: f.phone.trim(), gender: f.gender,
                maritalStatus: f.maritalStatus, dateOfBirth: f.dateOfBirth, bvn: f.bvn.trim(), mothersMaidenName: f.mothersMaidenName.trim(),
                nextOfKinName: f.nextOfKinName.trim(), nextOfKinPhone: f.nextOfKinPhone.trim(),
                address: { street: f.street, city: f.city, state: f.state, postCode: f.postCode, country: 'NG' },
                bankAccount: { accountNumber: f.accountNumber, sortCode: f.sortCode }
            } });
            onStarted();
        } catch (err) { setError(err.message); setBusy(false); }
    };

    return (
        <div className="centre" style={{ justifyContent: 'flex-start' }}>
            <div className="brand"><Logo /><div>{brand.name}<small>Open your investment account</small></div></div>
            <h1>Open your investment account</h1>
            <p className="lead">We need a few details to open a stockbroking account and a CSCS account in your name. This takes about a minute.</p>
            {sandbox && <div className="note">This is a test environment. <button type="button" className="link" style={{ padding: 0, color: 'var(--brand)', fontWeight: 600 }} onClick={() => setF({ ...f, ...testDetails(member) })}>Fill in test details</button></div>}
            {error && <div className="error">{error}</div>}
            <form onSubmit={submit}>
                <div className="grid2">
                    {choose('title', 'Title', [['MR', 'Mr'], ['MRS', 'Mrs'], ['MS', 'Ms'], ['DR', 'Dr']])}
                    {choose('gender', 'Gender', [['MALE', 'Male'], ['FEMALE', 'Female']])}
                    {input('firstName', 'First name')}
                    {input('lastName', 'Last name')}
                    {input('dateOfBirth', 'Date of birth', { type: 'date' })}
                    {choose('maritalStatus', 'Marital status', [['SINGLE', 'Single'], ['MARRIED', 'Married'], ['DIVORCED', 'Divorced'], ['WIDOWED', 'Widowed']])}
                </div>
                {input('phone', 'Phone number', { placeholder: '+2348031234567', inputMode: 'tel' })}
                {input('bvn', 'BVN', { inputMode: 'numeric', pattern: '\\d{11}', maxLength: 11, title: '11 digits' })}
                {input('mothersMaidenName', "Mother's maiden name")}
                <div className="grid2">
                    {input('nextOfKinName', 'Next of kin')}
                    {input('nextOfKinPhone', 'Next of kin phone', { inputMode: 'tel' })}
                </div>
                {input('street', 'Street address')}
                <div className="grid2">
                    {input('city', 'City')}
                    {input('state', 'State')}
                </div>
                {input('postCode', 'Post code', { inputMode: 'numeric' })}
                <div className="grid2">
                    {input('accountNumber', 'Bank account number', { inputMode: 'numeric', pattern: '\\d{10}', maxLength: 10 })}
                    {choose('sortCode', 'Bank', BANKS.map(([code, name]) => [code, name]))}
                </div>
                <button className="btn" disabled={busy}>{busy ? 'Sending…' : 'Open my account'}</button>
            </form>
            <div className="powered">Your details go to {brand.poweredBy}, our investing partner, to open your accounts.</div>
        </div>
    );
}

const STEPS = [
    ['cscs-creation', 'Creating your CSCS account'],
    ['provider-client-creation', 'Registering you with the stockbroker'],
    ['provider-account-creation', 'Opening your investment account']
];

/** Shown while Tickr Rails opens the accounts. Checks every 3 seconds. */
export function SettingUp({ onChange }) {
    const [step, setStep] = useState(null);
    usePoll(async () => {
        try {
            const me = await api('/me');
            setStep(me.onboardingStep);
            if (me.onboarding.state !== 'PROCESSING') onChange(me);
        } catch { /* try again next time */ }
    }, 3000);
    const at = Math.max(0, STEPS.findIndex(([key]) => key === step));
    return (
        <div className="centre">
            <div className="brand"><Logo /><div>{brand.name}<small>Setting up</small></div></div>
            <h1>Opening your accounts</h1>
            <p className="lead">This usually takes under a minute. You can leave this screen open.</p>
            <ul className="steps">
                {STEPS.map(([key, label], i) => (
                    <li key={key} className={i < at ? 'done' : i === at ? 'now' : ''}><span className="dot">{i < at ? '✓' : ''}</span>{label}</li>
                ))}
            </ul>
        </div>
    );
}

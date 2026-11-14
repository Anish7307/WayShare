import React, { useState } from 'react';
import { api, errorMessage } from '../api';
import { Link } from 'react-router-dom';

export default function PhoneVerification({ user, setUser, Shell }) {
  const [phone, setPhone] = useState(user?.phone || '');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  async function save(e) {
    e.preventDefault();
    setBusy(true); setMessage(''); setError('');
    try {
      const response = await api.patch('/auth/phone', { phone: phone.trim() });
      setUser(response.data.user);
      setMessage(response.data.message);
    } catch (err) { setError(errorMessage(err)); }
    finally { setBusy(false); }
  }

  async function resend() {
    setBusy(true); setMessage(''); setError('');
    try { const response = await api.post('/auth/resend-verification', { email: user.email }); setMessage(response.data.message); }
    catch (err) { setError(errorMessage(err)); }
    finally { setBusy(false); }
  }

  return <Shell><div className="auth-wrap"><section className="auth-card stack"><span className="eyebrow">ACCOUNT & CONTACT</span><h1>Your contact details</h1><p className="muted">Email verification status: <strong>{user?.emailVerified ? 'Verified' : 'Not verified'}</strong></p>{!user?.emailVerified && <button className="btn secondary block" type="button" disabled={busy} onClick={resend}>Resend email verification link</button>}<form className="stack" onSubmit={save}><label>Mobile number (required)<input required type="tel" value={phone} onChange={e=>setPhone(e.target.value)} placeholder="+919876543210" pattern="\+[1-9][0-9]{7,14}"/><small className="muted">Include the country code. Your number is shared with the other rider/driver only after the booking is confirmed.</small></label><button className="btn block" disabled={busy || phone.trim()===user?.phone}>{busy?'Please wait…':'Save mobile number'}</button></form>{message&&<p className="confirmed">{message}</p>}{error&&<p className="error">{error}</p>}<Link to="/dashboard">Back to My trips</Link></section></div></Shell>;
}

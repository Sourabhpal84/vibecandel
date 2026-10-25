'use client'

import { FormEvent, useEffect, useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, ArrowRight } from 'lucide-react'
import { onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword, sendPasswordResetEmail } from 'firebase/auth'
import { doc, setDoc } from 'firebase/firestore'
import { auth, db } from '@/lib/firebase'

export default function AccountLoginPage() {
  const [mode, setMode] = useState<'login' | 'signup'>('login')
  const [name, setName] = useState(''); const [phone, setPhone] = useState(''); const [address, setAddress] = useState(''); const [city, setCity] = useState(''); const [state, setState] = useState('')
  const [email, setEmail] = useState(''); const [password, setPassword] = useState(''); const [error, setError] = useState(''); const [message, setMessage] = useState(''); const [loading, setLoading] = useState(false)
  const getReturnPath = () => { const next = new URLSearchParams(window.location.search).get('next'); return next?.startsWith('/') && !next.startsWith('//') ? next : '/account' }
  useEffect(() => { const requestedMode = new URLSearchParams(window.location.search).get('mode'); if (requestedMode === 'signup') setMode('signup'); if (!auth) return; return onAuthStateChanged(auth, user => { if (user) window.location.href = getReturnPath() }) }, [])
  const submit = async (event: FormEvent) => {
    event.preventDefault(); if (!auth) { setError('Firebase Authentication is not configured.'); return }; setLoading(true); setError(''); setMessage('')
    try {
      if (mode === 'login') await signInWithEmailAndPassword(auth, email, password)
      else {
        const created = await createUserWithEmailAndPassword(auth, email, password)
        await setDoc(doc(db, 'customers', created.user.uid), { name, phone, address, city, state, instructions: '', email, createdAt: new Date().toISOString() }, { merge: true })
      }
      window.location.href = getReturnPath()
    } catch { setError(mode === 'login' ? 'Invalid email or password.' : 'Could not create account. Email may already be registered.') } finally { setLoading(false) }
  }
  const resetPassword = async () => { if (!auth || !email) { setError('Enter your email first.'); return }; try { await sendPasswordResetEmail(auth, email); setMessage('Password reset email sent.') } catch { setError('Could not send password reset email.') } }
  return <main className="admin-login customer-login"><div className="admin-login-card"><Link href="/" className="back-link"><ArrowLeft size={15} /> BACK TO STORE</Link><div className="logo">SHAVIBE <span>CANDLE</span></div><p className="eyebrow">YOUR ACCOUNT</p><h1>{mode === 'login' ? 'Welcome back.' : 'Create account.'}</h1><p className="login-copy">{mode === 'login' ? 'Sign in to track orders and continue checkout.' : 'Add your delivery details once. Checkout will remember them.'}</p>{error && <p className="admin-notice login-error">{error}</p>}{message && <p className="admin-notice">{message}</p>}<form onSubmit={submit} className="login-form">{mode === 'signup' && <><label>Full name<input required autoComplete="name" value={name} onChange={event => setName(event.target.value)} /></label><label>Mobile number<input required autoComplete="tel" type="tel" inputMode="numeric" pattern="[0-9]{10}" maxLength={10} value={phone} onChange={event => setPhone(event.target.value.replace(/\D/g, ''))} /></label><label>Street address<input required autoComplete="street-address" value={address} onChange={event => setAddress(event.target.value)} /></label><label>City<input required autoComplete="address-level2" value={city} onChange={event => setCity(event.target.value)} /></label><label>State<input required autoComplete="address-level1" value={state} onChange={event => setState(event.target.value)} /></label></>}<label>Email<input required autoComplete="email" type="email" value={email} onChange={event => setEmail(event.target.value)} /></label><label>Password<input required minLength={6} type="password" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} value={password} onChange={event => setPassword(event.target.value)} /></label><button className="button button-dark full" disabled={loading}>{loading ? 'PLEASE WAIT…' : mode === 'login' ? 'SIGN IN' : 'CREATE ACCOUNT'} <ArrowRight size={15} /></button></form>{mode === 'login' && <button className="login-switch" onClick={resetPassword}>Forgot password?</button>}<button className="login-switch" onClick={() => setMode(mode === 'login' ? 'signup' : 'login')}>{mode === 'login' ? 'New here? Create an account' : 'Already have an account? Sign in'}</button></div></main>
}

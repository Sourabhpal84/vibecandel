'use client'

import { FormEvent, useState } from 'react'
import { signInWithEmailAndPassword } from 'firebase/auth'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { auth } from '@/lib/firebase'

export default function AdminLoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const submit = async (event: FormEvent) => { event.preventDefault(); setLoading(true); setError(''); try { if (!auth) throw new Error('Authentication is unavailable'); await signInWithEmailAndPassword(auth, email, password); window.location.href = '/admin' } catch { setError('Invalid admin email or password.') } finally { setLoading(false) } }
  return <main className="admin-login"><div className="admin-login-card"><Link href="/" className="back-link"><ArrowLeft size={15} /> BACK TO STORE</Link><div className="logo">LATTEY <span>WALA</span></div><p className="eyebrow">SECURE ADMIN ACCESS</p><h1>Welcome back.</h1><p className="login-copy">Sign in to manage your products, categories and catalogue.</p>{error && <p className="admin-notice login-error">{error}</p>}<form onSubmit={submit} className="login-form"><label>Email<input required type="email" value={email} onChange={event => setEmail(event.target.value)} /></label><label>Password<input required type="password" value={password} onChange={event => setPassword(event.target.value)} /></label><button className="button button-dark full" disabled={loading}>{loading ? 'SIGNING IN…' : 'SIGN IN'} <ArrowLeft size={15} className="arrow-right" /></button></form></div></main>
}

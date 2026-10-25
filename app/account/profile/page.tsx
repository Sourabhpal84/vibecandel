'use client'

import Link from 'next/link'
import { ArrowLeft, ArrowRight } from 'lucide-react'
import { FormEvent, useEffect, useState } from 'react'
import { doc, getDoc, setDoc } from 'firebase/firestore'
import { auth, db } from '@/lib/firebase'

type Profile = { name: string; phone: string; address: string; city: string; state: string; instructions: string }
const empty: Profile = { name: '', phone: '', address: '', city: '', state: '', instructions: '' }

export default function ProfilePage() {
  const [uid, setUid] = useState('')
  const [form, setForm] = useState<Profile>(empty)
  const [addresses, setAddresses] = useState<Array<Profile & { id: string; isDefault?: boolean }>>([])
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    if (!auth) return
    return auth.onAuthStateChanged(async user => {
      if (!user) { window.location.href = '/account/login'; return }
      setUid(user.uid)
      const snapshot = await getDoc(doc(db, 'customers', user.uid))
      const saved = snapshot.data() || {}
      const savedAddresses = Array.isArray(saved.addresses) ? saved.addresses : []
      setAddresses(savedAddresses)
      const primary = savedAddresses.find((address: { isDefault?: boolean }) => address.isDefault) || saved
      setForm({ name: String(primary.name || saved.name || user.displayName || ''), phone: String(primary.phone || saved.phone || ''), address: String(primary.address || saved.address || ''), city: String(primary.city || saved.city || ''), state: String(primary.state || saved.state || ''), instructions: String(primary.instructions || saved.instructions || '') })
      setLoading(false)
    })
  }, [])
  const save = async (event: FormEvent) => {
    event.preventDefault()
    const updatedAddresses = addresses.map(address => address.isDefault ? { ...address, ...form } : address)
    await setDoc(doc(db, 'customers', uid), { ...form, ...(addresses.length ? { addresses: updatedAddresses } : {}), email: auth?.currentUser?.email || '', updatedAt: new Date().toISOString() }, { merge: true })
    setAddresses(updatedAddresses)
    setMessage('Profile and saved address updated.')
  }
  if (loading) return <main className="order-page"><p>Loading profile…</p></main>
  return <main className="order-page"><header className="detail-header"><Link href="/account" className="back-link"><ArrowLeft size={16} /> ACCOUNT</Link><span className="logo">PROFILE</span></header><section className="account-content"><p className="eyebrow">PROFILE & SAVED ADDRESS</p><h1>Your details</h1><p>Save these once; checkout will use them automatically.</p>{message && <p className="admin-notice">{message}</p>}<form className="profile-form" onSubmit={save}><label>Full name<input required value={form.name} onChange={event => setForm({ ...form, name: event.target.value })} /></label><label>Mobile number<input required type="tel" inputMode="numeric" value={form.phone} onChange={event => setForm({ ...form, phone: event.target.value.replace(/\D/g, '').slice(0, 10) })} /></label><label className="wide">Address<textarea required value={form.address} onChange={event => setForm({ ...form, address: event.target.value })} /></label><label>City<input required value={form.city} onChange={event => setForm({ ...form, city: event.target.value })} /></label><label>State<input required value={form.state} onChange={event => setForm({ ...form, state: event.target.value })} /></label><label className="wide">Delivery instructions<textarea value={form.instructions} onChange={event => setForm({ ...form, instructions: event.target.value })} /></label><button className="button button-dark wide" type="submit">SAVE DETAILS <ArrowRight size={16} /></button></form></section></main>
}

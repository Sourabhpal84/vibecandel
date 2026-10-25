'use client'

import Link from 'next/link'
import { ArrowLeft, Plus, Trash2 } from 'lucide-react'
import { FormEvent, useEffect, useState } from 'react'
import { doc, getDoc, setDoc } from 'firebase/firestore'
import { auth, db } from '@/lib/firebase'
import { useToast } from '@/components/toast'

type Address = { id: string; name: string; phone: string; address: string; city: string; state: string; instructions?: string; isDefault?: boolean }
const empty = { name: '', phone: '', address: '', city: '', state: '', instructions: '' }

export default function AddressesPage() {
  const { notify } = useToast(); const [uid, setUid] = useState(''); const [addresses, setAddresses] = useState<Address[]>([]); const [form, setForm] = useState(empty); const [open, setOpen] = useState(false)
  useEffect(() => { if (!auth) return; return auth.onAuthStateChanged(async user => { if (!user) { window.location.href = '/account/login'; return }; setUid(user.uid); const saved = await getDoc(doc(db, 'customers', user.uid)); setAddresses((saved.data()?.addresses || []) as Address[]) }) }, [])
  const save = async (event: FormEvent) => { event.preventDefault(); const next = [...addresses, { ...form, id: crypto.randomUUID(), isDefault: !addresses.length }]; await setDoc(doc(db, 'customers', uid), { addresses: next, updatedAt: new Date().toISOString() }, { merge: true }); setAddresses(next); setForm(empty); setOpen(false); notify({ kind: 'success', title: 'Address saved' }) }
  const persist = async (next: Address[]) => { setAddresses(next); await setDoc(doc(db, 'customers', uid), { addresses: next, updatedAt: new Date().toISOString() }, { merge: true }) }
  return <main className="order-page"><header className="detail-header"><Link href="/account" className="back-link"><ArrowLeft size={16} /> ACCOUNT</Link><span className="logo">ADDRESSES</span></header><section className="account-content"><div className="account-title"><div><p className="eyebrow">SAVED ADDRESSES</p><h1>Delivery addresses</h1></div><button className="button button-dark" onClick={() => setOpen(value => !value)}><Plus size={15} /> ADD ADDRESS</button></div>{open && <form className="profile-form" onSubmit={save}><label>Full name<input required value={form.name} onChange={event => setForm({ ...form, name: event.target.value })} /></label><label>Mobile<input required value={form.phone} onChange={event => setForm({ ...form, phone: event.target.value.replace(/\D/g, '') })} /></label><label className="wide">Full address<textarea required value={form.address} onChange={event => setForm({ ...form, address: event.target.value })} /></label><label>City<input required value={form.city} onChange={event => setForm({ ...form, city: event.target.value })} /></label><label>State<input required value={form.state} onChange={event => setForm({ ...form, state: event.target.value })} /></label><label className="wide">Delivery instructions<textarea value={form.instructions} onChange={event => setForm({ ...form, instructions: event.target.value })} /></label><button className="button button-dark wide">SAVE ADDRESS</button></form>}<div className="address-list">{addresses.map(address => <article className="address-card" key={address.id}><div><b>{address.name}</b>{address.isDefault && <em>DEFAULT</em>}<p>{address.address}<br />{address.city}, {address.state}<br />{address.phone}</p></div><div><button onClick={() => persist(addresses.map(item => ({ ...item, isDefault: item.id === address.id })))}>SET DEFAULT</button><button onClick={() => persist(addresses.filter(item => item.id !== address.id))} aria-label="Delete address"><Trash2 size={16} /></button></div></article>)}</div></section></main>
}

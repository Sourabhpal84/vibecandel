'use client'

import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { FormEvent, useEffect, useState } from 'react'
import { doc, onSnapshot, setDoc } from 'firebase/firestore'
import { auth, db } from '@/lib/firebase'
import { useToast } from '@/components/toast'

export default function DeliveryAreasPage() {
  const { notify } = useToast()
  const [taxRate, setTaxRate] = useState('0')
  const [taxSaving, setTaxSaving] = useState(false)
  useEffect(() => {
    if (!auth) return
    let stop: (() => void) | undefined
    return auth.onAuthStateChanged(user => {
      stop?.()
      if (!user) { window.location.href = '/admin/login'; return }
      stop = onSnapshot(doc(db, 'settings', 'tax'), snapshot => setTaxRate(String(snapshot.data()?.rate ?? 0)))
    })
  }, [])
  const saveTax = async (event: FormEvent) => {
    event.preventDefault()
    const rate = Number(taxRate)
    if (!Number.isFinite(rate) || rate < 0 || rate > 100) return notify({ kind: 'error', title: 'Enter a tax percentage from 0 to 100.' })
    setTaxSaving(true)
    try {
      await setDoc(doc(db, 'settings', 'tax'), { rate, updatedAt: new Date().toISOString() }, { merge: true })
      notify({ kind: 'success', title: 'Tax rate updated', message: `${rate}% will apply to new orders.` })
    } catch { notify({ kind: 'error', title: 'Unable to save tax rate' }) }
    finally { setTaxSaving(false) }
  }
  return <main className="admin-page"><header className="admin-header"><Link href="/admin" className="back-link"><ArrowLeft size={16} /> ADMIN</Link><div className="logo">SHAVIBE <span>CANDLE</span></div><Link className="button button-outline" href="/admin/orders">ORDERS</Link></header><section className="admin-content delivery-areas-page"><div className="admin-intro"><div><p className="eyebrow">DELIVERY</p><h1>Simple delivery pricing</h1><p>Customers can order without entering a pincode.</p></div><span className="admin-status">● LIVE</span></div><aside className="delivery-area-note"><b>Store delivery rule</b><p>₹70 delivery charge for orders below ₹2,000. Delivery is free when the product subtotal is ₹2,000 or more.</p></aside><form className="tax-rate-form" onSubmit={saveTax}><div><p className="eyebrow">ORDER TAX</p><h2>Tax / GST percentage</h2><p>Applied to the product subtotal of every new order. Set 0 for no tax.</p></div><label>Tax rate (%)<input required min="0" max="100" step="0.01" type="number" value={taxRate} onChange={event => setTaxRate(event.target.value)} /></label><button className="button button-dark" disabled={taxSaving}>{taxSaving ? 'SAVING…' : 'SAVE TAX RATE'}</button></form></section></main>
}

'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { ArrowLeft, RefreshCw, Users, WalletCards, UserRound } from 'lucide-react'
import { auth } from '@/lib/firebase'
import { dateTime, money } from '@/components/order-ui'

type Visitor = { id: string; firstSeenAt?: string; lastSeenAt?: string; sessionCount?: number; customer?: { name?: string; email?: string; phone?: string } }
type UnpaidCheckout = { id: string; status: string; createdAt?: string; customer?: { name?: string; email?: string; phone?: string }; deliveryAddress?: { address?: string; city?: string; state?: string }; items?: Array<{ name?: string; quantity?: number }>; totalAmount?: number; abandoned?: boolean }
type Analytics = { stats: { totalVisitors: number; newVisitorsThisMonth: number; unpaidCheckouts: number; abandonedCheckouts: number }; visitors: Visitor[]; unpaidCheckouts: UnpaidCheckout[] }

export default function AnalyticsPage() {
  const [data, setData] = useState<Analytics | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [refreshing, setRefreshing] = useState(false)
  const load = async (user: NonNullable<typeof auth>['currentUser']) => {
    if (!user) return
    setRefreshing(true); setError('')
    try {
      const token = await user.getIdToken()
      const response = await fetch('/api/admin/analytics', { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'Could not load store analytics.')
      setData(result as Analytics)
    } catch (loadError) { setError(loadError instanceof Error ? loadError.message : 'Could not load store analytics.') }
    finally { setLoading(false); setRefreshing(false) }
  }
  useEffect(() => {
    if (!auth) { setError('Firebase Authentication is not configured.'); setLoading(false); return }
    return auth.onAuthStateChanged(user => {
      if (!user) { window.location.href = '/admin/login'; return }
      void load(user)
    })
  }, [])
  return <main className="admin-page"><header className="admin-header"><Link href="/admin" className="back-link"><ArrowLeft size={16}/> ADMIN</Link><div><p className="eyebrow">STORE INSIGHTS</p><h1>Visitors &amp; unpaid checkouts</h1></div><button className="button button-outline" disabled={refreshing} onClick={() => void load(auth?.currentUser || null)}><RefreshCw size={15}/>{refreshing ? 'REFRESHING…' : 'REFRESH'}</button></header><section className="admin-content analytics-page"><p className="analytics-note">Unique browsers are counted using a first-party browser ID. Personal contact details appear only when a visitor is signed in and has saved an account profile. Unpaid checkout attempts stay separate from confirmed orders.</p>{error && <p className="admin-notice">{error}</p>}<div className="analytics-stats">{[
    { label: 'Unique visitors', value: data?.stats.totalVisitors ?? '—', icon: Users },
    { label: 'New this month', value: data?.stats.newVisitorsThisMonth ?? '—', icon: UserRound },
    { label: 'Unpaid checkouts', value: data?.stats.unpaidCheckouts ?? '—', icon: WalletCards },
    { label: 'Likely abandoned', value: data?.stats.abandonedCheckouts ?? '—', icon: WalletCards },
  ].map(stat => { const Icon = stat.icon; return <article key={stat.label}><span><Icon size={18}/></span><small>{stat.label}</small><b>{stat.value}</b></article> })}</div>{loading ? <div className="orders-state">Loading analytics…</div> : <><section className="analytics-section"><div className="admin-section-head"><div><p className="eyebrow">SITE ACTIVITY</p><h2>Recent visitors</h2><p>Latest 100 unique browsers · signed-in account details are shown when available.</p></div></div><div className="analytics-list">{data?.visitors.length ? data.visitors.map(visitor => <article key={visitor.id}><div><b>{visitor.customer?.name || 'Anonymous visitor'}</b><small>{visitor.customer?.email || visitor.customer?.phone || `Visitor ${visitor.id.slice(0, 8)}`}</small></div><span>{visitor.sessionCount || 1} visit{visitor.sessionCount === 1 ? '' : 's'}</span><small>First visit<br/>{dateTime(visitor.firstSeenAt)}</small></article>) : <p className="orders-state">No visits recorded yet.</p>}</div></section><section className="analytics-section"><div className="admin-section-head"><div><p className="eyebrow">PAYMENT NOT COMPLETED</p><h2>Unpaid checkouts</h2><p>Attempts older than 15 minutes or marked failed are counted as likely abandoned.</p></div><Link className="button button-outline" href="/admin/orders">CONFIRMED ORDERS</Link></div><div className="analytics-list analytics-checkouts">{data?.unpaidCheckouts.length ? data.unpaidCheckouts.map(checkout => <article key={checkout.id}><div><b>{checkout.customer?.name || 'Customer'}</b><small>{checkout.customer?.phone || checkout.customer?.email || 'No saved contact details'}</small><small>{checkout.items?.map(item => `${item.name || 'Item'} × ${item.quantity || 1}`).join(' · ') || 'Cart details unavailable'}</small></div><span className={checkout.abandoned ? 'analytics-status abandoned' : 'analytics-status'}>{checkout.abandoned ? 'LIKELY ABANDONED' : 'RECENT ATTEMPT'}</span><b>{money(checkout.totalAmount || 0)}</b><small>{dateTime(checkout.createdAt)}<br/>Payment: {checkout.status}</small></article>) : <p className="orders-state">No unpaid checkout attempts.</p>}</div></section></>}</section></main>
}

import { NextResponse } from 'next/server'
import { getAdminDb, requireUser } from '@/lib/firebase-admin'

export const runtime = 'nodejs'

export async function GET(request: Request) {
  try {
    const identity = await requireUser(request)
    const db = getAdminDb()
    const admin = await db.collection('admins').doc(identity.uid).get()
    if (!admin.exists) return NextResponse.json({ error: 'Admin access required.' }, { status: 403 })

    const monthStart = new Date()
    monthStart.setDate(1)
    monthStart.setHours(0, 0, 0, 0)
    const [totalVisitors, monthlyVisitors, visitorSnapshot, checkoutSnapshot] = await Promise.all([
      db.collection('siteVisitors').count().get(),
      db.collection('siteVisitors').where('firstSeenAt', '>=', monthStart.toISOString()).count().get(),
      db.collection('siteVisitors').orderBy('firstSeenAt', 'desc').limit(100).get(),
      db.collection('checkoutRequests').orderBy('createdAt', 'desc').limit(500).get(),
    ])

    const visitors = visitorSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }))
    const staleBefore = Date.now() - 15 * 60 * 1000
    const unpaidCheckouts = checkoutSnapshot.docs
      .map(doc => ({ id: doc.id, ...doc.data() }))
      .filter((checkout: any) => checkout.status !== 'PAID')
      .map((checkout: any) => ({
        id: checkout.id,
        status: checkout.status || 'PENDING',
        createdAt: checkout.createdAt || '',
        customer: checkout.customer || checkout.orderData?.customer || {},
        deliveryAddress: checkout.deliveryAddress || checkout.orderData?.deliveryAddress || {},
        items: checkout.items || checkout.orderData?.items || [],
        totalAmount: checkout.totalAmount ?? checkout.orderData?.totalAmount ?? 0,
        abandoned: checkout.status === 'FAILED' || Date.parse(checkout.createdAt || '') < staleBefore,
      }))
      .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))

    return NextResponse.json({
      stats: {
        totalVisitors: totalVisitors.data().count,
        newVisitorsThisMonth: monthlyVisitors.data().count,
        unpaidCheckouts: unpaidCheckouts.length,
        abandonedCheckouts: unpaidCheckouts.filter(checkout => checkout.abandoned).length,
      },
      visitors,
      unpaidCheckouts,
    })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to load analytics' }, { status: 400 })
  }
}

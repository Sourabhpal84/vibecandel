import { NextResponse } from 'next/server'
import { FieldValue } from 'firebase-admin/firestore'
import { getAdminAuth, getAdminDb } from '@/lib/firebase-admin'

export const runtime = 'nodejs'

export async function POST(request: Request) {
  try {
    const body = await request.json() as { visitorId?: unknown; sessionId?: unknown }
    const visitorId = String(body.visitorId || '')
    const sessionId = String(body.sessionId || '')
    if (!/^[a-zA-Z0-9_-]{20,100}$/.test(visitorId) || !/^[a-zA-Z0-9_-]{20,100}$/.test(sessionId))
      return NextResponse.json({ error: 'Invalid visit identifiers' }, { status: 400 })

    let customerId = ''
    let customer: { name?: string; email?: string; phone?: string } = {}
    const authorization = request.headers.get('authorization') || ''
    if (authorization.startsWith('Bearer ')) {
      try {
        const identity = await getAdminAuth().verifyIdToken(authorization.slice(7))
        customerId = identity.uid
        const profile = (await getAdminDb().collection('customers').doc(customerId).get()).data() || {}
        customer = {
          name: String(profile.name || identity.name || ''),
          email: String(identity.email || profile.email || ''),
          phone: String(profile.phone || ''),
        }
      } catch { /* Invalid or expired optional auth is treated as an anonymous visit. */ }
    }

    const db = getAdminDb()
    const visitorRef = db.collection('siteVisitors').doc(visitorId)
    const now = new Date().toISOString()
    await db.runTransaction(async transaction => {
      const snapshot = await transaction.get(visitorRef)
      if (!snapshot.exists) {
        transaction.create(visitorRef, {
          firstSeenAt: now,
          lastSeenAt: now,
          lastSessionId: sessionId,
          sessionCount: 1,
          ...(customerId ? { customerId, customer } : {}),
        })
        return
      }
      const previousSession = snapshot.data()?.lastSessionId
      transaction.update(visitorRef, {
        lastSeenAt: now,
        ...(previousSession === sessionId ? {} : { lastSessionId: sessionId, sessionCount: FieldValue.increment(1) }),
        ...(customerId ? { customerId, customer } : {}),
      })
    })
    return NextResponse.json({ recorded: true })
  } catch {
    return NextResponse.json({ error: 'Unable to record visit' }, { status: 500 })
  }
}

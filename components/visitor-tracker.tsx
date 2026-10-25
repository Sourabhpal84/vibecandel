'use client'

import { useEffect } from 'react'
import { usePathname } from 'next/navigation'
import { onAuthStateChanged } from 'firebase/auth'
import { auth } from '@/lib/firebase'

const getId = () => typeof crypto !== 'undefined' && 'randomUUID' in crypto
  ? crypto.randomUUID()
  : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`

export function VisitorTracker() {
  const pathname = usePathname()
  useEffect(() => {
    if (!pathname || pathname.startsWith('/admin')) return
    try {
      let visitorId = localStorage.getItem('shavibe-visitor-id')
      if (!visitorId) { visitorId = getId(); localStorage.setItem('shavibe-visitor-id', visitorId) }
      let sessionId = sessionStorage.getItem('shavibe-visit-session')
      if (!sessionId) { sessionId = getId(); sessionStorage.setItem('shavibe-visit-session', sessionId) }
      const send = async (user?: { getIdToken: () => Promise<string> } | null) => {
        const headers: Record<string, string> = { 'Content-Type': 'application/json' }
        if (user) headers.Authorization = `Bearer ${await user.getIdToken()}`
        await fetch('/api/analytics/visit', { method: 'POST', headers, body: JSON.stringify({ visitorId, sessionId }) })
      }
      if (auth) return onAuthStateChanged(auth, user => { void send(user).catch(() => undefined) })
      void send().catch(() => undefined)
    } catch { /* Tracking is optional; storage or network failures do not affect the storefront. */ }
  }, [pathname])
  return null
}

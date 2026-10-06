'use client'

import { Download, Share, WifiOff, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useToast } from '@/components/toast'

type InstallEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }> }

export function PwaClient() {
  const { notify } = useToast(); const [installEvent, setInstallEvent] = useState<InstallEvent | null>(null); const [ios, setIos] = useState(false); const [dismissed, setDismissed] = useState(true)
  useEffect(() => {
    if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => undefined)
    const standalone = window.matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone
    const wasDismissed = localStorage.getItem('lattey-walla-install-dismissed') === '1'
    setDismissed(wasDismissed || Boolean(standalone))
    const isIos = /iPad|iPhone|iPod/.test(navigator.userAgent) && !standalone
    setIos(isIos)
    const capture = (event: Event) => { event.preventDefault(); if (!wasDismissed && !standalone) setInstallEvent(event as InstallEvent) }
    window.addEventListener('beforeinstallprompt', capture)
    const offline = () => notify({ kind: 'warning', title: 'You are offline', message: 'Reconnect before shopping or placing an order.' })
    const online = () => notify({ kind: 'success', title: 'Back online', message: 'Live updates are available again.' })
    window.addEventListener('offline', offline); window.addEventListener('online', online)
    return () => { window.removeEventListener('beforeinstallprompt', capture); window.removeEventListener('offline', offline); window.removeEventListener('online', online) }
  }, [notify])
  const dismiss = () => { localStorage.setItem('lattey-walla-install-dismissed', '1'); setDismissed(true) }
  const install = async () => { if (!installEvent) return; await installEvent.prompt(); const choice = await installEvent.userChoice; if (choice.outcome === 'accepted') setInstallEvent(null); dismiss() }
  if (dismissed || (!installEvent && !ios)) return null
  return <aside className="pwa-install" role="dialog"><button className="pwa-dismiss" onClick={dismiss} aria-label="Dismiss install prompt"><X size={16} /></button><span className="pwa-icon"><Download size={18} /></span><div><b>Install SHAVIBE CANDLE</b><p>{ios ? <>Tap <Share size={13} /> then <strong>Add to Home Screen</strong> for an app-like experience.</> : 'Get a faster app-like shopping experience.'}</p>{installEvent && <button className="button button-dark" onClick={install}>INSTALL APP</button>}</div></aside>
}

import './globals.css'
import { ToastProvider } from '@/components/toast'
import { PwaClient } from '@/components/pwa-client'
import { VisitorTracker } from '@/components/visitor-tracker'

export const metadata = { title: 'SHAVIBE CANDLE — Good scents. Good moods.', description: 'Discover colourful, feel-good candles made to bring a little warmth, fragrance and glow to your everyday.', applicationName: 'SHAVIBE CANDLE', appleWebApp: { capable: true, statusBarStyle: 'default', title: 'SHAVIBE CANDLE' }, icons: { icon: '/icons/shavibe-candle.svg', apple: '/icons/shavibe-candle.svg' } }

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="en"><body><ToastProvider>{children}<PwaClient /><VisitorTracker /></ToastProvider></body></html>
}

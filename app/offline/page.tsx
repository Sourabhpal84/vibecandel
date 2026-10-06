import Link from 'next/link'

export default function OfflinePage() {
  return <main className="offline-page"><section><p className="eyebrow">SHAVIBE CANDLE</p><h1>You’re offline.</h1><p>Please reconnect to continue shopping, view live updates, or place an order.</p><Link className="button button-dark" href="/">TRY AGAIN</Link></section></main>
}

import Link from "next/link";

export default function HelpPage() {
  return (
    <main className="policy-page">
      <header className="detail-header">
        <Link href="/" className="back-link">← BACK TO STORE</Link>
        <Link href="/" className="logo candle-logo"><span className="logo-sun">✳</span><span>SHAVIBE <i>CANDLE</i></span></Link>
      </header>
      <article className="policy-content">
        <p className="eyebrow">WE ARE HERE TO HELP</p>
        <h1>Help & Support</h1>
        <p>Need help with an order, delivery, payment, return or refund? Contact SHAVIBE CANDLE and include your order number so we can assist you.</p>
        <div className="support-contact">


          <a href="mailto:hello@shavibecandle.com">Email: hello@shavibecandle.com</a>
          <a href="tel:+919821278468">Call: +91 98212 78468</a>
          <Link href="/complaints">Open an order support request</Link>
        </div>
        <p><strong>SHAVIBE CANDLE</strong></p>
      </article>
    </main>
  );
}

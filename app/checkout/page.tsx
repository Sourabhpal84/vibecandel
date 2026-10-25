"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowRight, Minus, Plus, Trash2 } from "lucide-react";
import { auth, db } from "@/lib/firebase";
import { CART_UPDATED_EVENT, CartLine, readCart, writeCart } from "@/lib/cart";
import { doc, getDoc, onSnapshot } from "firebase/firestore";
import { getDeliveryCharge, FREE_DELIVERY_THRESHOLD } from "@/lib/commerce";
import { useToast } from "@/components/toast";

declare global {
  interface Window {
    Razorpay?: new (options: Record<string, unknown>) => { open: () => void };
  }
}
const money = (value: number) => `₹${value.toLocaleString("en-IN")}`;
const PENDING_PAYMENT_KEY = "lattey-wala-pending-payment";
type PendingPayment = { razorpayOrderId: string; internalOrderId?: string };

async function recoverPendingPayment(token: string, razorpayOrderId: string) {
  const response = await fetch("/api/razorpay/reconcile", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ razorpay_order_id: razorpayOrderId }),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || "Unable to verify payment");
  return result as { resolved?: boolean; orderId?: string };
}
const loadRazorpay = () =>
  new Promise<boolean>((resolve) => {
    if (window.Razorpay) return resolve(true);
    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.onload = () => resolve(Boolean(window.Razorpay));
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
  });

export default function CheckoutPage() {
  const { notify } = useToast();
  const [lines, setLines] = useState<CartLine[]>([]);
  const [form, setForm] = useState({
    name: "",
    phone: "",
    address: "",
    city: "",
    state: "",
    instructions: "",
  });
  const [userId, setUserId] = useState("");
  const [userReady, setUserReady] = useState(false);
  const [taxRate, setTaxRate] = useState(0);
  const [couponInput, setCouponInput] = useState("");
  const [appliedCoupon, setAppliedCoupon] = useState<{ code: string; discount: number } | null>(null);
  const [couponMessage, setCouponMessage] = useState("");
  const [couponLoading, setCouponLoading] = useState(false);
  const [error, setError] = useState("");
  const [processing, setProcessing] = useState(false);
  const checkoutKey = useRef(crypto.randomUUID());
  const paymentOpening = useRef(false);
  const paymentVerified = useRef(false);
  useEffect(() => {
    setLines(readCart());
    const sync = () => setLines(readCart());
    window.addEventListener(CART_UPDATED_EVENT, sync);
    return () => window.removeEventListener(CART_UPDATED_EVENT, sync);
  }, []);
  useEffect(() => {
    if (!userReady || !userId || !auth?.currentUser) return;
    let cancelled = false;
    const raw = window.localStorage.getItem(PENDING_PAYMENT_KEY);
    if (!raw) return;
    let pending: PendingPayment | null = null;
    try {
      pending = JSON.parse(raw) as PendingPayment;
    } catch {
      window.localStorage.removeItem(PENDING_PAYMENT_KEY);
      return;
    }
    if (!pending?.razorpayOrderId) return;
    void (async () => {
      try {
        const token = await auth.currentUser!.getIdToken();
        const recovered = await recoverPendingPayment(token, pending!.razorpayOrderId);
        if (cancelled || !recovered.resolved || !recovered.orderId) return;
        window.localStorage.removeItem(PENDING_PAYMENT_KEY);
        writeCart([]);
        window.location.replace(`/order-success/${recovered.orderId}`);
      } catch {
        // The checkout remains usable. The order is also shown as pending in My Orders.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userId, userReady]);
  useEffect(
    () =>
      onSnapshot(doc(db, "settings", "tax"), (snapshot) => {
        const rate = Number(snapshot.data()?.rate);
        setTaxRate(
          Number.isFinite(rate) && rate >= 0 && rate <= 100 ? rate : 0,
        );
      }),
    [],
  );
  useEffect(() => {
    if (!auth) {
      setUserReady(true);
      return;
    }
    return auth.onAuthStateChanged(async (user) => {
      setUserId(user?.uid || "");
      if (user) {
        const customer = await getDoc(doc(db, "customers", user.uid));
        const data = customer.data() || {};
        const saved =
          (data.addresses || []).find(
            (address: { isDefault?: boolean }) => address.isDefault,
          ) || data;
        if (saved?.address)
          setForm({
            name: String(saved.name || ""),
            phone: String(saved.phone || ""),
            address: String(saved.address || ""),
            city: String(saved.city || data.city || ""),
            state: String(saved.state || data.state || ""),
            instructions: String(saved.instructions || ""),
          });
      }
      setUserReady(true);
    });
  }, []);
  const updateQuantity = (index: number, amount: number) => {
    const next = lines
      .map((line, itemIndex) =>
        itemIndex === index
          ? { ...line, quantity: Math.max(0, line.quantity + amount) }
          : line,
      )
      .filter((line) => line.quantity > 0);
    setLines(next);
    writeCart(next);
    if (appliedCoupon) {
      setAppliedCoupon(null);
      setCouponMessage("Your bag changed. Apply the coupon again.");
    }
  };
  const subtotal = useMemo(
    () => lines.reduce((total, line) => total + line.price * line.quantity, 0),
    [lines],
  );
  const applyCoupon = async (event: FormEvent) => {
    event.preventDefault();
    if (couponLoading) return;
    setCouponLoading(true);
    setCouponMessage("");
    try {
      const response = await fetch("/api/coupons/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: couponInput, subtotal }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Unable to apply coupon.");
      setAppliedCoupon({ code: result.code, discount: Number(result.discount) || 0 });
      setCouponInput(result.code);
      setCouponMessage(result.message || "Coupon applied successfully.");
    } catch (couponError) {
      setAppliedCoupon(null);
      setCouponMessage(couponError instanceof Error ? couponError.message : "Unable to apply coupon.");
    } finally {
      setCouponLoading(false);
    }
  };
  const delivery = getDeliveryCharge(subtotal);
  const discount = appliedCoupon?.discount || 0;
  const taxAmount = Math.round((subtotal - discount) * taxRate) / 100;
  const total = subtotal - discount + (delivery ?? 0) + taxAmount;
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (paymentOpening.current) return;
    setError("");
    if (!navigator.onLine)
      return setError("You’re offline. Reconnect before opening payment.");
    if (!lines.length) return setError("Your cart is empty.");
    if (!userReady || !userId || !auth?.currentUser) {
      window.location.href = "/account/login?next=%2Fcheckout";
      return;
    }
    if (!form.name || !form.phone || !form.address || !form.city || !form.state) {
      setError("Add and save your delivery address before placing the order.");
      notify({ kind: "warning", title: "Delivery address needed", message: "Add your name, phone, street address, city and state in your profile, then return here to pay." });
      return;
    }
    paymentOpening.current = true;
    setProcessing(true);
    try {
      const token = await auth.currentUser.getIdToken();
      const createResponse = await fetch("/api/razorpay/create-order", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          items: lines,
          address: form,
          checkoutKey: checkoutKey.current,
          couponCode: appliedCoupon?.code || "",
        }),
      });
      const created = await createResponse.json();
      if (!createResponse.ok)
        throw new Error(created.error || "Unable to start payment");
      window.localStorage.setItem(
        PENDING_PAYMENT_KEY,
        JSON.stringify({
          razorpayOrderId: created.orderId,
          internalOrderId: created.internalOrderId,
        } satisfies PendingPayment),
      );
      if (!(await loadRazorpay()) || !window.Razorpay)
        throw new Error("Payment window could not be loaded");
      const razorpay = new window.Razorpay({
        key: created.keyId,
        amount: created.amount,
        currency: created.currency,
        name: "SHAVIBE CANDLE",
        description: "SHAVIBE CANDLE order",
        order_id: created.orderId,
        prefill: {
          name: form.name,
          contact: form.phone,
          email: auth.currentUser.email || "",
        },
        theme: { color: "#111111" },
        modal: {
          ondismiss: () => {
            paymentOpening.current = false;
            setProcessing(false);
          },
        },
        handler: async (response: {
          razorpay_order_id: string;
          razorpay_payment_id: string;
          razorpay_signature: string;
        }) => {
          if (paymentVerified.current) return;
          paymentVerified.current = true;
          try {
            const verificationToken = await auth.currentUser!.getIdToken();
            const verification = await fetch("/api/razorpay/verify", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${verificationToken}`,
              },
              body: JSON.stringify(response),
            });
            const result = await verification.json();
            if (!verification.ok || !result.verified)
              throw new Error(result.error || "Payment verification failed");
            window.localStorage.removeItem(PENDING_PAYMENT_KEY);
            writeCart([]);
            window.location.href = `/order-success/${result.orderId}`;
          } catch (verificationError) {
            try {
              const token = await auth.currentUser!.getIdToken();
              const recovered = await recoverPendingPayment(
                token,
                response.razorpay_order_id,
              );
              if (recovered.resolved && recovered.orderId) {
                window.localStorage.removeItem(PENDING_PAYMENT_KEY);
                writeCart([]);
                window.location.href = `/order-success/${recovered.orderId}`;
                return;
              }
            } catch {
              // Keep the payment reference locally; it will be retried on return.
            }
            paymentVerified.current = false;
            paymentOpening.current = false;
            setProcessing(false);
            setError(
              verificationError instanceof Error
                ? verificationError.message
                : "Payment verification failed",
            );
          }
        },
      });
      razorpay.open();
    } catch (submitError) {
      paymentOpening.current = false;
      setProcessing(false);
      setError(
        submitError instanceof Error
          ? submitError.message
          : "Unable to start payment",
      );
    }
  };
  if (!lines.length)
    return (
      <main className="checkout-page">
        <header className="detail-header">
          <Link href="/#shop" className="back-link">
            <ArrowLeft size={16} /> BROWSE CANDLES
          </Link>
          <Link href="/" className="logo">
            SHAVIBE <span>CANDLE</span>
          </Link>
          <span className="eyebrow">CHECKOUT</span>
        </header>
        <section className="checkout-empty">
          <p className="eyebrow">YOUR CART</p>
          <h1>Your cart is empty</h1>
          <p>Add a little glow before continuing.</p>
          <Link className="button button-dark" href="/#shop">
            BROWSE CANDLES <ArrowRight size={16} />
          </Link>
        </section>
      </main>
    );
  return (
    <main className="checkout-page">
      <header className="detail-header">
        <Link href="/#shop" className="back-link">
          <ArrowLeft size={16} /> BROWSE CANDLES
        </Link>
        <Link href="/" className="logo">
          SHAVIBE <span>CANDLE</span>
        </Link>
        <span className="eyebrow">CART → DELIVERY → PAYMENT</span>
      </header>
      <div className="food-checkout">
        <section>
          <p className="eyebrow">SAVED DELIVERY DETAILS</p>
          <h1>Place your order</h1>
          <form className="checkout-form" onSubmit={submit}>
            {form.name && form.phone && form.address && form.city && form.state ? <div className="wide saved-checkout-address"><b>Delivering to</b><p>{form.name} · {form.phone}<br />{form.address}<br />{form.city}, {form.state}</p><Link href="/account/profile?next=%2Fcheckout">EDIT SAVED ADDRESS</Link></div> : <div className="wide checkout-address-missing"><b>Delivery address not added yet</b><p>Add your address once. We’ll save it to your account for future orders.</p><Link className="button button-outline" href="/account/profile?next=%2Fcheckout">ADD DELIVERY ADDRESS</Link></div>}
            {error && <p className="checkout-error wide">{error}</p>}
            <button
              className="button button-dark wide checkout-button"
              disabled={processing || !userReady}
              type="submit"
            >
              {processing ? "OPENING PAYMENT…" : "PAY WITH RAZORPAY"}{" "}
              <ArrowRight size={16} />
            </button>
          </form>
        </section>
        <aside className="summary">
          <p className="eyebrow">ORDER SUMMARY</p>
          {lines.map((line, index) => (
            <div
              className="summary-line"
              key={`${line.productId}-${line.color}-${line.size}-${line.sku}`}
            >
              <img src={line.image} alt="" />
              <div>
                <b>{line.name}</b>
                <span>
                  {line.color && `${line.color} · `}{line.size && `${line.size} · `}Qty {line.quantity}
                </span>
                <div className="summary-quantity">
                  <button
                    type="button"
                    onClick={() => updateQuantity(index, -1)}
                  >
                    <Minus size={13} />
                  </button>
                  <b>{line.quantity}</b>
                  <button
                    type="button"
                    onClick={() => updateQuantity(index, 1)}
                  >
                    <Plus size={13} />
                  </button>
                  <button
                    type="button"
                    onClick={() => updateQuantity(index, -line.quantity)}
                    aria-label="Remove item"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
              <strong>{money(line.price * line.quantity)}</strong>
            </div>
          ))}
          <div className="summary-total">
            <p>
              <span>Subtotal</span>
              <b>{money(subtotal)}</b>
            </p>
            <p>
              <span>Coupon{appliedCoupon ? ` · ${appliedCoupon.code}` : " discount"}</span>
              <b>{discount ? `−${money(discount)}` : money(0)}</b>
            </p>
            <p>
              <span>Delivery fee</span>
              <b>
                {delivery === 0
                    ? "FREE"
                    : money(delivery)}
              </b>
            </p>
            <p>
              <span>Tax {taxRate ? `(${taxRate}%)` : ""}</span>
              <b>{money(taxAmount)}</b>
            </p>
            <p className="grand">
              <span>Total</span>
              <b>{money(total)}</b>
            </p>
          </div>
          <form className="coupon-form" onSubmit={applyCoupon}>
            <label htmlFor="coupon-code">HAVE A COUPON?</label>
            <div className="coupon-input-row">
              <input id="coupon-code" value={couponInput} onChange={(event) => { setCouponInput(event.target.value.toUpperCase()); if (appliedCoupon) { setAppliedCoupon(null); setCouponMessage("Cart or code changed. Apply the coupon again."); } }} placeholder="Enter code" autoCapitalize="characters" />
              <button type="submit" disabled={couponLoading || !couponInput.trim()}>{couponLoading ? "CHECKING…" : appliedCoupon ? "APPLIED" : "APPLY"}</button>
            </div>
            {couponMessage && <small className={appliedCoupon ? "coupon-success" : "coupon-error"}>{couponMessage}</small>}
            {appliedCoupon && <button type="button" className="coupon-remove" onClick={() => { setAppliedCoupon(null); setCouponMessage("Coupon removed."); }}>REMOVE COUPON</button>}
          </form>
          <small>
            {`₹70 delivery below ₹${FREE_DELIVERY_THRESHOLD.toLocaleString("en-IN")} · Free delivery on orders of ₹${FREE_DELIVERY_THRESHOLD.toLocaleString("en-IN")} or more.`}
          </small>
        </aside>
      </div>
    </main>
  );
}

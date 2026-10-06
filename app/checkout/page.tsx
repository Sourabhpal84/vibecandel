"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowRight, Minus, Plus, Trash2 } from "lucide-react";
import { auth, db } from "@/lib/firebase";
import { CART_UPDATED_EVENT, CartLine, readCart, writeCart } from "@/lib/cart";
import { collection, doc, getDoc, onSnapshot } from "firebase/firestore";
import { normalizePincode } from "@/lib/commerce";

declare global {
  interface Window {
    Razorpay?: new (options: Record<string, unknown>) => { open: () => void };
  }
}
type DeliveryArea = {
  pincode?: string;
  deliveryCharge?: number;
  freeDeliveryAbove?: number | null;
  enabled?: boolean;
};
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
  const [lines, setLines] = useState<CartLine[]>([]);
  const [form, setForm] = useState({
    name: "",
    phone: "",
    address: "",
    pincode: "",
    instructions: "",
  });
  const [areas, setAreas] = useState<
    Record<
      string,
      { deliveryCharge: number; freeDeliveryAbove?: number | null }
    >
  >({});
  const [userId, setUserId] = useState("");
  const [userReady, setUserReady] = useState(false);
  const [taxRate, setTaxRate] = useState(0);
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
  useEffect(
    () =>
      onSnapshot(collection(db, "serviceAreas"), (snapshot) => {
        const next: Record<
          string,
          { deliveryCharge: number; freeDeliveryAbove?: number | null }
        > = {};
        snapshot.docs.forEach((item) => {
          const area = item.data() as DeliveryArea;
          const pincode = normalizePincode(area.pincode || item.id);
          const charge = Number(area.deliveryCharge);
          if (
            area.enabled !== false &&
            /^\d{6}$/.test(pincode) &&
            Number.isFinite(charge) &&
            charge >= 0
          )
            next[pincode] = {
              deliveryCharge: charge,
              freeDeliveryAbove:
                Number.isFinite(Number(area.freeDeliveryAbove)) &&
                Number(area.freeDeliveryAbove) > 0
                  ? Number(area.freeDeliveryAbove)
                  : null,
            };
        });
        setAreas(next);
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
            pincode: normalizePincode(String(saved.pincode || "")),
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
  };
  const subtotal = useMemo(
    () => lines.reduce((total, line) => total + line.price * line.quantity, 0),
    [lines],
  );
  const pincodeValid = /^\d{6}$/.test(form.pincode);
  const selectedArea = pincodeValid ? areas[form.pincode] : undefined;
  const delivery = selectedArea
    ? selectedArea.freeDeliveryAbove &&
      subtotal >= selectedArea.freeDeliveryAbove
      ? 0
      : selectedArea.deliveryCharge
    : undefined;
  const taxAmount = Math.round(subtotal * taxRate) / 100;
  const total = subtotal + (delivery ?? 0) + taxAmount;
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (paymentOpening.current) return;
    setError("");
    if (!navigator.onLine)
      return setError("You’re offline. Reconnect before opening payment.");
    if (!lines.length) return setError("Your cart is empty.");
    if (!userReady || !userId || !auth?.currentUser) {
      window.location.href = "/account/login";
      return;
    }
    if (delivery === undefined)
      return setError("Delivery is currently unavailable at this pincode.");
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
          <p className="eyebrow">DELIVERY DETAILS</p>
          <h1>Place your order</h1>
          <form className="checkout-form" onSubmit={submit}>
            <label>
              Full name *
              <input
                required
                value={form.name}
                onChange={(event) =>
                  setForm({ ...form, name: event.target.value })
                }
              />
            </label>
            <label>
              Mobile number *
              <input
                required
                type="tel"
                inputMode="numeric"
                pattern="[0-9]{10}"
                maxLength={10}
                value={form.phone}
                onChange={(event) =>
                  setForm({
                    ...form,
                    phone: event.target.value.replace(/\D/g, ""),
                  })
                }
              />
            </label>
            <label className="wide">
              Full address *
              <textarea
                required
                placeholder="Order will be delivered to this address. Please enter complete and correct address details."
                value={form.address}
                onChange={(event) =>
                  setForm({ ...form, address: event.target.value })
                }
              />
            </label>
            <label>
              Pincode *
              <input
                required
                type="text"
                inputMode="numeric"
                pattern="[0-9]{6}"
                maxLength={6}
                value={form.pincode}
                onChange={(event) =>
                  setForm({
                    ...form,
                    pincode: normalizePincode(event.target.value),
                  })
                }
              />
              <small
                className={`field-help ${pincodeValid ? (delivery === undefined ? "pincode-unavailable" : "pincode-available") : ""}`}
              >
                {pincodeValid
                  ? delivery === undefined
                    ? "Delivery is currently unavailable at this pincode."
                    : delivery === 0 && selectedArea?.freeDeliveryAbove
                      ? `Delivery available · FREE on orders above ${money(selectedArea.freeDeliveryAbove)}`
                      : `Delivery available · ${money(delivery)} delivery charge${selectedArea?.freeDeliveryAbove ? ` · FREE above ${money(selectedArea.freeDeliveryAbove)}` : ""}`
                  : "Enter your 6-digit pincode to check delivery availability."}
              </small>
            </label>
            <label className="wide">
              Delivery instructions{" "}
              <textarea
                placeholder="Optional"
                value={form.instructions}
                onChange={(event) =>
                  setForm({ ...form, instructions: event.target.value })
                }
              />
            </label>
            {error && <p className="checkout-error wide">{error}</p>}
            <button
              className="button button-dark wide checkout-button"
              disabled={processing || delivery === undefined}
              type="submit"
            >
              {processing
                ? "OPENING PAYMENT…"
                : delivery === undefined
                  ? "ENTER SERVICEABLE PINCODE"
                  : "PAY WITH RAZORPAY"}{" "}
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
              <span>Delivery fee</span>
              <b>
                {delivery === undefined
                  ? "—"
                  : delivery === 0
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
          <small>
            Delivery charge is set automatically for your exact pincode.
          </small>
        </aside>
      </div>
    </main>
  );
}

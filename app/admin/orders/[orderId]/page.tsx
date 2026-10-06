"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  ArrowLeft,
  MapPin,
  PackageCheck,
  Phone,
  UserRound,
} from "lucide-react";
import {
  arrayUnion,
  doc,
  onSnapshot,
  serverTimestamp,
  updateDoc,
} from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import { dateTime, money, StatusBadge } from "@/components/order-ui";
import { useToast } from "@/components/toast";

const actions: Record<
  string,
  Array<{ label: string; next: string; tone?: string }>
> = {
  NEW: [
    { label: "Accept order", next: "CONFIRMED" },
    { label: "Reject", next: "REJECTED", tone: "danger" },
  ],
  CONFIRMED: [
    { label: "Start preparing", next: "PREPARING" },
    { label: "Cancel order", next: "CANCELLED", tone: "danger" },
  ],
  PREPARING: [{ label: "Mark ready", next: "READY" }],
  READY: [{ label: "Out for delivery", next: "OUT FOR DELIVERY" }],
  "OUT FOR DELIVERY": [{ label: "Mark delivered", next: "DELIVERED" }],
};
type Order = {
  displayOrderId?: string;
  customer?: { name?: string; phone?: string; email?: string };
  deliveryAddress?: {
    address?: string;
    pincode?: string;
    instructions?: string;
  };
  items?: Array<{
    name?: string;
    image?: string;
    color?: string;
    size?: string;
    sku?: string;
    quantity?: number;
    price?: number;
    total?: number;
  }>;
  subtotal?: number;
  discount?: number;
  deliveryCharge?: number;
  totalAmount?: number;
  paymentStatus?: string;
  orderStatus?: string;
  razorpayOrderId?: string;
  razorpayPaymentId?: string;
  createdAt?: string;
  updatedAt?: string;
};

export default function AdminOrderDetail({
  params,
}: {
  params: { orderId: string };
}) {
  const { notify } = useToast();
  const [order, setOrder] = useState<Order | null>(null);
  const [error, setError] = useState("");
  const [ready, setReady] = useState(false);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (!auth) return;
    let stop: (() => void) | undefined;
    return auth.onAuthStateChanged((user) => {
      stop?.();
      if (!user) {
        window.location.href = "/admin/login";
        return;
      }
      stop = onSnapshot(
        doc(db, "orders", params.orderId),
        (snapshot) => {
          if (!snapshot.exists()) setError("Order not found.");
          else setOrder(snapshot.data() as Order);
          setReady(true);
        },
        () => {
          setError("Order details could not be loaded.");
          setReady(true);
        },
      );
    });
  }, [params.orderId]);
  const updateStatus = async (next: string) => {
    if (!order || saving) return;
    setSaving(true);
    try {
      const timestamp = new Date().toISOString();
      await updateDoc(doc(db, "orders", params.orderId), {
        orderStatus: next,
        updatedAt: serverTimestamp(),
        updatedBy: auth?.currentUser?.uid || "",
        statusHistory: arrayUnion({ status: next, timestamp }),
      });
      notify({
        kind: "success",
        title: "Order updated successfully",
        message: `Status changed to ${next}`,
      });
    } catch {
      notify({ kind: "error", title: "Unable to update order" });
    } finally {
      setSaving(false);
    }
  };
  if (!ready)
    return (
      <main className="admin-page">
        <section className="admin-content">
          <div className="orders-state">Loading order details…</div>
        </section>
      </main>
    );
  if (error || !order)
    return (
      <main className="admin-page">
        <section className="admin-content">
          <div className="orders-state error">
            {error || "Order not found."}
          </div>
        </section>
      </main>
    );
  const current = order.orderStatus || "NEW";
  return (
    <main className="admin-page">
      <header className="admin-header">
        <Link href="/admin/orders" className="back-link">
          <ArrowLeft size={16} /> ORDERS
        </Link>
        <div className="logo">
          SHAVIBE <span>CANDLE</span>
        </div>
        <StatusBadge status={current} />
      </header>
      <section className="admin-content order-detail-page">
        <div className="detail-top">
          <div>
            <p className="eyebrow">ORDER</p>
            <h1>#{order.displayOrderId || params.orderId}</h1>
            <small>Placed {dateTime(order.createdAt)}</small>
          </div>
          <div className="order-actions">
            <p className="eyebrow">CURRENT STATUS</p>
            <StatusBadge status={current} />
            <div>
              {(actions[current] || []).map((action) => (
                <button
                  key={action.next}
                  className={`button ${action.tone === "danger" ? "button-danger" : "button-dark"}`}
                  disabled={saving}
                  onClick={() => updateStatus(action.next)}
                >
                  {saving ? "SAVING…" : action.label}
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className="detail-grid-admin">
          <section>
            <h2>
              <UserRound size={18} /> Customer
            </h2>
            <b>{order.customer?.name || "Customer"}</b>
            <p>
              {order.customer?.email || "—"}
              <br />
              {order.customer?.phone || "—"}
            </p>
          </section>
          <section>
            <h2>
              <MapPin size={18} /> Delivery address
            </h2>
            <p>
              {order.deliveryAddress?.address || "—"}
              <br />
              Pincode — {order.deliveryAddress?.pincode || "—"}
            </p>
            {order.deliveryAddress?.instructions && (
              <small>
                Delivery instructions: {order.deliveryAddress.instructions}
              </small>
            )}
          </section>
          <section className="detail-items">
            <h2>
              <PackageCheck size={18} /> Order items
            </h2>
            {order.items?.map((item, index) => (
              <article key={`${item.sku}-${index}`}>
                <img src={item.image || ""} alt="" />
                <div>
                  <b>{item.name}</b>
                  <small>
                    {item.color && `${item.color} · `}{item.size && `${item.size} · `}Qty {item.quantity}
                  </small>
                  <small>₹{item.price} each</small>
                </div>
                <strong>
                  {money(
                    item.total ??
                      Number(item.price || 0) * Number(item.quantity || 1),
                  )}
                </strong>
              </article>
            ))}
          </section>
          <section>
            <h2>
              <Phone size={18} /> Payment
            </h2>
            <p>
              <StatusBadge status={order.paymentStatus} payment />
            </p>
            <small>
              Razorpay order: {order.razorpayOrderId || "—"}
              <br />
              Payment ID: {order.razorpayPaymentId || "—"}
            </small>
          </section>
          <section className="price-summary">
            <h2>Price summary</h2>
            <p>
              <span>Subtotal</span>
              <b>{money(order.subtotal)}</b>
            </p>
            <p>
              <span>Discount</span>
              <b>{money(order.discount)}</b>
            </p>
            <p>
              <span>Delivery (pincode based)</span>
              <b>{money(order.deliveryCharge)}</b>
            </p>
            <p className="grand">
              <span>Grand total</span>
              <b>{money(order.totalAmount)}</b>
            </p>
          </section>
        </div>
      </section>
    </main>
  );
}

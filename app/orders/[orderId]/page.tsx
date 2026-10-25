"use client";

import Link from "next/link";
import { ArrowLeft, MapPin, Package } from "lucide-react";
import { useEffect, useState } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import { money, StatusBadge, TrackingTimeline } from "@/components/order-ui";
import { useToast } from "@/components/toast";

type OrderData = {
  displayOrderId?: string;
  totalAmount?: number;
  subtotal?: number;
  discount?: number;
  couponCode?: string;
  deliveryCharge?: number;
  paymentStatus?: string;
  orderStatus?: string;
  deliveryAddress?: {
    address?: string;
    city?: string;
    state?: string;
    instructions?: string;
  };
  statusHistory?: Array<{ status?: string; timestamp?: string }>;
  items?: Array<{
    name?: string;
    image?: string;
    color?: string;
    size?: string;
    quantity?: number;
    price?: number;
  }>;
};
const cancellable = new Set(["NEW", "CONFIRMED", "PREPARING", "READY"]);
export default function OrderPage({ params }: { params: { orderId: string } }) {
  const { notify } = useToast();
  const [order, setOrder] = useState<OrderData | null>(null);
  const [loading, setLoading] = useState(true);
  const [accessError, setAccessError] = useState("");
  const [cancelling, setCancelling] = useState(false);
  useEffect(() => {
    if (!auth) {
      setLoading(false);
      setAccessError("Please sign in to view this order.");
      return;
    }
    let stop: (() => void) | undefined;
    const stopAuth = auth.onAuthStateChanged((user) => {
      stop?.();
      if (!user) {
        setLoading(false);
        setAccessError("Please sign in to view this order.");
        return;
      }
      stop = onSnapshot(
        doc(db, "orders", params.orderId),
        (snapshot) => {
          if (!snapshot.exists())
            setAccessError("This order could not be found.");
          else setOrder(snapshot.data() as OrderData);
          setLoading(false);
        },
        () => {
          setAccessError("You do not have access to this order.");
          setLoading(false);
        },
      );
    });
    return () => {
      stop?.();
      stopAuth();
    };
  }, [params.orderId]);
  const cancelOrder = async () => {
    if (
      !auth?.currentUser ||
      !confirm("Cancel this order? This is available only before dispatch.")
    )
      return;
    setCancelling(true);
    try {
      const token = await auth.currentUser.getIdToken();
      const response = await fetch("/api/orders/cancel", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ orderId: params.orderId }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      notify({
        kind: "success",
        title: "Order cancelled",
        message: "Your order was cancelled before dispatch.",
      });
    } catch (error) {
      notify({
        kind: "error",
        title: "Unable to cancel order",
        message: error instanceof Error ? error.message : "Please try again.",
      });
    } finally {
      setCancelling(false);
    }
  };
  if (loading)
    return (
      <main className="order-page">
        <section className="order-card">
          <div className="orders-state">Loading your order…</div>
        </section>
      </main>
    );
  if (accessError || !order)
    return (
      <main className="order-page">
        <section className="order-card">
          <h1>Order unavailable.</h1>
          <p>{accessError}</p>
          <Link className="button button-dark" href="/account/login">
            SIGN IN
          </Link>
        </section>
      </main>
    );
  const canCancel = cancellable.has(order.orderStatus || "NEW");
  return (
    <main className="order-page">
      <header className="detail-header">
        <Link href="/orders" className="back-link">
          <ArrowLeft size={16} /> MY ORDERS
        </Link>
        <span className="eyebrow">TRACK ORDER</span>
      </header>
      <section className="customer-order">
        <div className="customer-order-hero">
          <div>
            <p className="eyebrow">
              ORDER #{order.displayOrderId || params.orderId}
            </p>
            <h1>Your order is on its way.</h1>
            <p>We will update you here as your order moves forward.</p>
          </div>
          <StatusBadge status={order.orderStatus} />
        </div>
        <div className="customer-order-grid">
          <section className="tracking-card">
            <p className="eyebrow">LIVE ORDER STATUS</p>
            <TrackingTimeline
              status={order.orderStatus}
              history={order.statusHistory}
            />
          </section>
          <aside className="customer-order-summary">
            <p className="eyebrow">PAYMENT</p>
            <StatusBadge status={order.paymentStatus} payment />
            <strong>{money(order.totalAmount)}</strong>
            <p>
              <span>Subtotal</span>
              <b>{money(order.subtotal)}</b>
            </p>
            {Number(order.discount) > 0 && <p><span>Coupon{order.couponCode ? ` · ${order.couponCode}` : " discount"}</span><b>−{money(order.discount)}</b></p>}
            <p>
              <span>Delivery</span>
              <b>
                {order.deliveryCharge ? money(order.deliveryCharge) : "FREE"}
              </b>
            </p>
          </aside>
          <section className="customer-items">
            <h2>
              <Package size={18} /> Your items
            </h2>
            {order.items?.map((item, index) => (
              <article key={`${item.name}-${index}`}>
                <img src={item.image || ""} alt="" />
                <div>
                  <b>{item.name}</b>
                  <small>
                    {item.color && `${item.color} · `}{item.size && `${item.size} · `}Qty {item.quantity}
                  </small>
                </div>
                <strong>
                  {money(Number(item.price || 0) * Number(item.quantity || 1))}
                </strong>
              </article>
            ))}
          </section>
          <section className="delivery-card">
            <h2>
              <MapPin size={18} /> Delivery address
            </h2>
            <p>
              {order.deliveryAddress?.address}
              <br />
              {order.deliveryAddress?.city}, {order.deliveryAddress?.state}
            </p>
            {order.deliveryAddress?.instructions && (
              <small>{order.deliveryAddress.instructions}</small>
            )}
          </section>
        </div>
        <section className="cancel-order-card">
          <p className="eyebrow">ORDER CANCELLATION</p>
          <h2>{canCancel ? "Changed your mind?" : "Order dispatched"}</h2>
          <p>
            {canCancel
              ? "You can cancel your order before dispatch. Once it is out for delivery, cancellation is disabled."
              : "This order is already out for delivery or completed, so it can no longer be cancelled."}
          </p>
          <button
            className="button button-danger"
            disabled={!canCancel || cancelling}
            onClick={cancelOrder}
          >
            {cancelling
              ? "CANCELLING…"
              : canCancel
                ? "CANCEL ORDER"
                : "CANCELLATION UNAVAILABLE"}
          </button>
        </section>
        <Link className="button button-dark" href="/#shop">
          CONTINUE SHOPPING
        </Link>
      </section>
    </main>
  );
}

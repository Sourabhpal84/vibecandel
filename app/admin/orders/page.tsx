"use client";

import Link from "next/link";
import {
  Search,
  ShoppingBag,
  Truck,
  UtensilsCrossed,
  WalletCards,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { collection, onSnapshot, orderBy, query } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import {
  dateTime,
  money,
  ORDER_STATUSES,
  StatusBadge,
} from "@/components/order-ui";

type AdminOrder = {
  id: string;
  displayOrderId?: string;
  customer?: { name?: string; phone?: string; email?: string };
  items?: unknown[];
  totalAmount?: number;
  paymentStatus?: string;
  orderStatus?: string;
  createdAt?: string;
};
const today = new Date().toDateString();

export default function AdminOrdersPage() {
  const [orders, setOrders] = useState<AdminOrder[]>([]);
  const [filter, setFilter] = useState("ALL");
  const [search, setSearch] = useState("");
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!auth) return;
    return auth.onAuthStateChanged((user) => {
      if (!user) {
        window.location.href = "/admin/login";
        return;
      }
      return onSnapshot(
        query(collection(db, "orders"), orderBy("createdAt", "desc")),
        (snapshot) => {
          setOrders(
            snapshot.docs.map(
              (item) => ({ id: item.id, ...item.data() }) as AdminOrder,
            ),
          );
          setReady(true);
        },
        () => {
          setError(
            "Unable to load orders. Check your admin permissions and try again.",
          );
          setReady(true);
        },
      );
    });
  }, []);
  const paidOrders = useMemo(
    () => orders.filter((order) => order.paymentStatus === "PAID"),
    [orders],
  );
  const visible = useMemo(
    () =>
      paidOrders.filter((order) => {
        const term = search.trim().toLowerCase();
        const searchable = [
          order.displayOrderId,
          order.id,
          order.customer?.name,
          order.customer?.phone,
        ]
          .join(" ")
          .toLowerCase();
        return (
          (filter === "ALL" || order.orderStatus === filter) &&
          (!term || searchable.includes(term))
        );
      }),
    [paidOrders, filter, search],
  );
  const count = (status: string) =>
    paidOrders.filter((order) => order.orderStatus === status).length;
  const revenue = paidOrders
    .filter((order) => new Date(order.createdAt || 0).toDateString() === today)
    .reduce((sum, order) => sum + Number(order.totalAmount || 0), 0);
  const stats = [
    {
      label: "Today's orders",
      value: paidOrders.filter(
        (order) => new Date(order.createdAt || 0).toDateString() === today,
      ).length,
      icon: ShoppingBag,
    },
    {
      label: "Pending",
      value: count("NEW") + count("CONFIRMED"),
      icon: WalletCards,
    },
    { label: "Preparing", value: count("PREPARING"), icon: UtensilsCrossed },
    {
      label: "Out for delivery",
      value: count("OUT FOR DELIVERY"),
      icon: Truck,
    },
    { label: "Delivered", value: count("DELIVERED"), icon: ShoppingBag },
    { label: "Today's revenue", value: money(revenue), icon: WalletCards },
  ];
  return (
    <main className="admin-page">
      <header className="admin-header">
        <div>
          <p className="eyebrow">OPERATIONS</p>
          <h1>Orders</h1>
        </div>
        <div className="admin-header-actions">
          <Link href="/admin" className="button button-outline">
            CATALOGUE
          </Link>
          <Link href="/admin/categories" className="button button-outline">
            CATEGORIES
          </Link>
        </div>
      </header>
      <section className="admin-content orders-dashboard">
        <div className="orders-heading">
          <div>
            <p className="eyebrow">REALTIME ORDER MANAGEMENT</p>
            <h2>Keep every order moving.</h2>
          </div>
          <span className="live-indicator">● LIVE</span>
        </div>
        <div className="order-stats">
          {stats.map((stat) => {
            const Icon = stat.icon;
            return (
              <article key={stat.label}>
                <span>
                  <Icon size={17} />
                </span>
                <small>{stat.label}</small>
                <b>{stat.value}</b>
              </article>
            );
          })}
        </div>
        <div className="order-toolbar">
          <div className="order-search">
            <Search size={17} />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search order, customer or phone"
            />
          </div>
          <div className="order-filters">
            <button
              className={filter === "ALL" ? "active" : ""}
              onClick={() => setFilter("ALL")}
            >
              ALL
            </button>
            {ORDER_STATUSES.map((status) => (
              <button
                className={filter === status ? "active" : ""}
                key={status}
                onClick={() => setFilter(status)}
              >
                {status}
              </button>
            ))}
          </div>
        </div>
        {!ready && <div className="orders-state">Loading live orders…</div>}
        {error && <div className="orders-state error">{error}</div>}
        {ready && !error && (
          <div className="orders-table">
            <div className="orders-table-head">
              <span>Order</span>
              <span>Customer</span>
              <span>Items</span>
              <span>Amount</span>
              <span>Payment</span>
              <span>Status</span>
              <span>Date</span>
              <span />
            </div>
            {visible.length ? (
              visible.map((order) => (
                <article className="order-row" key={order.id}>
                  <div>
                    <b>#{order.displayOrderId || order.id.slice(0, 8)}</b>
                    <small>{order.id.slice(0, 8)}</small>
                  </div>
                  <div>
                    <b>{order.customer?.name || "Customer"}</b>
                    <small>
                      {order.customer?.phone || order.customer?.email || "—"}
                    </small>
                  </div>
                  <span>
                    {order.items?.length || 0} item
                    {(order.items?.length || 0) === 1 ? "" : "s"}
                  </span>
                  <b>{money(order.totalAmount)}</b>
                  <StatusBadge status={order.paymentStatus} payment />
                  <StatusBadge status={order.orderStatus} />
                  <small>{dateTime(order.createdAt)}</small>
                  <Link
                    className="order-view"
                    href={`/admin/orders/${order.id}`}
                  >
                    VIEW
                  </Link>
                </article>
              ))
            ) : (
              <div className="orders-state">No orders found.</div>
            )}
          </div>
        )}
      </section>
    </main>
  );
}

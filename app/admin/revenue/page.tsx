"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { collection, getDocs } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";

type Order = {
  totalAmount?: number;
  paymentMethod?: string;
  paymentStatus?: string;
  paymentVerifiedAt?: string;
  orderStatus?: string;
  deliveredAt?: string;
  createdAt?: string;
};
const money = (value: number) => `₹${value.toLocaleString("en-IN")}`;
const excluded = new Set(["CANCELLED", "REJECTED", "REFUNDED", "FAILED"]);
const countedInRevenue = (order: Order) => {
  const orderStatus = (order.orderStatus || "").toUpperCase();
  const paymentStatus = (order.paymentStatus || "").toUpperCase();
  if (excluded.has(orderStatus) || excluded.has(paymentStatus)) return false;
  if ((order.paymentMethod || "").toUpperCase() === "COD") return orderStatus === "DELIVERED";
  return paymentStatus === "PAID";
};

export default function RevenuePage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    if (!auth) return;
    return auth.onAuthStateChanged(async (user) => {
      if (!user) { window.location.href = "/admin/login"; return; }
      try {
        const snapshot = await getDocs(collection(db, "orders"));
        setOrders(snapshot.docs.map((item) => item.data() as Order));
      } finally { setReady(true); }
    });
  }, []);
  const eligible = useMemo(() => orders.filter(countedInRevenue), [orders]);
  const total = eligible.reduce((sum, order) => sum + Number(order.totalAmount || 0), 0);
  const day = new Date().toISOString().slice(0, 10);
  const today = eligible.filter((order) => String(
    (order.paymentMethod || "").toUpperCase() === "COD"
      ? order.deliveredAt || order.createdAt
      : order.paymentVerifiedAt || order.createdAt,
  ).startsWith(day)).reduce((sum, order) => sum + Number(order.totalAmount || 0), 0);
  return <main className="admin-page"><header className="admin-header"><Link href="/admin" className="back-link">ADMIN</Link><h1>Revenue</h1></header><section className="admin-content"><p className="eyebrow">VERIFIED PAYMENT REVENUE</p>{!ready ? <p>Loading…</p> : <div className="revenue-cards"><div><span>Today</span><b>{money(today)}</b></div><div><span>Total</span><b>{money(total)}</b></div><div><span>Revenue Orders</span><b>{eligible.length}</b></div></div>}</section></main>;
}

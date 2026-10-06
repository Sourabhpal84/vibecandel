"use client";

import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  CircleHelp,
  LogOut,
  MapPin,
  Package,
  ShieldCheck,
  UserRound,
} from "lucide-react";
import { useEffect, useState } from "react";
import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  query,
  where,
} from "firebase/firestore";
import { signOut, User } from "firebase/auth";
import { auth, db } from "@/lib/firebase";
import { useToast } from "@/components/toast";

type Order = {
  id: string;
  displayOrderId?: string;
  totalAmount?: number;
  orderStatus?: string;
  paymentStatus?: string;
};
export default function AccountPage() {
  const { notify } = useToast();
  const [user, setUser] = useState<User | null>(null);
  const [name, setName] = useState("Customer");
  const [orders, setOrders] = useState<Order[]>([]);
  useEffect(() => {
    if (!auth) return;
    let stopOrders: (() => void) | undefined;
    return auth.onAuthStateChanged(async (current) => {
      stopOrders?.();
      setUser(current);
      if (!current) return;
      const profile = await getDoc(doc(db, "customers", current.uid));
      setName(
        String(
          profile.data()?.name ||
            current.displayName ||
            current.email?.split("@")[0] ||
            "Customer",
        ),
      );
      stopOrders = onSnapshot(
        query(collection(db, "orders"), where("customerId", "==", current.uid)),
        (snapshot) =>
          setOrders(
            snapshot.docs
              .map((item) => ({
                id: item.id,
                ...(item.data() as Omit<Order, "id">),
              }))
              .sort((a, b) => b.id.localeCompare(a.id)),
          ),
      );
    });
  }, []);
  const logout = async () => {
    await signOut(auth);
    notify({ kind: "success", title: "Logged out successfully" });
    window.location.href = "/";
  };
  if (!user)
    return (
      <main className="order-page">
        <section className="order-card">
          <p className="eyebrow">YOUR ACCOUNT</p>
          <h1>Welcome to SHAVIBE CANDLE.</h1>
          <p>Sign in to manage your profile, saved addresses and orders.</p>
          <Link className="button button-dark" href="/account/login">
            SIGN IN <ArrowRight size={15} />
          </Link>
        </section>
      </main>
    );
  const recent = orders[0];
  return (
    <main className="order-page">
      <header className="detail-header">
        <Link href="/" className="back-link">
          <ArrowLeft size={16} /> STORE
        </Link>
        <span className="logo">MY ACCOUNT</span>
        <button className="icon" onClick={logout} aria-label="Log out">
          <LogOut size={18} />
        </button>
      </header>
      <section className="account-content">
        <p className="eyebrow">YOUR SPACE</p>
        <h1>Hello, {name}</h1>
        <p className="account-lead">
          Manage your orders, delivery details and account preferences.
        </p>
        {recent && (
          <article className="recent-order">
            <p className="eyebrow">RECENT ORDER</p>
            <b>#{recent.displayOrderId || recent.id}</b>
            <strong>
              ₹{Number(recent.totalAmount || 0).toLocaleString("en-IN")}
            </strong>
            <em>
              {recent.orderStatus || "NEW"} ·{" "}
              {recent.paymentStatus || "PENDING"}
            </em>
            <Link href={`/orders/${recent.id}`}>
              TRACK ORDER <ArrowRight size={15} />
            </Link>
          </article>
        )}
        <div className="account-dashboard">
          <Link href="/orders">
            <Package size={22} />
            <div>
              <b>My Orders</b>
              <span>View your orders and current status</span>
            </div>
            <ArrowRight size={16} />
          </Link>
          <Link href={recent ? `/orders/${recent.id}` : "/orders"}>
            <Package size={22} />
            <div>
              <b>Track Order</b>
              <span>Follow delivery updates in realtime</span>
            </div>
            <ArrowRight size={16} />
          </Link>
          <Link href="/complaints">
            <CircleHelp size={22} />
            <div>
              <b>Help & Complaints</b>
              <span>Payment issue, refund request, or support</span>
            </div>
            <ArrowRight size={16} />
          </Link>
          <Link href="/account/profile">
            <UserRound size={22} />
            <div>
              <b>My Profile</b>
              <span>Name, email and mobile details</span>
            </div>
            <ArrowRight size={16} />
          </Link>
          <Link href="/account/addresses">
            <MapPin size={22} />
            <div>
              <b>Saved Addresses</b>
              <span>Manage your default delivery address</span>
            </div>
            <ArrowRight size={16} />
          </Link>
          <Link href="/account/login">
            <ShieldCheck size={22} />
            <div>
              <b>Login & Security</b>
              <span>Reset or update sign-in information</span>
            </div>
            <ArrowRight size={16} />
          </Link>
          <button onClick={logout}>
            <LogOut size={22} />
            <div>
              <b>Log Out</b>
              <span>Sign out of your account safely</span>
            </div>
            <ArrowRight size={16} />
          </button>
        </div>
      </section>
    </main>
  );
}

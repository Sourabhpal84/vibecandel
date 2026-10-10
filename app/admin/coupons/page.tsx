"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { ArrowLeft, Check, Pencil, Plus, Trash2, X } from "lucide-react";
import { onAuthStateChanged } from "firebase/auth";
import { collection, deleteDoc, doc, onSnapshot, setDoc } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import { Coupon } from "@/lib/coupons";

type CouponRecord = Coupon & { code: string; createdAt?: string };
type CouponForm = { code: string; type: "PERCENT" | "FIXED"; value: string; minOrder: string; maxDiscount: string; startsAt: string; expiresAt: string; usageLimit: string; active: boolean };
const toLocalInput = (value: string) => {
  const date = new Date(value);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
};
const defaultForm = (): CouponForm => ({ code: "", type: "PERCENT", value: "10", minOrder: "0", maxDiscount: "", startsAt: toLocalInput(new Date().toISOString()), expiresAt: toLocalInput(new Date(Date.now() + 30 * 86400000).toISOString()), usageLimit: "", active: true });
const money = (amount: number) => `₹${Number(amount || 0).toLocaleString("en-IN")}`;

export default function AdminCouponsPage() {
  const [ready, setReady] = useState(false);
  const [coupons, setCoupons] = useState<CouponRecord[]>([]);
  const [form, setForm] = useState<CouponForm>(defaultForm());
  const [editing, setEditing] = useState("");
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");

  useEffect(() => {
    if (!auth) return;
    let stop: (() => void) | undefined;
    return onAuthStateChanged(auth, (user) => {
      stop?.();
      if (!user) { window.location.href = "/admin/login"; return; }
      setReady(true);
      stop = onSnapshot(collection(db, "coupons"), (snapshot) => {
        setCoupons(snapshot.docs.map((item) => ({ ...(item.data() as CouponRecord), code: item.id })).sort((a, b) => a.code.localeCompare(b.code)));
      }, (error) => setNotice(error.code === "permission-denied" ? "Firestore denied access. Publish the updated rules and confirm your UID is in /admins/{uid}." : error.message));
    });
    return () => stop?.();
  }, []);

  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (saving) return;
    const code = form.code.trim().toUpperCase().replace(/\s+/g, "");
    const value = Number(form.value), minOrder = Number(form.minOrder || 0);
    const maxDiscount = form.maxDiscount ? Number(form.maxDiscount) : null;
    const usageLimit = form.usageLimit ? Number(form.usageLimit) : null;
    const startsAt = new Date(form.startsAt), expiresAt = new Date(form.expiresAt);
    if (!/^[A-Z0-9_-]{3,32}$/.test(code)) return setNotice("Use 3–32 letters, numbers, hyphens or underscores for the code.");
    if (!Number.isFinite(value) || value <= 0 || (form.type === "PERCENT" && value > 100)) return setNotice("Enter a valid discount value.");
    if (!Number.isFinite(minOrder) || minOrder < 0 || (maxDiscount !== null && (!Number.isFinite(maxDiscount) || maxDiscount <= 0)) || (usageLimit !== null && (!Number.isInteger(usageLimit) || usageLimit < 1))) return setNotice("Check the minimum order, maximum discount and usage limit.");
    if (Number.isNaN(startsAt.getTime()) || Number.isNaN(expiresAt.getTime()) || expiresAt <= startsAt) return setNotice("Set a valid expiry after the start date.");
    setSaving(true); setNotice("");
    try {
      const existing = coupons.find((coupon) => coupon.code === code);
      if (editing && editing !== code && coupons.some((coupon) => coupon.code === code)) throw new Error("A coupon with that code already exists.");
      await setDoc(doc(db, "coupons", code), { code, type: form.type, value, minOrder, maxDiscount, startsAt: startsAt.toISOString(), expiresAt: expiresAt.toISOString(), usageLimit, usageCount: existing?.usageCount || 0, active: form.active, updatedAt: new Date().toISOString(), createdAt: existing?.createdAt || new Date().toISOString() });
      if (editing && editing !== code) await deleteDoc(doc(db, "coupons", editing));
      setNotice(`${code} saved.`); setForm(defaultForm()); setEditing("");
    } catch (error) { setNotice(error instanceof Error ? error.message : "Unable to save coupon."); }
    finally { setSaving(false); }
  };
  const edit = (coupon: CouponRecord) => {
    setEditing(coupon.code);
    setForm({ code: coupon.code, type: coupon.type, value: String(coupon.value), minOrder: String(coupon.minOrder || 0), maxDiscount: coupon.maxDiscount ? String(coupon.maxDiscount) : "", startsAt: toLocalInput(coupon.startsAt || new Date().toISOString()), expiresAt: toLocalInput(coupon.expiresAt || new Date().toISOString()), usageLimit: coupon.usageLimit ? String(coupon.usageLimit) : "", active: coupon.active !== false });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  const remove = async (code: string) => {
    if (!confirm(`Delete coupon ${code}?`)) return;
    try { await deleteDoc(doc(db, "coupons", code)); if (editing === code) { setEditing(""); setForm(defaultForm()); } setNotice(`${code} deleted.`); }
    catch (error) { setNotice(error instanceof Error ? error.message : "Unable to delete coupon."); }
  };

  if (!ready) return <main className="admin-page"/>;
  return <main className="admin-page"><header className="admin-header"><Link href="/admin" className="back-link"><ArrowLeft size={16}/> ADMIN</Link><div className="logo">SHAVIBE <span>CANDLE</span></div><span className="admin-badge">COUPON MANAGER</span></header>
    <section className="coupon-admin">
      <div className="coupon-admin-heading"><div><p className="eyebrow">PROMOTIONS</p><h1>Coupon codes</h1><p>Create percentage or flat discounts customers can apply at checkout.</p></div><Link href="/admin" className="text-link">BACK TO STORE ADMIN</Link></div>
      {notice && <p className="admin-notice">{notice}</p>}
      <form className="coupon-admin-form" onSubmit={save}>
        <h2>{editing ? `Edit ${editing}` : "Create a coupon"}</h2>
        <label>Coupon code<input required maxLength={32} value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase().replace(/\s+/g, "") })} placeholder="e.g. GLOW10"/></label>
        <label>Discount type<select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as CouponForm["type"] })}><option value="PERCENT">Percentage (%)</option><option value="FIXED">Fixed amount (₹)</option></select></label>
        <label>Discount value<input required type="number" min="1" max={form.type === "PERCENT" ? 100 : undefined} value={form.value} onChange={(e) => setForm({ ...form, value: e.target.value })}/></label>
        <label>Minimum order (₹)<input type="number" min="0" value={form.minOrder} onChange={(e) => setForm({ ...form, minOrder: e.target.value })}/></label>
        <label>Maximum discount (₹, optional)<input type="number" min="1" value={form.maxDiscount} onChange={(e) => setForm({ ...form, maxDiscount: e.target.value })}/></label>
        <label>Usage limit (optional)<input type="number" min="1" value={form.usageLimit} onChange={(e) => setForm({ ...form, usageLimit: e.target.value })}/></label>
        <label>Starts at<input required type="datetime-local" value={form.startsAt} onChange={(e) => setForm({ ...form, startsAt: e.target.value })}/></label>
        <label>Expires at<input required type="datetime-local" value={form.expiresAt} onChange={(e) => setForm({ ...form, expiresAt: e.target.value })}/></label>
        <label className="coupon-active"><input type="checkbox" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })}/> Active</label>
        <div className="coupon-admin-buttons"><button className="button button-dark" disabled={saving}><Plus size={15}/>{saving ? "SAVING…" : editing ? "SAVE CHANGES" : "CREATE COUPON"}</button>{editing && <button className="button button-outline" type="button" onClick={() => { setEditing(""); setForm(defaultForm()); }}><X size={15}/> CANCEL</button>}</div>
      </form>
      <div className="coupon-list"><div className="coupon-list-heading"><h2>{coupons.length} coupons</h2></div>{coupons.length ? coupons.map((coupon) => <article key={coupon.code}><div className="coupon-code"><b>{coupon.code}</b><span>{coupon.active === false ? "INACTIVE" : "ACTIVE"}</span></div><p>{coupon.type === "PERCENT" ? `${coupon.value}% off` : `${money(coupon.value)} off`} · Min. order {money(coupon.minOrder || 0)}{coupon.maxDiscount ? ` · Max ${money(coupon.maxDiscount)}` : ""}</p><small>Expires {coupon.expiresAt ? new Date(coupon.expiresAt).toLocaleString() : "—"} · Uses {coupon.usageCount || 0}{coupon.usageLimit ? ` / ${coupon.usageLimit}` : ""}</small><div><button onClick={() => edit(coupon)} aria-label={`Edit ${coupon.code}`}><Pencil size={16}/></button><button onClick={() => void remove(coupon.code)} aria-label={`Delete ${coupon.code}`}><Trash2 size={16}/></button></div></article>) : <p className="coupon-empty"><Check size={18}/> No coupon codes yet.</p>}</div>
    </section>
  </main>;
}

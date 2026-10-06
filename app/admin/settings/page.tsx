"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { doc, getDoc, setDoc } from "firebase/firestore";
import {
  User,
  signOut,
} from "firebase/auth";
import { auth, db } from "@/lib/firebase";

type StoreSettings = {
  storeName: string;
  supportPhone: string;
  deliveryCharge: string;
  freeDeliveryThreshold: string;
  storeOpen: boolean;
  heroImageDesktop: string;
  heroImageMobile: string;
};

const defaults: StoreSettings = {
  storeName: "SHAVIBE CANDLE",
  supportPhone: "",
  deliveryCharge: "99",
  freeDeliveryThreshold: "1999",
  storeOpen: true,
  heroImageDesktop: "",
  heroImageMobile: "",
};

export default function SettingsPage() {
  const [form, setForm] = useState(defaults);
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [adminUser, setAdminUser] = useState<User | null>(null);
  const [security, setSecurity] = useState({ newEmail: "", newPassword: "" });
  const [securityMessage, setSecurityMessage] = useState("");
  const [securitySaving, setSecuritySaving] = useState(false);

  useEffect(() => {
    if (!auth) return;
    return auth.onAuthStateChanged(async (user) => {
      setAdminUser(user);
      if (!user) {
        window.location.href = "/admin/login";
        return;
      }
      try {
        const snapshot = await getDoc(doc(db, "settings", "store"));
        if (snapshot.exists()) {
          const data = snapshot.data();
          setForm((current) => ({
            ...current,
            ...(data as Partial<StoreSettings>),
            heroImageDesktop: String(data.heroImageDesktop || data.heroImage || ""),
            heroImageMobile: String(data.heroImageMobile || ""),
          }));
        }
      } catch (error) {
        setMessage(`Could not load settings: ${String((error as Error).message || error)}`);
      }
    });
  }, []);

  const save = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setMessage("");
    try {
      await setDoc(doc(db, "settings", "store"), {
        ...form,
        deliveryCharge: Number(form.deliveryCharge),
        freeDeliveryThreshold: Number(form.freeDeliveryThreshold),
        updatedAt: new Date().toISOString(),
      }, { merge: true });
      setMessage("Settings saved. The homepage hero updates automatically.");
    } catch (error) {
      setMessage(`Settings were not saved: ${String((error as Error).message || error)}`);
    } finally {
      setSaving(false);
    }
  };

  const updateCredentials = async (event: FormEvent) => {
    event.preventDefault();
    if (!auth || !adminUser) {
      setSecurityMessage("Could not identify the signed-in admin account.");
      return;
    }
    setSecuritySaving(true);
    setSecurityMessage("");
    try {
      const token = await adminUser.getIdToken();
      const response = await fetch("/api/admin/update-credentials", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ email: security.newEmail.trim(), password: security.newPassword }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not update login details.");
      window.alert("Admin email and password updated. Sign in again with the new credentials.");
      await signOut(auth);
      window.location.assign("/admin/login");
    } catch (error) {
      setSecurityMessage(`Could not update login details: ${String((error as Error).message || error)}`);
    } finally {
      setSecuritySaving(false);
    }
  };

  return (
    <main className="admin-page">
      <header className="admin-header">
        <Link href="/admin" className="back-link">ADMIN</Link>
        <h1>Settings</h1>
      </header>
      <section className="admin-content">
        <p className="eyebrow">STORE SETTINGS</p>
        {message && <p className="admin-notice">{message}</p>}
        <form className="admin-form" onSubmit={save}>
          <section className="hero-image-settings wide">
            <p className="eyebrow">HOMEPAGE HERO</p>
            <h2>Background image</h2>
            <p>Use separate public image URLs for desktop and mobile. Images display in full without cropping; empty mobile URL uses the desktop image.</p>
            <label>
              Desktop image URL
              <input
                type="url"
                placeholder="https://example.com/hero.jpg"
                value={form.heroImageDesktop}
                onChange={(event) => setForm({ ...form, heroImageDesktop: event.target.value })}
              />
            </label>
            {form.heroImageDesktop ? (
              <div className="hero-image-preview" style={{ backgroundImage: `linear-gradient(90deg, rgba(0,0,0,.45), rgba(0,0,0,.05)), url("${form.heroImageDesktop.replaceAll('"', '%22')}")` }}>
                <span>Everyday style. <i>Elevated.</i></span>
              </div>
            ) : <p className="hero-image-empty">Current default hero image will be used until you add a desktop URL.</p>}
            <label>
              Mobile image URL
              <input
                type="url"
                placeholder="https://example.com/hero-mobile.jpg"
                value={form.heroImageMobile}
                onChange={(event) => setForm({ ...form, heroImageMobile: event.target.value })}
              />
            </label>
            {form.heroImageMobile && (
              <div className="hero-image-preview hero-image-preview-mobile" style={{ backgroundImage: `linear-gradient(90deg, rgba(0,0,0,.45), rgba(0,0,0,.05)), url("${form.heroImageMobile.replaceAll('"', '%22')}")` }}>
                <span>Everyday style. <i>Elevated.</i></span>
              </div>
            )}
          </section>
          <label>Store name<input value={form.storeName} onChange={(event) => setForm({ ...form, storeName: event.target.value })} /></label>
          <label>Support phone<input value={form.supportPhone} onChange={(event) => setForm({ ...form, supportPhone: event.target.value })} /></label>
          <label>Delivery charge<input type="number" value={form.deliveryCharge} onChange={(event) => setForm({ ...form, deliveryCharge: event.target.value })} /></label>
          <label>Free delivery threshold<input type="number" value={form.freeDeliveryThreshold} onChange={(event) => setForm({ ...form, freeDeliveryThreshold: event.target.value })} /></label>
          <label>Store available<select value={String(form.storeOpen)} onChange={(event) => setForm({ ...form, storeOpen: event.target.value === "true" })}><option value="true">Open</option><option value="false">Closed</option></select></label>
          <button className="button button-dark wide" disabled={saving}>{saving ? "SAVING…" : "SAVE SETTINGS"}</button>
        </form>
        <section className="admin-section security-panel">
          <p className="eyebrow">ADMIN ACCOUNT</p>
          <h2>Change email or password</h2>
          <p className="security-current">Current email: {adminUser?.email || "Loading…"}</p>
          {securityMessage && <p className="admin-notice">{securityMessage}</p>}
          <form className="admin-form" onSubmit={updateCredentials}>
            <label>New email<input required type="email" autoComplete="email" value={security.newEmail} onChange={(event) => setSecurity({ ...security, newEmail: event.target.value })} /></label>
            <label>New password<input required type="password" minLength={6} autoComplete="new-password" value={security.newPassword} onChange={(event) => setSecurity({ ...security, newPassword: event.target.value })} /></label>
            <button className="button button-dark wide" disabled={securitySaving}>{securitySaving ? "UPDATING…" : "SET CLIENT LOGIN DETAILS"}</button>
          </form>
        </section>
      </section>
    </main>
  );
}

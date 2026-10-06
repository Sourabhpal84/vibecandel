"use client";

import Link from "next/link";
import { ArrowLeft, Pencil, Plus, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  setDoc,
} from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import { normalizePincode } from "@/lib/commerce";
import { useToast } from "@/components/toast";

type Area = {
  id: string;
  pincode: string;
  deliveryCharge: number;
  freeDeliveryAbove?: number | null;
};
export default function DeliveryAreasPage() {
  const { notify } = useToast();
  const [areas, setAreas] = useState<Area[]>([]);
  const [form, setForm] = useState({
    pincode: "",
    deliveryCharge: "",
    freeDeliveryAbove: "",
  });
  const [editing, setEditing] = useState("");
  const [saving, setSaving] = useState(false);
  const [taxRate, setTaxRate] = useState("0");
  const [taxSaving, setTaxSaving] = useState(false);
  useEffect(() => {
    if (!auth) return;
    let stop: (() => void) | undefined;
    let stopTax: (() => void) | undefined;
    return auth.onAuthStateChanged((user) => {
      stop?.();
      if (!user) {
        window.location.href = "/admin/login";
        return;
      }
      stop = onSnapshot(
        collection(db, "serviceAreas"),
        (snapshot) =>
          setAreas(
            snapshot.docs
              .map((item) => ({
                id: item.id,
                ...(item.data() as Omit<Area, "id">),
              }))
              .sort((a, b) => a.pincode.localeCompare(b.pincode)),
          ),
        () => notify({ kind: "error", title: "Unable to load delivery areas" }),
      );
      stopTax = onSnapshot(doc(db, "settings", "tax"), (snapshot) =>
        setTaxRate(String(snapshot.data()?.rate ?? 0)),
      );
    });
    return () => {
      stop?.();
      stopTax?.();
    };
  }, [notify]);
  const saveTax = async (event: React.FormEvent) => {
    event.preventDefault();
    const rate = Number(taxRate);
    if (!Number.isFinite(rate) || rate < 0 || rate > 100)
      return notify({
        kind: "error",
        title: "Enter a tax percentage from 0 to 100.",
      });
    setTaxSaving(true);
    try {
      await setDoc(
        doc(db, "settings", "tax"),
        { rate, updatedAt: new Date().toISOString() },
        { merge: true },
      );
      notify({
        kind: "success",
        title: "Tax rate updated",
        message: `${rate}% will apply to new orders.`,
      });
    } catch {
      notify({ kind: "error", title: "Unable to save tax rate" });
    } finally {
      setTaxSaving(false);
    }
  };
  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    if (saving) return;
    const pincode = normalizePincode(form.pincode);
    const deliveryCharge = Number(form.deliveryCharge);
    const freeDeliveryAbove =
      form.freeDeliveryAbove === "" ? null : Number(form.freeDeliveryAbove);
    if (!/^\d{6}$/.test(pincode))
      return notify({ kind: "error", title: "Enter a valid 6-digit pincode" });
    if (!Number.isFinite(deliveryCharge) || deliveryCharge < 0)
      return notify({ kind: "error", title: "Enter a valid delivery charge" });
    if (
      freeDeliveryAbove !== null &&
      (!Number.isFinite(freeDeliveryAbove) || freeDeliveryAbove <= 0)
    )
      return notify({
        kind: "error",
        title:
          "Free delivery amount must be greater than ₹0, or leave it blank.",
      });
    setSaving(true);
    try {
      await setDoc(
        doc(db, "serviceAreas", pincode),
        {
          pincode,
          deliveryCharge,
          freeDeliveryAbove,
          enabled: true,
          updatedAt: new Date().toISOString(),
        },
        { merge: true },
      );
      setForm({ pincode: "", deliveryCharge: "", freeDeliveryAbove: "" });
      setEditing("");
      notify({
        kind: "success",
        title: editing ? "Delivery charge updated" : "Pincode added",
        message: `${pincode} is now serviceable.`,
      });
    } catch {
      notify({ kind: "error", title: "Unable to save pincode" });
    } finally {
      setSaving(false);
    }
  };
  const edit = (area: Area) => {
    setEditing(area.id);
    setForm({
      pincode: area.pincode,
      deliveryCharge: String(area.deliveryCharge),
      freeDeliveryAbove: area.freeDeliveryAbove
        ? String(area.freeDeliveryAbove)
        : "",
    });
  };
  const remove = async (area: Area) => {
    if (
      !confirm(
        `Delete ${area.pincode}? Delivery will stop immediately for this pincode.`,
      )
    )
      return;
    try {
      await deleteDoc(doc(db, "serviceAreas", area.id));
      notify({
        kind: "success",
        title: "Pincode removed",
        message: `${area.pincode} is no longer serviceable.`,
      });
    } catch {
      notify({ kind: "error", title: "Unable to delete pincode" });
    }
  };
  return (
    <main className="admin-page">
      <header className="admin-header">
        <Link href="/admin" className="back-link">
          <ArrowLeft size={16} /> ADMIN
        </Link>
        <div className="logo">
          SHAVIBE <span>CANDLE</span>
        </div>
        <Link className="button button-outline" href="/admin/orders">
          ORDERS
        </Link>
      </header>
      <section className="admin-content delivery-areas-page">
        <div className="admin-intro">
          <div>
            <p className="eyebrow">DELIVERY AREAS</p>
            <h1>Pincode management</h1>
            <p>
              Only pincodes listed here are serviceable. Each one has its own
              exact delivery charge.
            </p>
          </div>
          <span className="admin-status">● LIVE</span>
        </div>
        <div className="delivery-area-layout">
          <form className="delivery-area-form" onSubmit={save}>
            <p className="eyebrow">
              {editing ? "EDIT PINCODE" : "ADD PINCODE"}
            </p>
            <label>
              Pincode
              <input
                required
                inputMode="numeric"
                maxLength={6}
                disabled={Boolean(editing)}
                value={form.pincode}
                onChange={(event) =>
                  setForm({
                    ...form,
                    pincode: normalizePincode(event.target.value),
                  })
                }
                placeholder="6-digit pincode"
              />
            </label>
            <label>
              Delivery charge (₹)
              <input
                required
                min="0"
                type="number"
                value={form.deliveryCharge}
                onChange={(event) =>
                  setForm({ ...form, deliveryCharge: event.target.value })
                }
                placeholder="Example: 49"
              />
            </label>
            <label>
              Free delivery above ₹ (optional)
              <input
                min="1"
                type="number"
                value={form.freeDeliveryAbove}
                onChange={(event) =>
                  setForm({ ...form, freeDeliveryAbove: event.target.value })
                }
                placeholder="Example: 999"
              />
              <small className="field-help">
                Orders at or above this subtotal get free delivery for this
                pincode. Leave blank to always charge delivery.
              </small>
            </label>
            <button className="button button-dark" disabled={saving}>
              {editing ? "SAVE CHARGE" : "ADD PINCODE"} <Plus size={15} />
            </button>
            {editing && (
              <button
                type="button"
                className="button button-outline"
                onClick={() => {
                  setEditing("");
                  setForm({
                    pincode: "",
                    deliveryCharge: "",
                    freeDeliveryAbove: "",
                  });
                }}
              >
                CANCEL
              </button>
            )}
          </form>
          <aside className="delivery-area-note">
            <b>How it works</b>
            <p>
              Customer pincode is checked live against this list. The server
              recalculates the exact delivery charge before payment starts.
            </p>
            <p>Deleting a pincode makes it unavailable immediately.</p>
          </aside>
        </div>
        <form className="tax-rate-form" onSubmit={saveTax}>
          <div>
            <p className="eyebrow">ORDER TAX</p>
            <h2>Tax / GST percentage</h2>
            <p>
              Applied to the product subtotal of every new order. Set 0 for no
              tax.
            </p>
          </div>
          <label>
            Tax rate (%)
            <input
              required
              min="0"
              max="100"
              step="0.01"
              type="number"
              value={taxRate}
              onChange={(event) => setTaxRate(event.target.value)}
            />
          </label>
          <button className="button button-dark" disabled={taxSaving}>
            {taxSaving ? "SAVING…" : "SAVE TAX RATE"}
          </button>
        </form>
        <div className="delivery-areas-list">
          <div className="delivery-areas-head">
            <span>PINCODE</span>
            <span>DELIVERY CHARGE</span>
            <span>FREE ABOVE</span>
            <span>ACTIONS</span>
          </div>
          {areas.length ? (
            areas.map((area) => (
              <article key={area.id}>
                <b>{area.pincode}</b>
                <strong>
                  ₹{Number(area.deliveryCharge || 0).toLocaleString("en-IN")}
                </strong>
                <span>
                  {area.freeDeliveryAbove
                    ? `₹${Number(area.freeDeliveryAbove).toLocaleString("en-IN")}`
                    : "—"}
                </span>
                <div>
                  <button
                    aria-label={`Edit ${area.pincode}`}
                    onClick={() => edit(area)}
                  >
                    <Pencil size={16} />
                  </button>
                  <button
                    aria-label={`Delete ${area.pincode}`}
                    onClick={() => remove(area)}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </article>
            ))
          ) : (
            <div className="orders-state">
              No serviceable pincodes yet. Add one above to begin.
            </div>
          )}
        </div>
      </section>
    </main>
  );
}

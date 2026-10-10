export type Coupon = {
  code: string;
  type: "PERCENT" | "FIXED";
  value: number;
  minOrder?: number;
  maxDiscount?: number | null;
  startsAt?: string;
  expiresAt?: string;
  usageLimit?: number | null;
  usageCount?: number;
  active?: boolean;
};

export function calculateCouponDiscount(coupon: Coupon, subtotal: number, now = Date.now()) {
  if (coupon.active === false) throw new Error("This coupon is inactive.");
  const startsAt = coupon.startsAt ? Date.parse(coupon.startsAt) : Number.NaN;
  const expiresAt = coupon.expiresAt ? Date.parse(coupon.expiresAt) : Number.NaN;
  if (Number.isFinite(startsAt) && now < startsAt) throw new Error("This coupon is not active yet.");
  if (Number.isFinite(expiresAt) && now > expiresAt) throw new Error("This coupon has expired.");
  if (Number(coupon.usageLimit) > 0 && Number(coupon.usageCount || 0) >= Number(coupon.usageLimit))
    throw new Error("This coupon has reached its usage limit.");
  if (!Number.isFinite(subtotal) || subtotal < Math.max(0, Number(coupon.minOrder) || 0))
    throw new Error(`Add items worth ₹${Math.max(0, Number(coupon.minOrder) || 0).toLocaleString("en-IN")} to use this coupon.`);
  const value = Number(coupon.value);
  if (!Number.isFinite(value) || value <= 0 || (coupon.type === "PERCENT" && value > 100))
    throw new Error("This coupon is not configured correctly.");
  const raw = coupon.type === "PERCENT" ? Math.floor((subtotal * value) / 100) : Math.floor(value);
  const cap = Number(coupon.maxDiscount);
  return Math.max(0, Math.min(subtotal, raw, Number.isFinite(cap) && cap > 0 ? cap : subtotal));
}

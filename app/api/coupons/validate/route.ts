import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase-admin";
import { calculateCouponDiscount, Coupon } from "@/lib/coupons";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { code?: string; subtotal?: number };
    const code = String(body.code || "").trim().toUpperCase().replace(/\s+/g, "");
    const subtotal = Number(body.subtotal);
    if (!/^[A-Z0-9_-]{3,32}$/.test(code) || !Number.isFinite(subtotal) || subtotal < 0)
      return NextResponse.json({ error: "Enter a valid coupon code." }, { status: 400 });
    const snapshot = await getAdminDb().collection("coupons").doc(code).get();
    if (!snapshot.exists)
      return NextResponse.json({ error: "This coupon code is not valid." }, { status: 404 });
    const coupon = { ...snapshot.data(), code } as Coupon;
    const discount = calculateCouponDiscount(coupon, subtotal);
    return NextResponse.json({ code, discount, message: "Coupon applied successfully." });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to validate this coupon." },
      { status: 400 },
    );
  }
}

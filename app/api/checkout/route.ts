import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase-admin";
import { getDeliveryCharge } from "@/lib/commerce";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      subtotal?: number;
    };
    const subtotal = Number(body.subtotal);
    if (!Number.isFinite(subtotal) || subtotal < 0)
      return NextResponse.json(
        { error: "Enter a valid subtotal." },
        { status: 400 },
      );
    const deliveryCharge = getDeliveryCharge(subtotal);
    const configuredTaxRate = Number(
      (await getAdminDb().collection("settings").doc("tax").get()).data()?.rate,
    );
    const taxRate =
      Number.isFinite(configuredTaxRate) &&
      configuredTaxRate >= 0 &&
      configuredTaxRate <= 100
        ? configuredTaxRate
        : 0;
    const taxAmount = Math.round(subtotal * taxRate) / 100;
    return NextResponse.json({
      subtotal,
      delivery: deliveryCharge,
      taxRate,
      taxAmount,
      total: subtotal + deliveryCharge + taxAmount,
    });
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
}

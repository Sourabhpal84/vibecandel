import { NextResponse } from "next/server";
import { getAdminDb, requireUser } from "@/lib/firebase-admin";
import {
  confirmRazorpayPayment,
  getPaidPaymentForRazorpayOrder,
} from "@/lib/razorpay-payment";

export const runtime = "nodejs";

/** Recover a paid order if the customer callback or Razorpay webhook was missed. */
export async function POST(request: Request) {
  try {
    const user = await requireUser(request);
    const { razorpay_order_id } = (await request.json()) as {
      razorpay_order_id?: string;
    };
    if (!razorpay_order_id)
      return NextResponse.json({ error: "Payment order ID is required" }, { status: 400 });

    const checkoutSnapshot = await getAdminDb()
      .collection("checkoutRequests")
      .doc(String(razorpay_order_id))
      .get();
    const checkout = checkoutSnapshot.data() as
      | { customerId?: string; amountPaise?: number; status?: string; orderId?: string }
      | undefined;
    if (!checkoutSnapshot.exists || !checkout)
      return NextResponse.json({ error: "Payment order not found" }, { status: 404 });
    if (checkout.customerId !== user.uid)
      return NextResponse.json({ error: "Payment owner mismatch" }, { status: 403 });

    if (checkout.status === "PAID")
      return NextResponse.json({ resolved: true, orderId: checkout.orderId });

    const payment = await getPaidPaymentForRazorpayOrder(
      String(razorpay_order_id),
      checkout.amountPaise,
    );
    if (!payment?.id)
      return NextResponse.json({ resolved: false, status: "PENDING" });

    const order = await confirmRazorpayPayment(String(razorpay_order_id), payment.id, payment);
    return NextResponse.json({ resolved: true, orderId: order.id });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Payment recovery failed" },
      { status: 400 },
    );
  }
}

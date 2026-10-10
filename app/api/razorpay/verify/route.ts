import { createHmac, timingSafeEqual } from "crypto";
import { NextResponse } from "next/server";
import { getAdminDb, requireUser } from "@/lib/firebase-admin";
import {
  confirmRazorpayPayment,
  getRazorpayPayment,
} from "@/lib/razorpay-payment";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const user = await requireUser(request);
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } =
      await request.json();
    if (
      !razorpay_order_id ||
      !razorpay_payment_id ||
      !razorpay_signature ||
      !process.env.RAZORPAY_KEY_SECRET
    )
      return NextResponse.json(
        { verified: false, error: "Missing payment verification data" },
        { status: 400 },
      );
    const expected = createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
      .update(`${razorpay_order_id}|${razorpay_payment_id}`)
      .digest("hex");
    const valid =
      expected.length === razorpay_signature.length &&
      timingSafeEqual(Buffer.from(expected), Buffer.from(razorpay_signature));
    if (!valid)
      return NextResponse.json(
        { verified: false, error: "Invalid payment signature" },
        { status: 400 },
      );
    const checkoutSnapshot = await getAdminDb()
      .collection("checkoutRequests")
      .doc(razorpay_order_id)
      .get();
    const checkout = checkoutSnapshot.data() as
      { customerId?: string; amountPaise?: number } | undefined;
    if (!checkoutSnapshot.exists || !checkout)
      return NextResponse.json(
        { verified: false, error: "Payment order not found" },
        { status: 404 },
      );
    if (checkout.customerId !== user.uid)
      return NextResponse.json(
        { verified: false, error: "Payment owner mismatch" },
        { status: 403 },
      );
    const payment = await getRazorpayPayment(razorpay_payment_id);
    if (
      payment.order_id !== razorpay_order_id ||
      payment.status !== "captured" ||
      payment.amount !== checkout.amountPaise
    )
      return NextResponse.json(
        {
          verified: false,
          error: "Payment was not captured for the expected amount",
        },
        { status: 400 },
      );
    const order = await confirmRazorpayPayment(
      razorpay_order_id,
      razorpay_payment_id,
      payment,
    );
    return NextResponse.json({
      verified: true,
      orderId: order.id,
      displayOrderId: order.displayOrderId,
    });
  } catch (error) {
    return NextResponse.json(
      {
        verified: false,
        error:
          error instanceof Error
            ? error.message
            : "Payment verification failed",
      },
      { status: 400 },
    );
  }
}

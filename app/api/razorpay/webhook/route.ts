import { createHash, createHmac, timingSafeEqual } from "crypto";
import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase-admin";
import {
  confirmRazorpayPayment,
  getPaidPaymentForRazorpayOrder,
  getRazorpayPayment,
  markRazorpayPaymentFailed,
  recordRazorpayWebhookEvent,
} from "@/lib/razorpay-payment";

export const runtime = "nodejs";

type RazorpayEvent = {
  id?: string;
  event?: string;
  payload?: {
    payment?: { entity?: { id?: string; order_id?: string } };
    order?: { entity?: { id?: string } };
  };
};

export async function POST(request: Request) {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
  if (!secret)
    return NextResponse.json({ error: "Webhook is not configured" }, { status: 503 });

  const rawBody = await request.text();
  const signature = request.headers.get("x-razorpay-signature") || "";
  const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
  if (!/^[a-f\d]{64}$/i.test(signature) || signature.length !== expected.length || !timingSafeEqual(Buffer.from(signature), Buffer.from(expected)))
    return NextResponse.json({ error: "Invalid webhook signature" }, { status: 400 });

  let event: RazorpayEvent;
  try {
    event = JSON.parse(rawBody) as RazorpayEvent;
  } catch {
    return NextResponse.json({ error: "Invalid webhook payload" }, { status: 400 });
  }
  const eventName = event.event || "unknown";
  const externalEventId = event.id || request.headers.get("x-razorpay-event-id") || createHash("sha256").update(rawBody).digest("hex");
  const eventId = createHash("sha256").update(externalEventId).digest("hex");

  try {
    if (!["payment.captured", "payment.failed", "order.paid"].includes(eventName)) {
      await recordRazorpayWebhookEvent(eventId, eventName);
      return NextResponse.json({ received: true, ignored: true });
    }

    const razorpayOrderId = event.payload?.payment?.entity?.order_id || event.payload?.order?.entity?.id;
    if (!razorpayOrderId) {
      await recordRazorpayWebhookEvent(eventId, eventName);
      return NextResponse.json({ received: true, ignored: true });
    }

    const checkoutSnapshot = await getAdminDb().collection("checkoutRequests").doc(razorpayOrderId).get();
    if (!checkoutSnapshot.exists) {
      await recordRazorpayWebhookEvent(eventId, eventName);
      return NextResponse.json({ received: true, ignored: true });
    }
    const checkout = checkoutSnapshot.data() as { amountPaise?: number; currency?: string };
    const expectedAmount = checkout.amountPaise;
    if (!Number.isSafeInteger(expectedAmount))
      return NextResponse.json({ error: "Checkout amount is invalid" }, { status: 500 });

    if (eventName === "payment.failed") {
      const paymentId = event.payload?.payment?.entity?.id;
      if (!paymentId) {
        await recordRazorpayWebhookEvent(eventId, eventName);
        return NextResponse.json({ received: true, ignored: true });
      }
      const payment = await getRazorpayPayment(paymentId);
      if (payment.order_id !== razorpayOrderId || payment.status !== "failed" || payment.amount !== expectedAmount || (payment.currency || checkout.currency || "INR").toUpperCase() !== "INR") {
        await recordRazorpayWebhookEvent(eventId, eventName);
        return NextResponse.json({ received: true, ignored: true });
      }
      await markRazorpayPaymentFailed(razorpayOrderId, payment, eventId);
      return NextResponse.json({ received: true });
    }

    let paymentId = event.payload?.payment?.entity?.id;
    if (eventName === "order.paid" && !paymentId) {
      const payment = await getPaidPaymentForRazorpayOrder(razorpayOrderId, expectedAmount);
      paymentId = payment?.id;
    }
    if (!paymentId) {
      await recordRazorpayWebhookEvent(eventId, eventName);
      return NextResponse.json({ received: true, ignored: true });
    }
    const payment = await getRazorpayPayment(paymentId);
    if (payment.order_id !== razorpayOrderId || payment.status !== "captured" || payment.amount !== expectedAmount || (payment.currency || checkout.currency || "INR").toUpperCase() !== "INR") {
      // Signed but stale events are acknowledged and never allowed to change order state.
      await recordRazorpayWebhookEvent(eventId, eventName);
      return NextResponse.json({ received: true, ignored: true });
    }
    await confirmRazorpayPayment(razorpayOrderId, paymentId, payment, eventId, eventName);
    return NextResponse.json({ received: true });
  } catch (error) {
    console.error("Razorpay webhook processing failed", error);
    return NextResponse.json({ error: "Webhook processing failed" }, { status: 500 });
  }
}

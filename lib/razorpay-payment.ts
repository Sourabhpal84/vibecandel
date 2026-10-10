import { getAdminDb } from "@/lib/firebase-admin";
import { FieldValue } from "firebase-admin/firestore";

type Checkout = {
  orderId?: string;
  amountPaise?: number;
  currency?: string;
  status?: string;
  customerId?: string;
  displayOrderId?: string;
  couponCode?: string;
};

export async function getRazorpayPayment(paymentId: string) {
  const keyId = process.env.RAZORPAY_KEY_ID;
  const secret = process.env.RAZORPAY_KEY_SECRET;
  if (!keyId || !secret)
    throw new Error("Razorpay is not configured on the server");
  const response = await fetch(
    `https://api.razorpay.com/v1/payments/${encodeURIComponent(paymentId)}`,
    {
      headers: {
        Authorization: `Basic ${Buffer.from(`${keyId}:${secret}`).toString("base64")}`,
      },
      cache: "no-store",
    },
  );
  const payment = (await response.json()) as {
    id?: string;
    order_id?: string;
    status?: string;
    amount?: number;
    currency?: string;
  };
  if (!response.ok) throw new Error("Unable to verify payment with Razorpay");
  return payment;
}

/**
 * A browser callback is helpful, but it is not a source of truth: customers can
 * close the page or lose their connection after paying.  This asks Razorpay for
 * the payment recorded against our Razorpay order so a signed-in customer can
 * safely recover a pending order later.
 */
export async function getPaidPaymentForRazorpayOrder(
  razorpayOrderId: string,
  expectedAmount?: number,
) {
  const keyId = process.env.RAZORPAY_KEY_ID;
  const secret = process.env.RAZORPAY_KEY_SECRET;
  if (!keyId || !secret)
    throw new Error("Razorpay is not configured on the server");
  const response = await fetch(
    `https://api.razorpay.com/v1/orders/${encodeURIComponent(razorpayOrderId)}/payments`,
    {
      headers: {
        Authorization: `Basic ${Buffer.from(`${keyId}:${secret}`).toString("base64")}`,
      },
      cache: "no-store",
    },
  );
  const payload = (await response.json()) as {
    items?: Array<{ id?: string; order_id?: string; status?: string; amount?: number; currency?: string }>;
  };
  if (!response.ok) throw new Error("Unable to check payment with Razorpay");
  return (payload.items || []).find(
    (payment) =>
      payment.id &&
      payment.order_id === razorpayOrderId &&
      payment.status === "captured" &&
      (expectedAmount === undefined || payment.amount === expectedAmount) &&
      (payment.currency || "INR").toUpperCase() === "INR",
  );
}

type VerifiedRazorpayPayment = {
  id?: string;
  order_id?: string;
  status?: string;
  amount?: number;
  currency?: string;
};

function assertCapturedPayment(payment: VerifiedRazorpayPayment, checkout: Checkout, razorpayOrderId: string, paymentId: string) {
  if (payment.id !== paymentId || payment.order_id !== razorpayOrderId)
    throw new Error("Razorpay payment does not match this checkout");
  if (payment.status !== "captured")
    throw new Error("Razorpay payment has not been captured");
  if (!Number.isSafeInteger(checkout.amountPaise) || payment.amount !== checkout.amountPaise)
    throw new Error("Razorpay payment amount does not match this checkout");
  if ((payment.currency || checkout.currency || "INR").toUpperCase() !== "INR" || (checkout.currency || "INR").toUpperCase() !== "INR")
    throw new Error("Razorpay payment currency does not match this checkout");
}

const webhookEventRef = (eventId: string) => getAdminDb().collection("razorpayWebhookEvents").doc(eventId);

/** Records signed but intentionally ignored events so Razorpay retries remain idempotent. */
export async function recordRazorpayWebhookEvent(eventId: string, eventName: string) {
  const db = getAdminDb();
  const ref = db.collection("razorpayWebhookEvents").doc(eventId);
  await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    if (snapshot.exists) return;
    transaction.create(ref, { event: eventName, status: "IGNORED", receivedAt: new Date().toISOString() });
  });
}

export async function confirmRazorpayPayment(
  razorpayOrderId: string,
  razorpayPaymentId: string,
  payment: VerifiedRazorpayPayment,
  eventId?: string,
  eventName = "payment.captured",
) {
  const adminDb = getAdminDb();
  const checkoutRef = adminDb
    .collection("checkoutRequests")
    .doc(razorpayOrderId);
  return adminDb.runTransaction(async (transaction) => {
    const eventRef = eventId ? webhookEventRef(eventId) : undefined;
    const eventSnapshot = eventRef ? await transaction.get(eventRef) : undefined;
    if (eventSnapshot?.exists) return { duplicate: true };
    const checkoutSnapshot = await transaction.get(checkoutRef);
    if (!checkoutSnapshot.exists) throw new Error("Payment order not found");
    const checkout = checkoutSnapshot.data() as Checkout;
    if (!checkout.orderId) throw new Error("Payment order is incomplete");
    assertCapturedPayment(payment, checkout, razorpayOrderId, razorpayPaymentId);
    const orderRef = adminDb.collection("orders").doc(checkout.orderId);
    const orderSnapshot = await transaction.get(orderRef);
    if (!orderSnapshot.exists) throw new Error("Order record not found");
    const order = orderSnapshot.data() as {
      paymentStatus?: string;
      statusHistory?: unknown[];
      displayOrderId?: string;
      razorpayPaymentId?: string;
    };
    if (
      order.razorpayPaymentId &&
      order.razorpayPaymentId !== razorpayPaymentId
    )
      throw new Error("A different payment is already attached to this order");
    if (checkout.status === "PAID" && order.paymentStatus === "PAID") {
      if (eventRef) transaction.create(eventRef, { event: eventName, status: "PROCESSED", razorpayOrderId, razorpayPaymentId, orderId: orderRef.id, processedAt: new Date().toISOString() });
      return { id: orderRef.id, displayOrderId: order.displayOrderId, duplicate: true };
    }
    const couponRef = checkout.couponCode
      ? adminDb.collection("coupons").doc(checkout.couponCode)
      : undefined;
    const couponSnapshot = couponRef ? await transaction.get(couponRef) : undefined;
    const now = new Date().toISOString();
    const history = Array.isArray(order.statusHistory)
      ? order.statusHistory
      : [];
    const paymentHistory = history.some(
      (entry: unknown) =>
        (entry as { status?: string })?.status === "PAYMENT CONFIRMED",
    )
      ? history
      : [...history, { status: "PAYMENT CONFIRMED", timestamp: now }];
    const confirmedHistory = paymentHistory.some(
      (entry: unknown) =>
        (entry as { status?: string })?.status === "CONFIRMED",
    )
      ? paymentHistory
      : [...paymentHistory, { status: "CONFIRMED", timestamp: now }];
    transaction.update(orderRef, {
      paymentStatus: "PAID",
      paymentCurrency: payment.currency || checkout.currency || "INR",
      orderStatus: "CONFIRMED",
      razorpayPaymentId,
      paymentVerifiedAt: now,
      updatedAt: now,
      statusHistory: confirmedHistory,
    });
    transaction.update(checkoutRef, {
      status: "PAID",
      razorpayPaymentId,
      currency: payment.currency || checkout.currency || "INR",
      paymentVerifiedAt: now,
      updatedAt: now,
    });
    if (eventRef) transaction.create(eventRef, { event: eventName, status: "PROCESSED", razorpayOrderId, razorpayPaymentId, orderId: orderRef.id, processedAt: now });
    if (couponRef && couponSnapshot?.exists)
      transaction.update(couponRef, { usageCount: FieldValue.increment(1), updatedAt: now });
    return { id: orderRef.id, displayOrderId: order.displayOrderId };
  });
}

export async function markRazorpayPaymentFailed(
  razorpayOrderId: string,
  payment: VerifiedRazorpayPayment,
  eventId?: string,
) {
  const adminDb = getAdminDb();
  const checkoutRef = adminDb
    .collection("checkoutRequests")
    .doc(razorpayOrderId);
  await adminDb.runTransaction(async (transaction) => {
    const eventRef = eventId ? webhookEventRef(eventId) : undefined;
    const eventSnapshot = eventRef ? await transaction.get(eventRef) : undefined;
    if (eventSnapshot?.exists) return;
    const checkoutSnapshot = await transaction.get(checkoutRef);
    if (!checkoutSnapshot.exists) {
      if (eventRef) transaction.create(eventRef, { event: "payment.failed", status: "IGNORED", razorpayOrderId, receivedAt: new Date().toISOString() });
      return;
    }
    const checkout = checkoutSnapshot.data() as Checkout;
    if (!checkout.orderId) {
      if (eventRef) transaction.create(eventRef, { event: "payment.failed", status: "IGNORED", razorpayOrderId, receivedAt: new Date().toISOString() });
      return;
    }
    if (payment.order_id !== razorpayOrderId || payment.status !== "failed" || payment.id === undefined || !Number.isSafeInteger(checkout.amountPaise) || payment.amount !== checkout.amountPaise || (payment.currency || checkout.currency || "INR").toUpperCase() !== "INR")
      throw new Error("Failed payment does not match this checkout");
    const orderRef = adminDb.collection("orders").doc(checkout.orderId);
    const orderSnapshot = await transaction.get(orderRef);
    if (!orderSnapshot.exists || checkout.status === "PAID" || orderSnapshot.data()?.paymentStatus === "PAID") {
      if (eventRef) transaction.create(eventRef, { event: "payment.failed", status: "IGNORED", razorpayOrderId, razorpayPaymentId: payment.id, orderId: checkout.orderId, receivedAt: new Date().toISOString() });
      return;
    }
    const now = new Date().toISOString();
    transaction.update(orderRef, { paymentStatus: "FAILED", updatedAt: now });
    transaction.update(checkoutRef, {
      status: "FAILED",
      razorpayPaymentId: payment.id,
      updatedAt: now,
    });
    if (eventRef) transaction.create(eventRef, { event: "payment.failed", status: "PROCESSED", razorpayOrderId, razorpayPaymentId: payment.id, orderId: checkout.orderId, processedAt: now });
  });
}

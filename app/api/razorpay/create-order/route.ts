import { NextResponse } from "next/server";
import { getAdminDb, requireUser } from "@/lib/firebase-admin";
import { isValidPincode, normalizePincode } from "@/lib/commerce";

export const runtime = "nodejs";
type ClientItem = {
  productId: string;
  name?: string;
  color?: string;
  size?: string;
  quantity?: number;
  sku?: string;
};
type Address = {
  name?: string;
  phone?: string;
  address?: string;
  pincode?: string;
  instructions?: string;
};
type VerifiedItem = {
  productId: string;
  name: string;
  image: string;
  color: string;
  size: string;
  sku: string;
  quantity: number;
  price: number;
  total: number;
};

const razorpayHeaders = () => ({
  Authorization: `Basic ${Buffer.from(`${process.env.RAZORPAY_KEY_ID}:${process.env.RAZORPAY_KEY_SECRET}`).toString("base64")}`,
  "Content-Type": "application/json",
});

export async function POST(request: Request) {
  try {
    const user = await requireUser(request);
    const body = (await request.json()) as {
      items?: ClientItem[];
      address?: Address;
      checkoutKey?: string;
    };
    const address = body.address || {};
    const items = body.items || [];
    const checkoutKey = String(body.checkoutKey || "")
      .replace(/[^a-zA-Z0-9_-]/g, "")
      .slice(0, 100);
    if (!checkoutKey)
      return NextResponse.json(
        { error: "Invalid checkout session. Please try again." },
        { status: 400 },
      );
    if (
      !items.length ||
      !address.name ||
      !address.phone ||
      !address.address ||
      !address.pincode
    )
      return NextResponse.json(
        { error: "Complete delivery details are required" },
        { status: 400 },
      );
    const pincode = normalizePincode(address.pincode);
    if (!isValidPincode(pincode))
      return NextResponse.json(
        { error: "Enter a valid 6-digit pincode." },
        { status: 400 },
      );
    if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET)
      return NextResponse.json(
        { error: "Razorpay is not configured on the server" },
        { status: 503 },
      );

    const adminDb = getAdminDb();
    const verifiedItems: VerifiedItem[] = [];
    for (const item of items) {
      const quantity = Math.floor(Number(item.quantity));
      if (
        !item.productId ||
        !Number.isInteger(quantity) ||
        quantity < 1 ||
        quantity > 20
      )
        return NextResponse.json(
          { error: "Invalid cart item" },
          { status: 400 },
        );
      const productSnapshot = await adminDb
        .collection("products")
        .doc(item.productId)
        .get();
      if (!productSnapshot.exists)
        return NextResponse.json(
          { error: "A product is no longer available" },
          { status: 400 },
        );
      const product = productSnapshot.data() as {
        name?: string;
        image?: string;
        variants?: Array<{
          color?: string;
          size?: string;
          price?: number;
          stock?: number;
          sku?: string;
        }>;
        price?: number;
        stock?: number;
        active?: boolean;
      };
      if (product.active === false)
        return NextResponse.json(
          { error: "A product is no longer available" },
          { status: 400 },
        );
      const variant = product.variants?.find(
        (value) =>
          value.sku === item.sku &&
          value.color === item.color &&
          value.size === item.size,
      );
      if (product.variants?.length && !variant)
        return NextResponse.json(
          { error: `${product.name || "Item"} is no longer available in your selected option` },
          { status: 400 },
        );
      const unitPrice = Number(variant?.price ?? product.price);
      if (
        !Number.isFinite(unitPrice) ||
        unitPrice < 0 ||
        (variant && Number(variant.stock) < quantity) ||
        (!variant && Number.isFinite(Number(product.stock)) && Number(product.stock) < quantity)
      )
        return NextResponse.json(
          { error: `${product.name || "Item"} is out of stock` },
          { status: 400 },
        );
      verifiedItems.push({
        productId: item.productId,
        name: product.name || item.name || "Product",
        image: product.image || "",
        color: variant?.color || item.color || "",
        size: variant?.size || item.size || "",
        sku: variant?.sku || item.sku || item.productId,
        quantity,
        price: unitPrice,
        total: unitPrice * quantity,
      });
    }
    const areaSnapshot = await adminDb
      .collection("serviceAreas")
      .doc(pincode)
      .get();
    const configuredDeliveryCharge = Number(
      areaSnapshot.data()?.deliveryCharge,
    );
    const freeDeliveryAbove = Number(areaSnapshot.data()?.freeDeliveryAbove);
    if (
      !areaSnapshot.exists ||
      areaSnapshot.data()?.enabled === false ||
      !Number.isFinite(configuredDeliveryCharge) ||
      configuredDeliveryCharge < 0
    )
      return NextResponse.json(
        { error: "Delivery is currently unavailable at this pincode." },
        { status: 400 },
      );
    const subtotal = verifiedItems.reduce(
      (total, item) => total + item.total,
      0,
    );
    const deliveryCharge =
      Number.isFinite(freeDeliveryAbove) &&
      freeDeliveryAbove > 0 &&
      subtotal >= freeDeliveryAbove
        ? 0
        : configuredDeliveryCharge;
    const configuredTaxRate = Number(
      (await adminDb.collection("settings").doc("tax").get()).data()?.rate,
    );
    const taxRate =
      Number.isFinite(configuredTaxRate) &&
      configuredTaxRate >= 0 &&
      configuredTaxRate <= 100
        ? configuredTaxRate
        : 0;
    const taxAmount = Math.round(subtotal * taxRate) / 100;
    const totalAmount = subtotal + deliveryCharge + taxAmount;
    const attemptRef = adminDb
      .collection("checkoutAttempts")
      .doc(`${user.uid}_${checkoutKey}`);
    const now = new Date().toISOString();
    const attempt = await adminDb.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(attemptRef);
      const previous = snapshot.data() as
        | {
            status?: string;
            razorpayOrderId?: string;
            amount?: number;
            currency?: string;
            internalOrderId?: string;
            pincode?: string;
            deliveryCharge?: number;
            taxRate?: number;
            taxAmount?: number;
            updatedAt?: string;
          }
        | undefined;
      if (
        previous?.status === "READY" &&
        previous.razorpayOrderId &&
        previous.internalOrderId &&
        previous.pincode === pincode &&
        previous.deliveryCharge === deliveryCharge &&
        previous.taxRate === taxRate &&
        previous.taxAmount === taxAmount
      )
        return previous;
      if (
        previous?.status === "CREATING" &&
        Date.now() - Date.parse(previous.updatedAt || "") < 30_000
      )
        throw new Error(
          "Payment is already being prepared. Please wait a moment.",
        );
      transaction.set(
        attemptRef,
        {
          customerId: user.uid,
          status: "CREATING",
          pincode,
          deliveryCharge,
          taxRate,
          taxAmount,
          updatedAt: now,
          createdAt: previous?.updatedAt || now,
        },
        { merge: true },
      );
      return undefined;
    });
    if (attempt)
      return NextResponse.json({
        keyId: process.env.RAZORPAY_KEY_ID,
        orderId: attempt.razorpayOrderId,
        amount: attempt.amount,
        currency: attempt.currency,
        internalOrderId: attempt.internalOrderId,
      });

    const razorpayResponse = await fetch("https://api.razorpay.com/v1/orders", {
      method: "POST",
      headers: razorpayHeaders(),
      body: JSON.stringify({
        amount: Math.round(totalAmount * 100),
        currency: "INR",
        receipt: `lw_${Date.now()}`,
        notes: { customerId: user.uid, checkoutKey },
      }),
    });
    if (!razorpayResponse.ok) {
      await attemptRef.set(
        { status: "FAILED", updatedAt: new Date().toISOString() },
        { merge: true },
      );
      return NextResponse.json(
        { error: "Unable to create Razorpay order" },
        { status: 502 },
      );
    }
    const razorpayOrder = (await razorpayResponse.json()) as {
      id: string;
      amount: number;
      currency: string;
    };
    const created = await adminDb.runTransaction(async (transaction) => {
      const counterRef = adminDb.collection("counters").doc("orders");
      const counterSnapshot = await transaction.get(counterRef);
      const nextNumber =
        Number(counterSnapshot.data()?.nextNumber || 10000) + 1;
      const orderRef = adminDb.collection("orders").doc();
      const createdAt = new Date().toISOString();
      const displayOrderId = `LW-${nextNumber}`;
      transaction.set(
        counterRef,
        { nextNumber, updatedAt: createdAt },
        { merge: true },
      );
      transaction.create(orderRef, {
        displayOrderId,
        userId: user.uid,
        customerId: user.uid,
        customer: {
          name: address.name,
          phone: address.phone,
          email: user.email || "",
        },
        deliveryAddress: {
          name: address.name,
          phone: address.phone,
          address: address.address,
          pincode,
          instructions: address.instructions || "",
        },
        items: verifiedItems,
        subtotal,
        discount: 0,
        deliveryCharge,
        taxRate,
        taxAmount,
        totalAmount,
        paymentMethod: "RAZORPAY",
        paymentStatus: "PENDING",
        orderStatus: "NEW",
        statusHistory: [{ status: "NEW", timestamp: createdAt }],
        razorpayOrderId: razorpayOrder.id,
        razorpayPaymentId: null,
        createdAt,
        updatedAt: createdAt,
      });
      transaction.create(
        adminDb.collection("checkoutRequests").doc(razorpayOrder.id),
        {
          orderId: orderRef.id,
          displayOrderId,
          customerId: user.uid,
          customer: {
            name: address.name,
            phone: address.phone,
            email: user.email || "",
          },
          deliveryAddress: {
            name: address.name,
            phone: address.phone,
            address: address.address,
            pincode,
            instructions: address.instructions || "",
          },
          items: verifiedItems,
          subtotal,
          deliveryCharge,
          taxRate,
          taxAmount,
          totalAmount,
          amountPaise: razorpayOrder.amount,
          status: "PENDING",
          createdAt,
          updatedAt: createdAt,
        },
      );
      transaction.set(
        attemptRef,
        {
          status: "READY",
          razorpayOrderId: razorpayOrder.id,
          internalOrderId: orderRef.id,
          amount: razorpayOrder.amount,
          currency: razorpayOrder.currency,
          pincode,
          deliveryCharge,
          taxRate,
          taxAmount,
          updatedAt: createdAt,
        },
        { merge: true },
      );
      return { id: orderRef.id };
    });
    return NextResponse.json({
      keyId: process.env.RAZORPAY_KEY_ID,
      orderId: razorpayOrder.id,
      amount: razorpayOrder.amount,
      currency: razorpayOrder.currency,
      internalOrderId: created.id,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unable to create payment order",
      },
      { status: 400 },
    );
  }
}

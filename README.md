# SHAVIBE CANDLE

Next.js storefront backed by Firebase Authentication and Firestore, with Razorpay for online checkout.

## Razorpay payment flow

The server creates a Razorpay order and a matching Firestore `orders` document plus a private `checkoutRequests` record. The checkout callback is verified by `/api/razorpay/verify`; a signed Razorpay webhook at `/api/razorpay/webhook` independently reconciles captured and failed payment events. Webhook receipts are deduplicated in `razorpayWebhookEvents`. They do not create customer orders.

The webhook checks the raw request body signature with `RAZORPAY_WEBHOOK_SECRET`, then fetches the payment from Razorpay and checks its captured state, Razorpay order ID, expected amount, and INR currency before confirming the Firestore order. The Razorpay API key secret and webhook secret are separate credentials.

## Configure the production webhook

1. In the Razorpay Dashboard, open **Account & Settings → Webhooks → Add New Webhook**.
2. Set the webhook URL to `https://YOUR_DEPLOYED_DOMAIN/api/razorpay/webhook` (the exact path is `/api/razorpay/webhook`). Replace the domain with the actual Vercel production domain; this repository does not contain the deployment hostname.
3. Create a new webhook secret and save it securely. In Vercel, add it as `RAZORPAY_WEBHOOK_SECRET` for the **Production** environment, then redeploy. Add the same server-only variable to Preview/Development only when those environments should receive their own webhook deliveries.
4. Select `payment.captured`, `payment.failed`, and `order.paid` events. The handler verifies `order.paid` by looking up its captured payment and checks the same expected order amount.
5. Do not put this secret in any `NEXT_PUBLIC_*` variable. Do not reuse `RAZORPAY_KEY_SECRET`; that is a different credential.

The variable name is already listed in `.env.example`. The local `.env.local` file should contain `RAZORPAY_WEBHOOK_SECRET` only for local testing with a public webhook tunnel. Keep `.env.local` out of Git.

## Local development and deployment

Use Node.js 18.17 or newer. Install with `npm install`, run `npm run dev`, and run `npm run build` before deployment. Configure the Firebase client settings and Firebase Admin service account variables from `.env.example`; set Razorpay credentials as server-side Vercel environment variables. Never commit `.env.local` or real credentials.

## Revenue rules

Online revenue counts orders with `paymentStatus: PAID`. COD revenue counts only `paymentMethod: COD` orders marked `DELIVERED`. Cancelled, rejected, refunded, and failed orders are excluded. The current checkout only creates Razorpay orders; the revenue calculation supports COD records if a COD flow is introduced separately.

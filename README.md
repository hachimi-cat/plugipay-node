# @forjio/plugipay-node

Official Node.js SDK for **Plugipay** — hosted checkout, subscriptions, invoices, receipts, webhooks. Platform-partner mode for Storlaunch / Fulkruma / Ripllo.

## Install

```bash
npm install @forjio/plugipay-node
```

## Quick start

```ts
import { PlugipayClient, verifyWebhook } from '@forjio/plugipay-node';

const plugipay = new PlugipayClient({
  keyId:  process.env.PLUGIPAY_KEY_ID!,
  secret: process.env.PLUGIPAY_SECRET!,
});

// Create a customer
const customer = await plugipay.customers.create({
  email: 'buyer@example.com',
  name:  'Dewi Lestari',
});

// Hosted checkout
const session = await plugipay.checkoutSessions.create({
  amount: 199000,
  currency: 'IDR',
  methods: ['qris', 'va'],
  successUrl: 'https://myshop.com/thanks',
  cancelUrl:  'https://myshop.com/cart',
  customerId: customer.id,
});
console.log(session.hostedUrl); // → plugipay.com/c/cs_xxx

// Subscriptions
const sub = await plugipay.subscriptions.create({
  customerId: customer.id,
  planId:     process.env.PRO_PLAN_ID!,
});

// Billing portal
const portal = await plugipay.portalSessions.create({
  customerId: customer.id,
  returnUrl:  'https://myshop.com/account',
});
// → redirect the user to portal.url
```

## Webhooks

Use the raw request body (don't let Express pre-parse it):

```ts
import express from 'express';
import { verifyWebhook } from '@forjio/plugipay-node';

const app = express();
app.post(
  '/webhooks/plugipay',
  express.raw({ type: 'application/json' }),
  (req, res) => {
    try {
      const event = verifyWebhook(
        req.body,
        req.headers['x-plugipay-signature'],
        process.env.PLUGIPAY_WEBHOOK_SECRET!,
      );
      switch (event.type) {
        case 'plugipay.invoice.paid.v1':
          // flip user to paid tier locally
          break;
        case 'plugipay.subscription.canceled.v1':
          // downgrade
          break;
      }
      res.status(200).json({ received: true });
    } catch (e) {
      res.status(401).json({ error: (e as Error).message });
    }
  },
);
```

## Platform partners (Storlaunch, Fulkruma, Ripllo)

A platform-admin key provisions merchant workspaces and acts on their behalf:

```ts
const platform = new PlugipayClient({
  keyId:  process.env.PLATFORM_KEY_ID!,
  secret: process.env.PLATFORM_SECRET!,
});

// Onboarding: create a Plugipay workspace for a Storlaunch merchant
await platform.admin.provisionWorkspace({
  accountId:    'acc_xxx',   // the merchant's Huudis identity
  partner:      'storlaunch',
  discountRate: 0.003,       // 0.3% — stamped at provisioning, permanent
  brandName:    'Warung Kopi Nusantara',
  businessEmail:'hello@warungkopi.com',
});

// Future calls scope to this merchant
const forMerchant = platform.forMerchant('acc_xxx');
await forMerchant.checkoutSessions.create({ /* ... */ });

// Monthly usage rollup for the unified Storlaunch invoice
const usage = await platform.admin.partnerUsage({
  partner: 'storlaunch',
  from:    '2026-04-01T00:00:00Z',
  to:      '2026-05-01T00:00:00Z',
});
console.log(usage.total); // IDR fees across all Storlaunch merchants
```

## Error handling

All API errors throw `PlugipayError` with `status`, `code`, `message`, and `requestId`:

```ts
try {
  await plugipay.customers.get('cus_bad');
} catch (e) {
  if (e instanceof PlugipayError && e.code === 'not_found') {
    // handle 404
  }
}
```

## License

MIT

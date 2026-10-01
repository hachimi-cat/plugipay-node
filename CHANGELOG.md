# Changelog

## 0.11.0
- `webhookEndpoints.update(id, patch)` (`url`, `events`, `description`, `active`; `active: true` re-enables an endpoint Plugipay switched off for failing and clears its failure streak), and the delivery log: `webhookEndpoints.listDeliveries({ endpointId?, status?, type?, limit?, cursor? })` (paginated), `getDelivery(id)`, `retryDelivery(id)`. New types `WebhookDelivery`, `WebhookDeliveryAttempt`, `WebhookDeliveryStatus`, `Mode`.
- `WebhookEndpoint` declares `mode`, `consecutiveFailures`, `failingSince`, `disabledAt` and `disabledReason`; `accountId` is optional (only the create response has it).
- `ApiKey` is the key the API returns: `{ id, name, keyPrefix, environment, scopes, lastUsedAt, createdAt, key? }` (it declared `keyId`, `description`, `scope`, `secret`, `revokedAt`, which the API never sent).
- `BillingTier` is the tier the API returns: `priceMonthlyIdr`, `priceMonthlyUsdCents`, `channelFeeRate`, the limits (`monthlyTxnCap`, `maxWebhookEndpoints`, `maxApiKeys`; `null` is unlimited), `customBranding`, `dailyPayouts`, `support`, `tagline`, `agentCredits`, `features` (it declared `monthly`, which the API never sent).
- `client.api`: `webhooksDeliveries`, `webhooksGetDeliveries`, `webhooksDeliveriesRetry` (regenerated).

## 0.10.0
Hand-written methods that could never succeed against the API now send what their routes require. Some signatures changed (a minor bump in 0.x); every changed call failed before, so no working code depends on the old shape.
- `customers.update` sends an `Idempotency-Key` (the route requires one; every call was `400`) and takes `externalId`, `taxId`, `defaultPaymentTokenId` and `metadata` too.
- `plans.create` takes the API's shape: `{ name, interval, prices: PriceInput[], portalFeatures?, description?, intervalCount?, trialDays?, … }`. `currency` + `amount` still work, as the shorthand for one flat price; `portalFeatures` defaults to cancel + update the payment method. `plans.addPrice` defaults `model` to `flat` (the API requires one). `Plan` and `Price` are the shapes the API returns (`prices`, `portalFeatures`, `intervalCount`, …; there is no plan-level `currency` / `amount`).
- `templates.*`: a template's settings are its `config` (`Template.config`, `templates.create({ kind, name, config, isDefault? })`, `templates.update(id, { name?, config? })`); the API never took `document`. `templates.preview({ kind, config })` returns `{ html }` from the HTML page the route answers with (it parsed the page as JSON and threw); `sampleData` is gone (the API refused it). `templates.duplicate(id, name)` renames the copy with a second request (the route ignores a name). Typed configs: `ReceiptTemplateConfig`, `InvoiceTemplateConfig`, `CheckoutTemplateConfig`.
- `adapters.updateXendit` / `updatePaypal` / `updateMidtrans` / `updateManual` send an `Idempotency-Key` (every call was `400`) and take typed inputs (`XenditAdapterInput`, …). `adapters.list()` returns an array of `AdapterConfig` (the API answers an object keyed by kind); `AdapterConfig` is the API's `{ kind, status, secretKeyLast4, publicConfig, configuredAt, lastErrorAt, lastErrorCode }`.
- `adapters.startManagedOnboarding({ email })` and `simulateManagedOnboarding({ kybStatus?, capabilitiesStatus?, payoutsReady? })` send the bodies their routes take; `ManagedOnboardingState` is the sub-account the API returns. `onboarding.provisionManaged()` takes no input (the route reads none) and returns `{ subAccountId }`.
- `checkoutSettings.update` takes `CheckoutSettingsUpdate` (`brandName`, `brandAccentColor`, `business*`, `enabledMethods`, …); `brandColor`, `defaultTemplateId`, `termsUrl` and `privacyUrl` were refused. `CheckoutSettings` is the API's shape. `billing.listPlans()` returns `BillingPlan` (`{ id, name, price }`).
- `apiKeys.create({ name, environment?, scopes? })` (person-only: a key still gets `403`). `invoices.create` and `invoices.finalize` send an `Idempotency-Key`.
- `request()` returns the text of a `text/html` success response.
- `WebhookEvent` types `plugipay.invoice.sent.v1` (`data: { object: Invoice; to: string }`), which `POST /invoices/{id}/send` now fires.
- The routes-exist test now also fails a hand-written method that sends no `Idempotency-Key` where the route takes one, or whose body (every declared input filled in, read from `src/client.ts` with the TypeScript compiler) the route's schema refuses.

## 0.9.0
- `uploads.image` sends the image as `multipart/form-data` in the field `file`, which is what `POST /api/v1/uploads/image` takes; it sent JSON before and always got 400. It takes `{ file, filename?, contentType? }` (`file`: a Blob / File, Buffer or Uint8Array); the 0.8 shape `{ base64, filename, mime }` still works and is sent as the file it encodes. `UploadedFile` is what the API returns: `{ url, fileName, fileSize }` (it listed fields the API never sent).
- `client.api.uploadsImage({ file })` and `client.api.publicCheckoutSessionsProofImage(id, { file })` upload a file (they took no arguments before); `request()` sends a `FormData` body as multipart/form-data, signed over no body as the API checks it.
- Every request is signed with a fresh `X-Plugipay-Timestamp` when it is sent; the API now refuses a signed time more than 300 s off its clock either way (`401 timestamp_skew`, `401 invalid_timestamp`).

## 0.8.0
- `client.api.<area><Action>(...)`: every Plugipay feature route, one method each, generated from the API spec (`scripts/apigen.sh`). Signed like every other request, with an idempotency key on writes.
- `apiKey` option: a key minted in the dashboard (`pk_live_…` / `pk_test_…`) is sent as `Authorization: Bearer <key>`; `keyId` + `secret` are now optional when `apiKey` is given.
- The API now takes a key on every customer feature (billing summary, the dashboard figures, workspaces list, uploads, …). Person-only (403 person_only with a key): `apiKeys.*`, `account.*`, `workspaces.create/update/delete`; `adminPortal.*` is for Plugipay's operators.
- A test checks every hand-written method's route against the API spec (`backend/openapi.json`).

## 0.7.2
- `request()` treats a 204 / empty-body response as void instead of throwing `invalid_response`. Every backend DELETE answers 204, so `webhookEndpoints.delete`, `templates.delete`, `workspaces.delete`, `apiKeys.revoke` and raw `request({ method: 'DELETE', … })` calls were all broken before this.

## 0.7.1
- Package metadata now points at the public mirror repo (github.com/hachimi-cat/plugipay-node).

## 0.7.0
- Full resource coverage as first tracked release.

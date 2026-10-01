// ─────────────────────────────────────────────────────────────
// Shared types — mirror backend envelope + resource shapes.
// ─────────────────────────────────────────────────────────────

export interface ApiEnvelope<T> {
  data: T | null;
  error: { code: string; message: string; docUrl?: string } | null;
  meta?: { requestId: string; timestamp: string };
}

export class PlugipayError extends Error {
  readonly status: number;
  readonly code: string;
  readonly requestId: string | undefined;
  constructor(status: number, code: string, message: string, requestId?: string) {
    super(message);
    this.name = 'PlugipayError';
    this.status = status;
    this.code = code;
    this.requestId = requestId;
  }
}

export type CurrencyCode = 'IDR' | 'USD';
/** Test or live: a key's mode, and the mode its data belongs to. */
export type Mode = 'live' | 'test';
export type CheckoutMethod = 'qris' | 'va' | 'ewallet' | 'card' | 'retail' | 'paypal';

export interface Customer {
  id: string;
  arn: string;
  accountId: string;
  /** Your own id for the customer (e.g. a Storlaunch `cus_…`); unique per account and mode. */
  externalId: string | null;
  email: string | null;
  name: string | null;
  phone: string | null;
  /** Tax id (NPWP in Indonesia). */
  taxId: string | null;
  defaultPaymentTokenId: string | null;
  metadata: Record<string, string> | null;
  createdAt: string;
  updatedAt: string;
}

export type PlanInterval = 'day' | 'week' | 'month' | 'year';
export type PriceModel = 'flat' | 'tiered' | 'volume' | 'usage';

/** What a customer may do for themselves in the billing portal, per plan. */
export interface PortalFeatures {
  selfServeCancel: boolean;
  selfServePause: boolean;
  selfServeUpgrade: boolean;
  selfServeDowngrade: boolean;
  updatePaymentMethod: boolean;
}

export interface Plan {
  id: string;
  arn: string;
  accountId: string;
  name: string;
  description: string | null;
  interval: PlanInterval;
  intervalCount: number;
  trialDays: number;
  /** A plan's amounts live on its prices (one per currency). */
  prices: Price[];
  usageAggregate: 'sum' | 'max' | 'last' | null;
  meteredUnit: string | null;
  portalFeatures: PortalFeatures;
  dunningPolicyId: string | null;
  active: boolean;
  archivedAt: string | null;
  metadata: Record<string, string> | null;
  createdAt: string;
  updatedAt: string;
}

export interface PriceTier {
  upTo: number | 'inf';
  unitAmount: number;
  flatAmount: number;
}

export interface Price {
  id: string;
  planId: string;
  currency: CurrencyCode;
  model: PriceModel;
  unitAmount: number | null;
  tiers: PriceTier[] | null;
  taxMode: 'inclusive' | 'exclusive';
  active: boolean;
  createdAt: string;
}

/** A price as `plans.create` / `plans.addPrice` take it. `unitAmount` (minor units) for
 *  `flat` and `usage`; `tiers` for `tiered` and `volume`. */
export interface PriceInput {
  currency: CurrencyCode;
  model: PriceModel;
  unitAmount?: number;
  tiers?: PriceTier[];
  taxMode?: 'inclusive' | 'exclusive';
  active?: boolean;
}

/** `plans.create`. Give the plan its prices, or — for one flat price — just `currency`
 *  and `amount` (minor units), which become `prices: [{ currency, model: 'flat',
 *  unitAmount: amount }]`. `portalFeatures` defaults to cancel + update payment method. */
export interface PlanCreateInput {
  name: string;
  interval: PlanInterval;
  prices?: PriceInput[];
  currency?: CurrencyCode;
  amount?: number;
  description?: string;
  intervalCount?: number;
  trialDays?: number;
  portalFeatures?: PortalFeatures;
  dunningPolicyId?: string | null;
  usageAggregate?: 'sum' | 'max' | 'last' | null;
  meteredUnit?: string | null;
  active?: boolean;
  metadata?: Record<string, string> | null;
}

export type CheckoutSessionStatus =
  | 'open'
  | 'pending'
  | 'pending_review'
  | 'completed'
  | 'failed'
  | 'expired'
  | 'canceled';

/** The customer a checkout session is for, as the session shows it. */
export interface CheckoutSessionCustomer {
  id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  externalId: string | null;
}

export interface CheckoutSession {
  id: string;
  arn: string;
  accountId: string;
  /** The workspace's display name, where the response carries it (null otherwise). */
  workspaceName: string | null;
  customerId: string | null;
  customer: CheckoutSessionCustomer | null;
  mode: Mode;
  status: CheckoutSessionStatus;
  amount: number;
  currency: CurrencyCode;
  methods: CheckoutMethod[];
  /** The method the buyer paid with (`qris`, `bank_transfer`, …), once known. */
  paymentMethod: string | null;
  adapter: string | null;
  lineItems: unknown;
  successUrl: string;
  cancelUrl: string;
  hostedUrl: string;
  expiresAt: string;
  completedAt: string | null;
  /** The provider's charge id once paid — what `refunds.create({ chargeId })` takes. */
  paymentId: string | null;
  metadata: Record<string, string> | null;
  createdAt: string;
  updatedAt: string;
}

export interface Invoice {
  id: string;
  arn: string;
  accountId: string;
  customerId: string;
  subscriptionId: string | null;
  status: 'draft' | 'open' | 'past_due' | 'paid' | 'void' | 'uncollectible';
  number: string;
  currency: CurrencyCode;
  subtotal: number;
  discount: number;
  tax: number;
  total: number;
  amountPaid: number;
  amountDue: number;
  dueAt: string | null;
  issuedAt: string | null;
  paidAt: string | null;
  voidedAt: string | null;
  hostedInvoiceUrl: string | null;
  /** The provider charge that settled the invoice — set on `invoices.get` when a checkout
   *  session paid it (null in lists, events, and when it was paid any other way). Pass it
   *  to `refunds.create({ chargeId })`; null means it can't be refunded through a provider. */
  chargeId: string | null;
  collectionAttempts: number;
  lines: InvoiceLine[];
  metadata: Record<string, string> | null;
  createdAt: string;
  updatedAt: string;
}

export interface InvoiceLine {
  id: string;
  description: string;
  quantity: number;
  unitAmount: number;
  amount: number;
  priceId: string | null;
  metadata: Record<string, string> | null;
}

export type SubscriptionStatus = 'trialing' | 'active' | 'past_due' | 'canceled' | 'paused' | 'incomplete';
export type SubscriptionCancelReason = 'customer_portal' | 'merchant' | 'failed_payment' | 'user_request';

export interface Subscription {
  id: string;
  arn: string;
  accountId: string;
  customerId: string;
  planId: string;
  priceId: string | null;
  status: SubscriptionStatus;
  currentPeriodStart: string;
  currentPeriodEnd: string;
  /** When the trial ends; null without a trial. */
  trialEnd: string | null;
  /** Set by `cancel(id, 'period_end')`: the subscription cancels then. */
  cancelAt: string | null;
  canceledAt: string | null;
  canceledReason: SubscriptionCancelReason | null;
  pausedAt: string | null;
  defaultPaymentTokenId: string | null;
  discountCouponId: string | null;
  collectionMethod: 'charge_automatically' | 'send_invoice';
  metadata: Record<string, string> | null;
  createdAt: string;
  updatedAt: string;
}

export interface PortalSession {
  id: string;
  arn: string;
  accountId: string;
  customerId: string;
  /** Open it in the customer's browser; it carries a short-lived token. */
  url: string;
  returnUrl: string;
  expiresAt: string;
  createdAt: string;
}

/** A partner that bills merchants through Plugipay (the partner registry grows; the
 *  names here are the ones known today). */
export type PartnerId =
  | 'storlaunch'
  | 'fulkruma'
  | 'ripllo'
  | 'catentio'
  | 'huudis'
  | 'linksnap'
  | 'pawpado'
  | 'serront'
  | 'malapos'
  | (string & {});

export interface PartnerWorkspace {
  accountId: string;
  partner: PartnerId;
  discountRate: number;
  brandName: string | null;
  businessEmail: string | null;
  createdAt: string;
}

export type PayoutStatus = 'pending' | 'in_transit' | 'paid' | 'failed' | 'cancelled';
export type PayoutMethod = 'manual' | 'xendit_disbursement';

export interface Payout {
  id: string;
  accountId: string;
  amount: number;
  currency: string;
  status: PayoutStatus;
  method: PayoutMethod;
  bankCode: string | null;
  bankName: string;
  bankAccountNumber: string;
  bankAccountHolder: string;
  note: string | null;
  reference: string | null;
  failureReason: string | null;
  ledgerTransactionId: string | null;
  processedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AvailableBalance {
  ledgerBalance: number;
  locked: number;
  available: number;
  currency: string | null;
}

export interface BankAccount {
  bankCode: string | null;
  bankName: string | null;
  bankAccountNumber: string | null;
  bankAccountHolder: string | null;
  configured: boolean;
}

export interface LedgerEntry {
  id: string;
  accountId: string;
  txId: string;
  code: string;
  direction: 'debit' | 'credit';
  amount: number;
  currency: string;
  sourceType: string;
  sourceId: string;
  memo: string | null;
  postedAt: string;
}

export interface LedgerBalance {
  code: string;
  debits: number;
  credits: number;
  balance: number;
}

export interface PnLReport {
  from: string;
  to: string;
  currency: string;
  revenue: number;
  refunds: number;
  platformFees: number;
  tax: number;
  net: number;
  lines: { code: string; amount: number }[];
}

export interface CashFlowReport {
  from: string;
  to: string;
  currency: string;
  totalInflow: number;
  totalOutflow: number;
  net: number;
  buckets: { day: string; inflow: number; outflow: number; net: number }[];
}

export interface WebhookEndpoint {
  id: string;
  /** Only returned on create. */
  accountId?: string;
  /** The mode of the request that made it: it receives only that mode's events. */
  mode: Mode;
  url: string;
  events: string[];
  description: string | null;
  active: boolean;
  /** Failed delivery attempts in a row since the last 2xx. */
  consecutiveFailures: number;
  /** When the current run of failures started; null while healthy. */
  failingSince: string | null;
  /** Set when Plugipay switched the endpoint off because it kept failing (20 failed
   *  attempts in a row over at least 24 hours); null for a manual pause. Re-enable with
   *  `webhookEndpoints.update(id, { active: true })`. */
  disabledAt: string | null;
  disabledReason: string | null;
  secret?: string; // only returned on create
  createdAt: string;
  updatedAt: string;
}

export type WebhookDeliveryStatus = 'pending' | 'succeeded' | 'failed';

/** One try at a webhook delivery. */
export interface WebhookDeliveryAttempt {
  attemptNumber: number;
  status: 'succeeded' | 'failed';
  /** null when no response came back (a timeout, a refused connection). */
  responseCode: number | null;
  durationMs: number;
  /** Why it failed: "HTTP 503", "timed out after 10000ms", … */
  error: string | null;
  /** The retry this failure scheduled; null on success or when it gave up. */
  nextRetryAt: string | null;
  attemptedAt: string;
}

/** One event sent to one endpoint (`webhookEndpoints.listDeliveries`). */
export interface WebhookDelivery {
  id: string;
  endpointId: string;
  /** The event's id (evt_…): the body's `id`, the same on every attempt. */
  eventId: string;
  type: string;
  /** The exact JSON sent on every attempt. */
  body: string;
  status: WebhookDeliveryStatus;
  attempts: number;
  /** When it is next due; null once succeeded or failed. */
  nextRetryAt: string | null;
  lastAttemptAt: string | null;
  deliveredAt: string | null;
  responseCode: number | null;
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
  /** Every attempt, oldest first. */
  attemptLog: WebhookDeliveryAttempt[];
}

/** An event as `events.list` / `events.get` return it. */
export interface EventRecord {
  id: string;
  type: string;
  accountId: string | null;
  /** The mode it happened in; null for events from before events carried one. */
  mode: Mode | null;
  occurredAt: string;
  data: unknown;
  /** Delivery bookkeeping: `idempotencyKey`, `mode`, `requestId`, `source`, `replayOf`. */
  metadata: unknown;
  createdAt: string;
  /** When the outbox worker sent it to your endpoints; null while queued. */
  publishedAt: string | null;
}

export interface ReceiptSummary {
  id: string;
  number: string;
  sourceType: 'checkout_session' | 'invoice';
  sourceId: string;
  customerId: string | null;
  amount: number;
  currency: string;
  method: string | null;
  adapter: string | null;
  issuedAt: string;
  emailedAt: string | null;
  emailedTo: string | null;
}

export interface PartnerUsageSummary {
  partner: PartnerId;
  from: string;
  to: string;
  currency: 'IDR';
  lines: {
    accountId: string;
    brandName: string | null;
    transactionCount: number;
    grossVolume: number;
    discountRate: number;
    fee: number;
  }[];
  total: number;
}

// v0.5.0 additions — types for refunds, adapters, api-keys, templates,
// uploads, workspaces, account, admin-portal, billing, onboarding,
// checkout-settings.

export type RefundStatus = 'pending' | 'succeeded' | 'failed';
export type RefundReason = 'requested_by_customer' | 'duplicate' | 'fraudulent' | 'other';

export interface Refund {
  id: string;
  arn: string;
  accountId: string;
  /** The provider charge refunded (a checkout session's `paymentId`). */
  chargeId: string;
  /** The invoice it refunds, when the charge paid one. */
  invoiceId: string | null;
  amount: number;
  currency: CurrencyCode;
  reason: RefundReason;
  status: RefundStatus;
  /** Why the provider refused it (`failed` only). */
  failureCode: string | null;
  failureMessage: string | null;
  metadata: Record<string, string> | null;
  createdAt: string;
  updatedAt: string;
}

// ─── Gift card / store credit ──────────────────────────────────
// One resource spans both: `customerId == null` is an anonymous bearer
// gift card; `customerId` set is store credit tied to a Customer.
export type GiftCardStatus = 'active' | 'redeemed' | 'void' | 'expired';

export interface GiftCard {
  id: string;
  arn: string;
  accountId: string;
  mode: 'live' | 'test';
  code: string;
  currency: CurrencyCode;
  initialBalance: number;
  balance: number;
  status: GiftCardStatus;
  customerId: string | null;
  /** Convenience flag: 'store_credit' when a customer is attached. */
  kind: 'store_credit' | 'gift_card';
  expiresAt: string | null;
  note: string | null;
  issuedSource: string | null;
  issuedRef: string | null;
  metadata: Record<string, string> | null;
  createdAt: string;
  updatedAt: string;
}

export interface GiftCardEntry {
  id: string;
  accountId: string;
  giftCardId: string;
  kind: 'issue' | 'redeem' | 'topup' | 'void';
  delta: number;
  balanceAfter: number;
  currency: CurrencyCode;
  externalSource: string;
  externalRef: string;
  checkoutSessionId: string | null;
  ledgerTxId: string | null;
  note: string | null;
  createdAt: string;
}

export interface GiftCardBalance {
  code: string;
  balance: number;
  currency: CurrencyCode;
  status: GiftCardStatus;
}

/** Result of a redeem/topup — the updated card plus the ledger entry. */
export interface GiftCardMutation {
  giftCard: GiftCard;
  entry: GiftCardEntry;
}

export type AdapterKind = 'xendit' | 'paypal' | 'midtrans' | 'manual';

/** A connected provider (`adapters.list`, `adapters.update*`), per mode. Secrets are never
 *  returned: `secretKeyLast4` and the masked `publicConfig` stand for them. */
export interface AdapterConfig {
  kind: AdapterKind | 'managed';
  status: 'unconfigured' | 'active' | 'error';
  secretKeyLast4: string | null;
  publicConfig: Record<string, unknown> | null;
  configuredAt: string | null;
  lastErrorAt: string | null;
  lastErrorCode: string | null;
}

export interface XenditAdapterInput {
  secretKey: string;
  callbackToken?: string;
}
export interface PaypalAdapterInput {
  clientId: string;
  secret: string;
  mode?: 'live' | 'sandbox';
}
export interface MidtransAdapterInput {
  serverKey: string;
  clientKey: string;
  merchantId: string;
  env?: 'sandbox' | 'production';
}
export interface ManualAdapterInput {
  bankAccounts?: { bankName: string; accountNumber: string; accountHolder: string }[];
  staticQrImageUrl?: string | null;
  instructions?: string | null;
}

/** The managed (xenPlatform) sub-account behind managed payments. */
export interface ManagedOnboardingState {
  subAccountId: string;
  email: string | null;
  onboardingUrl: string | null;
  kybStatus: string;
  capabilitiesStatus: string;
  payoutsReady: boolean;
  lastWebhookAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/** A dashboard API key (`pk_test_…` / `pk_live_…`). Revoking deletes it. */
export interface ApiKey {
  id: string;
  name: string;
  /** The key's first 12 characters, to tell keys apart (`pk_live_3f9a`). */
  keyPrefix: string;
  environment: Mode;
  scopes: string[];
  lastUsedAt: string | null;
  createdAt: string;
  /** The whole key — only returned on create. */
  key?: string;
}

export type TemplateKind = 'checkout' | 'receipt' | 'invoice';

export interface ReceiptTemplateConfig {
  thankYouText?: string;
  footerText?: string | null;
  showTax?: boolean;
  taxLabel?: string;
  /** 0–1, e.g. 0.11 for 11%. */
  taxRate?: number;
  cashierLabel?: string | null;
  showBusinessDetails?: boolean;
  /** `#RRGGBB`. */
  accentColor?: string | null;
}
export interface InvoiceTemplateConfig {
  termsText?: string | null;
  footerText?: string | null;
  showTax?: boolean;
  taxLabel?: string;
  taxRate?: number;
  showBusinessDetails?: boolean;
  accentColor?: string | null;
}
export interface CheckoutTemplateConfig {
  accentColor?: string | null;
  successMessage?: string | null;
  footerTagline?: string | null;
  showBusinessDetails?: boolean;
}
export type TemplateConfig = ReceiptTemplateConfig | InvoiceTemplateConfig | CheckoutTemplateConfig;

export interface Template {
  id: string;
  accountId: string;
  kind: TemplateKind;
  name: string;
  isDefault: boolean;
  /** The template's settings — the fields of the kind's config. */
  config: TemplateConfig;
  createdAt: string;
  updatedAt: string;
}

/** `templates.create`: a name and the kind's config. */
export type TemplateCreateInput =
  | { kind: 'receipt'; name: string; isDefault?: boolean; config: ReceiptTemplateConfig }
  | { kind: 'invoice'; name: string; isDefault?: boolean; config: InvoiceTemplateConfig }
  | { kind: 'checkout'; name: string; isDefault?: boolean; config: CheckoutTemplateConfig };

/** `templates.preview`: renders HTML from a kind and a config, without saving. */
export type TemplatePreviewInput =
  | { kind: 'receipt'; config: ReceiptTemplateConfig }
  | { kind: 'invoice'; config: InvoiceTemplateConfig }
  | { kind: 'checkout'; config: CheckoutTemplateConfig };

/** An uploaded image (POST /api/v1/uploads/image). */
export interface UploadedFile {
  /** Where it is served: `/api/v1/files/<name>`, relative to plugipay.com. */
  url: string;
  /** The file name it was sent under. */
  fileName: string;
  /** Its size in bytes. */
  fileSize: number;
}

export type WorkspaceRole = 'owner' | 'admin' | 'member';

/** A workspace (a Huudis account). A key's `workspaces.list` is its own workspace, with
 *  `id`, `name`, `slug` and `role` only; a person's comes from Huudis with the rest. */
export interface Workspace {
  id: string;
  name: string;
  slug: string;
  role?: WorkspaceRole;
  createdAt?: string;
  joinedAt?: string;
  /** The workspace the person is signed in to. */
  isActive?: boolean;
  isForjioInternal?: boolean;
  /** Set while a deletion is scheduled. */
  pendingDeletionAt?: string | null;
}

/** `workspaces.update` answers with the renamed workspace's id, name and slug. */
export type WorkspaceRename = Pick<Workspace, 'id' | 'name' | 'slug'>;

/** `workspaces.delete` schedules the deletion: it happens at `pendingDeletionAt`. */
export interface WorkspaceDeletion {
  scheduled: boolean;
  pendingDeletionAt: string;
}

/** The signed-in person's Huudis profile. When Huudis can't be reached the API answers
 *  from the session with `id`, `email`, `name` and `emailVerified` only. */
export interface AccountProfile {
  id: string;
  email: string;
  name: string | null;
  emailVerified: boolean;
  locale?: string | null;
  /** False for a person who only signs in with Google / Apple. */
  hasPassword?: boolean;
  mfaEnabled?: boolean;
  pendingDeletionAt?: string | null;
  createdAt?: string;
  lastLoginAt?: string | null;
  memberships?: { role: WorkspaceRole; account: { id: string; name: string; slug: string }; joinedAt: string }[];
}

/** `account.update` answers with the fields it changes. */
export interface AccountProfileUpdate {
  id: string;
  name: string | null;
  locale: string | null;
}

/** One of the person's signed-in sessions. */
export interface BrowserSession {
  id: string;
  userAgent: string | null;
  ip: string | null;
  createdAt: string;
  lastUsedAt: string | null;
  expiresAt: string;
  /** The session making this request. */
  current: boolean;
}

/** A Google or Apple sign-in linked to the person. */
export interface LinkedAccount {
  id: string;
  provider: 'google' | 'apple';
  email: string | null;
  linkedAt: string;
}

/** `account.listLinked`: the linked sign-ins, and whether the person also has a password
 *  (unlinking the last sign-in of a person without one is refused). */
export interface LinkedAccounts {
  hasPassword: boolean;
  providers: LinkedAccount[];
}

/** A member of the active workspace (its Huudis IAM users). */
export interface WorkspaceMember {
  id: string;
  email: string;
  name: string | null;
  emailVerified: boolean;
  role: WorkspaceRole;
  joinedAt: string;
  lastLoginAt: string | null;
  createdAt: string;
  /** The person making this request. */
  isYou: boolean;
  groups: { id: string; name: string }[];
}

/** One of Plugipay's own plans (`billing.listTiers`). A limit of `null` is unlimited. */
export interface BillingTier {
  id: 'starter' | 'growth' | 'scale' | 'enterprise';
  name: string;
  /** IDR per month; null when negotiated. */
  priceMonthlyIdr: number | null;
  /** USD cents per month for merchants billed in USD; null when the tier has no USD price. */
  priceMonthlyUsdCents: number | null;
  /** Plugipay's fee per transaction, 0–1. */
  channelFeeRate: number;
  monthlyTxnCap: number | null;
  maxWebhookEndpoints: number | null;
  maxApiKeys: number | null;
  customBranding: boolean;
  dailyPayouts: boolean;
  support: {
    tier: 'community' | 'email' | 'priority' | 'dedicated';
    responseHours: number | null;
    sla: boolean;
  };
  tagline: string;
  /** Monthly assistant credits the tier grants. */
  agentCredits: number;
  features: string[];
}

/** One of Plugipay's own plans (`billing.listPlans`): `price` is IDR per month, `-1` when
 *  the plan has no fixed price. */
export interface BillingPlan {
  id: string;
  name: string;
  price: number;
}

export interface CheckoutReceiptTemplate {
  footerText: string | null;
  thankYouText: string | null;
  showTax: boolean | null;
  taxLabel: string | null;
  taxRate: number | null;
  cashierLabel: string | null;
  showMerchantAddress: boolean | null;
  merchantAddress: string | null;
  merchantTaxId: string | null;
}

/** The hosted checkout's settings: payment methods, branding and business details. */
export interface CheckoutSettings {
  enabledMethods: string[];
  methodOrder: string[];
  /** methodId → adapter kind, where the merchant picked one. */
  methodAdapter: Record<string, string>;
  brandName: string | null;
  brandLogoUrl: string | null;
  brandAccentColor: string | null;
  brandTagline: string | null;
  businessPhone: string | null;
  businessEmail: string | null;
  businessAddress: string | null;
  businessTaxId: string | null;
  receiptTemplate: CheckoutReceiptTemplate | null;
  /** Computed: the methods the connected adapters can take. */
  availableMethods: string[];
  /** Computed: methodId → the adapter kinds that can process it. */
  methodSupport: Record<string, string[]>;
}

/** `checkoutSettings.update`: only the fields given change. */
export interface CheckoutSettingsUpdate {
  enabledMethods?: string[];
  methodOrder?: string[];
  methodAdapter?: Record<string, string>;
  brandName?: string | null;
  brandLogoUrl?: string | null;
  /** `#RRGGBB`. */
  brandAccentColor?: string | null;
  brandTagline?: string | null;
  businessPhone?: string | null;
  businessEmail?: string | null;
  businessAddress?: string | null;
  businessTaxId?: string | null;
  receiptTemplate?: Partial<CheckoutReceiptTemplate> | null;
}

export interface AdminPortalIdentity {
  /** Active account the probe was scoped to. */
  accountId: string;
  /** Whether the active account is a Forjio-internal workspace (drives admin-nav visibility). */
  isForjioInternal: boolean;
}

// ─── Webhook events ────────────────────────────────────────────
// Every type Plugipay emits (GET /api/v1/events/types). The body is
// `{ id, type, accountId, occurredAt, data }`; `data.object` is the
// resource after the change, in the shape its own GET returns, and
// `data` also names it (`aggregateType`, `aggregateId`).

/** What every event's `data` carries besides its object. */
export interface WebhookEventAggregate {
  aggregateType: string;
  aggregateId: string;
}

interface WebhookEnvelope<T extends string, D> {
  id: string;
  type: T;
  accountId: string;
  occurredAt: string;
  data: D & WebhookEventAggregate;
}

/** `plugipay.webhook_endpoint.disabled.v1`'s object: the endpoint Plugipay switched off. */
export interface DisabledWebhookEndpoint {
  id: string;
  url: string;
  mode: Mode;
  active: false;
  disabledAt: string;
  disabledReason: string;
  consecutiveFailures: number;
  failingSince: string;
}

export type WebhookEvent =
  | WebhookEnvelope<'plugipay.checkout_session.completed.v1', { object: CheckoutSession }>
  | WebhookEnvelope<'plugipay.checkout_session.expired.v1', { object: CheckoutSession }>
  | WebhookEnvelope<'plugipay.invoice.created.v1', { object: Invoice }>
  | WebhookEnvelope<'plugipay.invoice.finalized.v1', { object: Invoice }>
  /** `to`: the address the invoice was emailed to. */
  | WebhookEnvelope<'plugipay.invoice.sent.v1', { object: Invoice; to: string }>
  | WebhookEnvelope<'plugipay.invoice.paid.v1', { object: Invoice }>
  | WebhookEnvelope<'plugipay.invoice.voided.v1', { object: Invoice }>
  /** A Midtrans payment for the invoice is pending. */
  | WebhookEnvelope<'plugipay.invoice.pending.v1', { object: Invoice }>
  /** A Midtrans payment for the invoice failed; `reason` is Midtrans' transaction status. */
  | WebhookEnvelope<'plugipay.invoice.failed.v1', { object: Invoice; reason?: string | null }>
  | WebhookEnvelope<'plugipay.refund.issued.v1', { object: Refund }>
  | WebhookEnvelope<'plugipay.refund.failed.v1', { object: Refund }>
  | WebhookEnvelope<'plugipay.customer.created.v1', { object: Customer }>
  | WebhookEnvelope<'plugipay.customer.updated.v1', { object: Customer }>
  /** The customer as it was before it was deleted. */
  | WebhookEnvelope<'plugipay.customer.deleted.v1', { object: Customer }>
  | WebhookEnvelope<'plugipay.plan.created.v1', { object: Plan }>
  | WebhookEnvelope<'plugipay.plan.updated.v1', { object: Plan }>
  | WebhookEnvelope<'plugipay.plan.archived.v1', { object: Plan }>
  | WebhookEnvelope<'plugipay.subscription.created.v1', { object: Subscription }>
  | WebhookEnvelope<'plugipay.subscription.updated.v1', { object: Subscription }>
  | WebhookEnvelope<'plugipay.subscription.paused.v1', { object: Subscription }>
  | WebhookEnvelope<'plugipay.subscription.resumed.v1', { object: Subscription }>
  | WebhookEnvelope<'plugipay.subscription.canceled.v1', { object: Subscription }>
  /** From the renewal job `object` carries only `id`, `currentPeriodStart` and
   *  `currentPeriodEnd`; from a test clock, the whole subscription plus `daysAdvanced`. */
  | WebhookEnvelope<'plugipay.subscription.renewed.v1', {
      object: Pick<Subscription, 'id' | 'currentPeriodStart' | 'currentPeriodEnd'> & Partial<Subscription>;
      daysAdvanced?: number;
    }>
  | WebhookEnvelope<'plugipay.payout.created.v1', { object: Payout }>
  | WebhookEnvelope<'plugipay.payout.in_transit.v1', { object: Payout }>
  | WebhookEnvelope<'plugipay.payout.paid.v1', { object: Payout }>
  | WebhookEnvelope<'plugipay.payout.failed.v1', { object: Payout }>
  | WebhookEnvelope<'plugipay.payout.cancelled.v1', { object: Payout }>
  | WebhookEnvelope<'plugipay.gift_card.issued.v1', { object: GiftCard }>
  | WebhookEnvelope<'plugipay.gift_card.redeemed.v1', { object: GiftCard; entry: GiftCardEntry }>
  | WebhookEnvelope<'plugipay.gift_card.topped_up.v1', { object: GiftCard; entry: GiftCardEntry }>
  | WebhookEnvelope<'plugipay.gift_card.voided.v1', { object: GiftCard }>
  | WebhookEnvelope<'plugipay.webhook_endpoint.disabled.v1', { object: DisabledWebhookEndpoint }>;

/** Every event type Plugipay emits. */
export type WebhookEventType = WebhookEvent['type'];

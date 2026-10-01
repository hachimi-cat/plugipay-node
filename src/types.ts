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
export type CheckoutMethod = 'qris' | 'va' | 'ewallet' | 'card' | 'retail' | 'paypal';

export interface Customer {
  id: string;
  accountId: string;
  email: string | null;
  name: string | null;
  phone: string | null;
  externalId: string | null;
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

export interface CheckoutSession {
  id: string;
  accountId: string;
  customerId: string | null;
  amount: number;
  currency: CurrencyCode;
  status: 'open' | 'pending' | 'completed' | 'expired' | 'canceled' | 'pending_review';
  methods: CheckoutMethod[];
  adapter: string | null;
  lineItems: unknown;
  successUrl: string;
  cancelUrl: string;
  hostedUrl: string;
  expiresAt: string;
  completedAt: string | null;
  metadata: Record<string, string> | null;
  createdAt: string;
  updatedAt: string;
}

export interface Invoice {
  id: string;
  accountId: string;
  customerId: string;
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
  hostedInvoiceUrl: string | null;
  lines: InvoiceLine[];
  createdAt: string;
  updatedAt: string;
}

export interface InvoiceLine {
  id: string;
  description: string;
  quantity: number;
  unitAmount: number;
  amount: number;
}

export interface Subscription {
  id: string;
  accountId: string;
  customerId: string;
  planId: string;
  status: 'trialing' | 'active' | 'past_due' | 'canceled' | 'paused' | 'incomplete';
  currentPeriodStart: string;
  currentPeriodEnd: string;
  cancelAtPeriodEnd: boolean;
  trialEndsAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PortalSession {
  id: string;
  customerId: string;
  url: string;
  returnUrl: string;
  expiresAt: string;
}

export interface PartnerWorkspace {
  accountId: string;
  partner: 'storlaunch' | 'fulkruma' | 'ripllo';
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
  accountId: string;
  url: string;
  events: string[];
  description: string | null;
  active: boolean;
  secret?: string; // only returned on create
  createdAt: string;
  updatedAt: string;
}

export interface EventRecord {
  id: string;
  type: string;
  accountId: string;
  occurredAt: string;
  data: unknown;
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
  partner: 'storlaunch' | 'fulkruma' | 'ripllo';
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

export type RefundStatus = 'pending' | 'succeeded' | 'failed' | 'canceled';

export interface Refund {
  id: string;
  accountId: string;
  amount: number;
  currency: CurrencyCode;
  status: RefundStatus;
  reason: string | null;
  sourceType: 'checkout_session' | 'invoice';
  sourceId: string;
  failureReason: string | null;
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

export interface ApiKey {
  id: string;
  accountId: string;
  keyId: string;
  description: string | null;
  scope: string;
  /** Only returned on create. */
  secret?: string;
  createdAt: string;
  revokedAt: string | null;
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

export interface Workspace {
  id: string;
  accountId: string;
  brandName: string | null;
  businessEmail: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AccountProfile {
  id: string;
  email: string;
  emailVerified: boolean;
  name: string | null;
  mfaEnrolled: boolean;
  createdAt: string;
}

export interface BrowserSession {
  id: string;
  userAgent: string | null;
  ipAddress: string | null;
  current: boolean;
  createdAt: string;
  lastSeenAt: string;
}

export interface LinkedAccount {
  provider: string;
  subject: string;
  email: string | null;
  linkedAt: string;
}

export interface WorkspaceMember {
  id: string;
  email: string;
  role: string;
  joinedAt: string;
}

export interface BillingTier {
  id: string;
  name: string;
  monthly: number;
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

// Webhook events — the subset Plugipay emits. Each carries a typed
// `data.object` matching the resource snapshot at event time.
export type WebhookEvent =
  | { type: 'plugipay.checkout_session.completed.v1'; id: string; accountId: string; occurredAt: string; data: { object: CheckoutSession } }
  | { type: 'plugipay.checkout_session.expired.v1';   id: string; accountId: string; occurredAt: string; data: { object: CheckoutSession } }
  | { type: 'plugipay.invoice.created.v1';            id: string; accountId: string; occurredAt: string; data: { object: Invoice } }
  | { type: 'plugipay.invoice.finalized.v1';          id: string; accountId: string; occurredAt: string; data: { object: Invoice } }
  | { type: 'plugipay.invoice.paid.v1';               id: string; accountId: string; occurredAt: string; data: { object: Invoice } }
  | { type: 'plugipay.invoice.payment_failed.v1';     id: string; accountId: string; occurredAt: string; data: { object: Invoice } }
  | { type: 'plugipay.invoice.voided.v1';             id: string; accountId: string; occurredAt: string; data: { object: Invoice } }
  | { type: 'plugipay.invoice.sent.v1';               id: string; accountId: string; occurredAt: string; data: { object: Invoice; to: string } }
  | { type: 'plugipay.subscription.created.v1';       id: string; accountId: string; occurredAt: string; data: { object: Subscription } }
  | { type: 'plugipay.subscription.canceled.v1';      id: string; accountId: string; occurredAt: string; data: { object: Subscription } }
  | { type: 'plugipay.subscription.paused.v1';        id: string; accountId: string; occurredAt: string; data: { object: Subscription } };

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

export interface Plan {
  id: string;
  accountId: string;
  name: string;
  currency: CurrencyCode;
  interval: 'day' | 'week' | 'month' | 'year';
  amount: number;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Price {
  id: string;
  planId: string;
  currency: CurrencyCode;
  model: 'flat' | 'usage';
  unitAmount: number | null;
  tiers: unknown;
  taxMode: 'inclusive' | 'exclusive';
  active: boolean;
  createdAt: string;
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

export interface AdapterConfig {
  kind: AdapterKind;
  configured: boolean;
  publicConfig?: Record<string, unknown>;
  updatedAt?: string;
}

export interface ManagedOnboardingState {
  state: 'not_started' | 'pending' | 'verified' | 'failed';
  provider: string;
  details?: Record<string, unknown>;
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

export interface Template {
  id: string;
  accountId: string;
  kind: TemplateKind;
  name: string;
  isDefault: boolean;
  document: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface UploadedFile {
  id: string;
  accountId: string;
  url: string;
  mime: string;
  bytes: number;
  filename: string;
  createdAt: string;
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

export interface CheckoutSettings {
  accountId: string;
  brandLogoUrl: string | null;
  brandColor: string | null;
  defaultTemplateId: string | null;
  termsUrl: string | null;
  privacyUrl: string | null;
  updatedAt: string;
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
  | { type: 'plugipay.subscription.created.v1';       id: string; accountId: string; occurredAt: string; data: { object: Subscription } }
  | { type: 'plugipay.subscription.canceled.v1';      id: string; accountId: string; occurredAt: string; data: { object: Subscription } }
  | { type: 'plugipay.subscription.paused.v1';        id: string; accountId: string; occurredAt: string; data: { object: Subscription } };

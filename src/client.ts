import crypto from 'node:crypto';
import {
  ApiEnvelope,
  Customer,
  Plan,
  Price,
  CheckoutSession,
  Invoice,
  Subscription,
  PortalSession,
  PartnerWorkspace,
  PartnerUsageSummary,
  PlugipayError,
  CurrencyCode,
  CheckoutMethod,
  Payout,
  PayoutStatus,
  AvailableBalance,
  BankAccount,
  LedgerEntry,
  LedgerBalance,
  PnLReport,
  CashFlowReport,
  WebhookEndpoint,
  EventRecord,
  ReceiptSummary,
  Refund,
  RefundStatus,
  GiftCard,
  GiftCardStatus,
  GiftCardBalance,
  GiftCardMutation,
  AdapterConfig,
  AdapterKind,
  ManagedOnboardingState,
  ApiKey,
  Template,
  TemplateKind,
  UploadedFile,
  Workspace,
  AccountProfile,
  BrowserSession,
  LinkedAccount,
  WorkspaceMember,
  BillingTier,
  CheckoutSettings,
  AdminPortalIdentity,
} from './types.js';

export interface PlugipayClientOptions {
  /** HMAC access key id (e.g. 'ak_live_...'). */
  keyId: string;
  /** HMAC secret for the key. */
  secret: string;
  /** Where to find Plugipay. Defaults to production. */
  baseUrl?: string;
  /** Optional merchant accountId to scope calls against. Forwarded as
   *  X-Plugipay-On-Behalf-Of. Only allowed for platform-admin keys. */
  onBehalfOf?: string;
  /** Per-request fetch timeout in ms. Default 30s. */
  timeoutMs?: number;
}

interface SignInput {
  method: string;
  path: string;
  body: string | null;
  idempotencyKey?: string;
}

export interface FetchArgs {
  method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  path: string;
  body?: unknown;
  idempotencyKey?: string;
  /** Per-call override for onBehalfOf, e.g. when a single client
   *  instance is reused across merchants. */
  onBehalfOf?: string;
}

export class PlugipayClient {
  private readonly keyId: string;
  private readonly secret: string;
  private readonly baseUrl: string;
  private readonly defaultOnBehalfOf: string | undefined;
  private readonly timeoutMs: number;

  constructor(opts: PlugipayClientOptions) {
    if (!opts.keyId || !opts.secret) {
      throw new Error('PlugipayClient: keyId and secret are required');
    }
    this.keyId = opts.keyId;
    this.secret = opts.secret;
    this.baseUrl = (opts.baseUrl ?? 'https://plugipay.com').replace(/\/+$/, '');
    this.defaultOnBehalfOf = opts.onBehalfOf;
    this.timeoutMs = opts.timeoutMs ?? 30_000;
  }

  /** Clone with a different onBehalfOf — useful for platform keys acting
   *  across many merchants. */
  forMerchant(accountId: string): PlugipayClient {
    return new PlugipayClient({
      keyId: this.keyId,
      secret: this.secret,
      baseUrl: this.baseUrl,
      onBehalfOf: accountId,
      timeoutMs: this.timeoutMs,
    });
  }

  // ─── Low-level request ──────────────────────────────────────

  private sign({ method, path, body, idempotencyKey }: SignInput): { signature: string; timestamp: string } {
    const ts = String(Math.floor(Date.now() / 1000));
    const bodyHash = crypto.createHash('sha256').update(body ?? '').digest('hex');
    const idem = idempotencyKey ? `\n${idempotencyKey}` : '';
    const stringToSign = `${method.toUpperCase()}\n${path}\n${ts}\n${bodyHash}${idem}`;
    const signature = crypto.createHmac('sha256', this.secret).update(stringToSign).digest('hex');
    return { signature, timestamp: ts };
  }

  async request<T>(args: FetchArgs): Promise<T> {
    const bodyJson = args.body !== undefined ? JSON.stringify(args.body) : null;
    const { signature, timestamp } = this.sign({
      method: args.method,
      path: args.path,
      body: bodyJson,
      idempotencyKey: args.idempotencyKey,
    });
    const headers: Record<string, string> = {
      Accept: 'application/json',
      Authorization: `Plugipay-HMAC-SHA256 keyId=${this.keyId}, scope=*, signature=${signature}`,
      'X-Plugipay-Timestamp': timestamp,
      ...(bodyJson ? { 'Content-Type': 'application/json' } : {}),
      ...(args.idempotencyKey ? { 'Idempotency-Key': args.idempotencyKey } : {}),
    };
    const effectiveOnBehalf = args.onBehalfOf ?? this.defaultOnBehalfOf;
    if (effectiveOnBehalf) headers['X-Plugipay-On-Behalf-Of'] = effectiveOnBehalf;

    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), this.timeoutMs);
    let res: Response;
    try {
      res = await fetch(`${this.baseUrl}${args.path}`, {
        method: args.method,
        headers,
        body: bodyJson ?? undefined,
        signal: ctrl.signal,
      });
    } catch (e) {
      clearTimeout(timer);
      if ((e as Error).name === 'AbortError') {
        throw new PlugipayError(0, 'timeout', `Plugipay request timed out after ${this.timeoutMs}ms`);
      }
      throw new PlugipayError(0, 'network_error', (e as Error).message);
    }
    clearTimeout(timer);

    const text = await res.text();
    let env: ApiEnvelope<T>;
    try { env = JSON.parse(text) as ApiEnvelope<T>; }
    catch { throw new PlugipayError(res.status, 'invalid_response', `Non-JSON response: ${text.slice(0, 200)}`); }
    if (!res.ok || env.error) {
      const err = env.error ?? { code: 'unknown', message: `HTTP ${res.status}` };
      throw new PlugipayError(res.status, err.code, err.message, env.meta?.requestId);
    }
    return env.data as T;
  }

  // List endpoints on the backend put `cursor` + `hasMore` in `meta`, not in
  // the `data` payload (which is a bare array). Callers in the SDK want
  // `{ data, cursor, hasMore }`, so this helper re-shapes on the way out.
  private async requestList<T>(args: FetchArgs): Promise<{ data: T[]; cursor: string | null; hasMore: boolean }> {
    const bodyJson = args.body !== undefined ? JSON.stringify(args.body) : null;
    const { signature, timestamp } = this.sign({
      method: args.method,
      path: args.path,
      body: bodyJson,
      idempotencyKey: args.idempotencyKey,
    });
    const headers: Record<string, string> = {
      Accept: 'application/json',
      Authorization: `Plugipay-HMAC-SHA256 keyId=${this.keyId}, scope=*, signature=${signature}`,
      'X-Plugipay-Timestamp': timestamp,
      ...(bodyJson ? { 'Content-Type': 'application/json' } : {}),
      ...(args.idempotencyKey ? { 'Idempotency-Key': args.idempotencyKey } : {}),
    };
    const effectiveOnBehalf = args.onBehalfOf ?? this.defaultOnBehalfOf;
    if (effectiveOnBehalf) headers['X-Plugipay-On-Behalf-Of'] = effectiveOnBehalf;

    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), this.timeoutMs);
    let res: Response;
    try {
      res = await fetch(`${this.baseUrl}${args.path}`, {
        method: args.method,
        headers,
        body: bodyJson ?? undefined,
        signal: ctrl.signal,
      });
    } catch (e) {
      clearTimeout(timer);
      if ((e as Error).name === 'AbortError') {
        throw new PlugipayError(0, 'timeout', `Plugipay request timed out after ${this.timeoutMs}ms`);
      }
      throw new PlugipayError(0, 'network_error', (e as Error).message);
    }
    clearTimeout(timer);

    const text = await res.text();
    let env: ApiEnvelope<T[]> & { meta?: { cursor?: string | null; hasMore?: boolean } };
    try { env = JSON.parse(text) as typeof env; }
    catch { throw new PlugipayError(res.status, 'invalid_response', `Non-JSON response: ${text.slice(0, 200)}`); }
    if (!res.ok || env.error) {
      const err = env.error ?? { code: 'unknown', message: `HTTP ${res.status}` };
      throw new PlugipayError(res.status, err.code, err.message, env.meta?.requestId);
    }
    return {
      data: (env.data as T[] | undefined) ?? [],
      cursor: env.meta?.cursor ?? null,
      hasMore: Boolean(env.meta?.hasMore),
    };
  }

  private genIdem(): string {
    return `idem_${crypto.randomUUID()}`;
  }

  // ─── Resources ──────────────────────────────────────────────

  customers = {
    create: (input: { email?: string; name?: string; phone?: string; externalId?: string; metadata?: Record<string, string> }) =>
      this.request<Customer>({ method: 'POST', path: '/api/v1/customers', body: input, idempotencyKey: this.genIdem() }),
    get: (id: string) =>
      this.request<Customer>({ method: 'GET', path: `/api/v1/customers/${id}` }),
    list: (params: { limit?: number; cursor?: string; email?: string } = {}) =>
      this.requestList<Customer>({
        method: 'GET',
        path: `/api/v1/customers${qs(params)}`,
      }),
    update: (id: string, patch: { email?: string; name?: string; phone?: string }) =>
      this.request<Customer>({ method: 'PATCH', path: `/api/v1/customers/${id}`, body: patch }),
  };

  plans = {
    create: (input: { name: string; currency: CurrencyCode; amount: number; interval: 'day' | 'week' | 'month' | 'year' }) =>
      this.request<Plan>({ method: 'POST', path: '/api/v1/plans', body: input, idempotencyKey: this.genIdem() }),
    get: (id: string) => this.request<Plan>({ method: 'GET', path: `/api/v1/plans/${id}` }),
    list: (params: { limit?: number; active?: boolean; cursor?: string; order?: 'asc' | 'desc' } = {}) =>
      this.requestList<Plan>({
        method: 'GET',
        path: `/api/v1/plans${qs(params)}`,
      }),
    update: (id: string, patch: { name?: string; description?: string; active?: boolean; metadata?: Record<string, unknown> }) =>
      this.request<Plan>({ method: 'PATCH', path: `/api/v1/plans/${id}`, body: patch, idempotencyKey: this.genIdem() }),
    archive: (id: string) =>
      this.request<Plan>({ method: 'POST', path: `/api/v1/plans/${id}/archive`, body: {}, idempotencyKey: this.genIdem() }),
    /** Add a new Price (currency variant) to an existing Plan. Used to
     *  attach a USD Price to an IDR-priced Plan so international
     *  customers can subscribe + auto-renew in USD via PayPal. */
    addPrice: (
      planId: string,
      input: {
        currency: CurrencyCode;
        model?: 'flat' | 'usage';
        unitAmount?: number;
        tiers?: unknown;
        taxMode?: 'inclusive' | 'exclusive';
      },
    ) =>
      this.request<Price>({
        method: 'POST',
        path: `/api/v1/plans/${planId}/prices`,
        body: input,
        idempotencyKey: this.genIdem(),
      }),
  };

  checkoutSessions = {
    create: (input: {
      amount: number;
      currency: CurrencyCode;
      methods: CheckoutMethod[];
      successUrl: string;
      cancelUrl: string;
      customerId?: string;
      lineItems?: { name: string; quantity: number; unitAmount: number }[];
      expiresInSec?: number;
      metadata?: Record<string, string>;
      templateId?: string;
    }) =>
      this.request<CheckoutSession>({
        method: 'POST',
        path: '/api/v1/checkout-sessions',
        body: { ...input, lineItems: input.lineItems ?? [] },
        idempotencyKey: this.genIdem(),
      }),
    get: (id: string) => this.request<CheckoutSession>({ method: 'GET', path: `/api/v1/checkout-sessions/${id}` }),
    list: (params: { limit?: number; status?: string; customerId?: string } = {}) =>
      this.requestList<CheckoutSession>({
        method: 'GET',
        path: `/api/v1/checkout-sessions${qs(params)}`,
      }),
    cancel: (id: string) => this.request<CheckoutSession>({ method: 'POST', path: `/api/v1/checkout-sessions/${id}/cancel`, body: {}, idempotencyKey: this.genIdem() }),
    confirm: (id: string) => this.request<CheckoutSession>({ method: 'POST', path: `/api/v1/checkout-sessions/${id}/confirm`, body: {} }),
  };

  invoices = {
    create: (input: {
      customerId: string;
      currency: CurrencyCode;
      lines: { description: string; quantity: number; unitAmount: number }[];
      discount?: number;
      tax?: number;
      dueAt?: string;
      status?: 'draft' | 'open';
      memo?: string;
    }) =>
      this.request<Invoice>({ method: 'POST', path: '/api/v1/invoices', body: input }),
    get: (id: string) => this.request<Invoice>({ method: 'GET', path: `/api/v1/invoices/${id}` }),
    list: (params: { limit?: number; cursor?: string; status?: string; customerId?: string } = {}) =>
      this.requestList<Invoice>({
        method: 'GET',
        path: `/api/v1/invoices${qs(params)}`,
      }),
    finalize: (id: string) => this.request<Invoice>({ method: 'POST', path: `/api/v1/invoices/${id}/finalize`, body: {} }),
    pay: (id: string) => this.request<Invoice>({ method: 'POST', path: `/api/v1/invoices/${id}/pay`, body: {}, idempotencyKey: this.genIdem() }),
    void: (id: string) => this.request<Invoice>({ method: 'POST', path: `/api/v1/invoices/${id}/void`, body: {}, idempotencyKey: this.genIdem() }),
    sendEmail: (id: string, to?: string) =>
      this.request<{ sent: boolean; to: string }>({ method: 'POST', path: `/api/v1/invoices/${id}/send-email`, body: to ? { to } : {} }),
  };

  subscriptions = {
    create: (input: {
      customerId: string;
      planId: string;
      priceId: string;
      trialDays?: number;
      paymentTokenId?: string;
      collectionMethod?: 'charge_automatically' | 'send_invoice';
      metadata?: Record<string, string> | null;
      // One-off credit applied as discount to the first auto-issued invoice.
      // Used for plan-change proration.
      initialDiscount?: number;
    }) =>
      this.request<Subscription>({ method: 'POST', path: '/api/v1/subscriptions', body: input, idempotencyKey: this.genIdem() }),
    get: (id: string) => this.request<Subscription>({ method: 'GET', path: `/api/v1/subscriptions/${id}` }),
    list: (params: { limit?: number; status?: string; customerId?: string; planId?: string } = {}) =>
      this.requestList<Subscription>({
        method: 'GET',
        path: `/api/v1/subscriptions${qs(params)}`,
      }),
    cancel: (id: string, at: 'now' | 'period_end' = 'period_end') =>
      this.request<Subscription>({ method: 'POST', path: `/api/v1/subscriptions/${id}/cancel`, body: { at }, idempotencyKey: this.genIdem() }),
    pause: (id: string, resumeAt?: string) =>
      this.request<Subscription>({ method: 'POST', path: `/api/v1/subscriptions/${id}/pause`, body: resumeAt ? { resumeAt } : {}, idempotencyKey: this.genIdem() }),
    resume: (id: string) => this.request<Subscription>({ method: 'POST', path: `/api/v1/subscriptions/${id}/resume`, body: {}, idempotencyKey: this.genIdem() }),
  };

  portalSessions = {
    create: (input: { customerId: string; returnUrl: string }) =>
      this.request<PortalSession>({ method: 'POST', path: '/api/v1/portal-sessions', body: input, idempotencyKey: this.genIdem() }),
  };

  receipts = {
    list: (params: { limit?: number; cursor?: string; sourceType?: 'checkout_session' | 'invoice'; customerId?: string; issuedAfter?: string; issuedBefore?: string } = {}) =>
      this.requestList<ReceiptSummary>({
        method: 'GET',
        path: `/api/v1/receipts${qs(params)}`,
      }),
    get: (id: string) => this.request<unknown>({ method: 'GET', path: `/api/v1/receipts/${id}` }),
  };

  payouts = {
    create: (input: {
      amount: number;
      currency: CurrencyCode;
      bankCode?: string | null;
      bankName?: string;
      bankAccountNumber?: string;
      bankAccountHolder?: string;
      note?: string | null;
    }) =>
      this.request<Payout>({ method: 'POST', path: '/api/v1/payouts', body: input, idempotencyKey: this.genIdem() }),
    get: (id: string) => this.request<Payout>({ method: 'GET', path: `/api/v1/payouts/${id}` }),
    list: (params: { limit?: number; cursor?: string; status?: PayoutStatus } = {}) =>
      this.requestList<Payout>({
        method: 'GET',
        path: `/api/v1/payouts${qs(params)}`,
      }),
    cancel: (id: string) =>
      this.request<Payout>({ method: 'POST', path: `/api/v1/payouts/${id}/cancel`, body: {}, idempotencyKey: this.genIdem() }),
    markInTransit: (id: string, reference?: string | null) =>
      this.request<Payout>({ method: 'POST', path: `/api/v1/payouts/${id}/mark-in-transit`, body: { reference: reference ?? null }, idempotencyKey: this.genIdem() }),
    markPaid: (id: string, reference?: string | null) =>
      this.request<Payout>({ method: 'POST', path: `/api/v1/payouts/${id}/mark-paid`, body: { reference: reference ?? null }, idempotencyKey: this.genIdem() }),
    markFailed: (id: string, failureReason: string) =>
      this.request<Payout>({ method: 'POST', path: `/api/v1/payouts/${id}/mark-failed`, body: { failureReason }, idempotencyKey: this.genIdem() }),
    balance: () => this.request<AvailableBalance>({ method: 'GET', path: `/api/v1/payouts/balance` }),
    getBankAccount: () => this.request<BankAccount>({ method: 'GET', path: `/api/v1/payouts/bank-account` }),
    updateBankAccount: (input: { bankCode?: string | null; bankName: string; bankAccountNumber: string; bankAccountHolder: string }) =>
      this.request<BankAccount>({ method: 'PATCH', path: `/api/v1/payouts/bank-account`, body: input }),
  };

  ledger = {
    list: (params: { limit?: number; cursor?: string; order?: 'asc' | 'desc'; txId?: string; code?: string; sourceType?: string; sourceId?: string } = {}) =>
      this.requestList<LedgerEntry>({
        method: 'GET',
        path: `/api/v1/ledger${qs(params)}`,
      }),
    balances: () =>
      this.request<LedgerBalance[]>({ method: 'GET', path: `/api/v1/ledger/balances` }),
  };

  reports = {
    pnl: (params: { from: string; to: string; currency?: string }) =>
      this.request<PnLReport>({ method: 'GET', path: `/api/v1/reports/pnl${qs(params)}` }),
    cashFlow: (params: { from: string; to: string; currency?: string }) =>
      this.request<CashFlowReport>({ method: 'GET', path: `/api/v1/reports/cash-flow${qs(params)}` }),
    // ledgerCsv is a file download — fetch manually via request() if needed;
    // not auto-exposed here to avoid accidentally buffering large CSVs into
    // the envelope parser.
  };

  webhookEndpoints = {
    list: () => this.request<WebhookEndpoint[]>({ method: 'GET', path: `/api/v1/webhooks` }),
    create: (input: { url: string; events?: string[]; description?: string }) =>
      this.request<WebhookEndpoint>({ method: 'POST', path: `/api/v1/webhooks`, body: input, idempotencyKey: this.genIdem() }),
    delete: (id: string) =>
      this.request<void>({ method: 'DELETE', path: `/api/v1/webhooks/${id}` }),
  };

  events = {
    list: (params: { limit?: number; cursor?: string; order?: 'asc' | 'desc'; type?: string; occurredAfter?: string; occurredBefore?: string } = {}) =>
      this.requestList<EventRecord>({
        method: 'GET',
        path: `/api/v1/events${qs(params)}`,
      }),
    get: (id: string) => this.request<EventRecord>({ method: 'GET', path: `/api/v1/events/${id}` }),
  };

  // ─── Refunds ────────────────────────────────────────────────
  refunds = {
    create: (input: {
      sourceType: 'checkout_session' | 'invoice';
      sourceId: string;
      amount?: number;
      reason?: string;
    }) =>
      this.request<Refund>({ method: 'POST', path: '/api/v1/refunds', body: input, idempotencyKey: this.genIdem() }),
    get: (id: string) => this.request<Refund>({ method: 'GET', path: `/api/v1/refunds/${id}` }),
    list: (params: { limit?: number; cursor?: string; status?: RefundStatus; sourceId?: string } = {}) =>
      this.requestList<Refund>({ method: 'GET', path: `/api/v1/refunds${qs(params)}` }),
  };

  // ─── Gift cards / store credit ─────────────────────────────
  // Stored monetary value — a tender + a financial liability. A card
  // with `customerId` set is store credit; without, an anonymous bearer
  // gift card. Products apply the card in their own checkout then call
  // `redeem` with an idempotent (externalSource, externalRef) pair.
  giftCards = {
    issue: (input: {
      amount: number;
      currency?: CurrencyCode;
      customerId?: string | null;
      code?: string | null;
      expiresAt?: string | null;
      note?: string | null;
      issuedSource?: string | null;
      issuedRef?: string | null;
      metadata?: Record<string, string> | null;
    }) =>
      this.request<GiftCard>({
        method: 'POST',
        path: '/api/v1/gift-cards',
        body: input,
        idempotencyKey: this.genIdem(),
      }),
    list: (params: { limit?: number; cursor?: string; customerId?: string; status?: GiftCardStatus; order?: 'asc' | 'desc' } = {}) =>
      this.requestList<GiftCard>({
        method: 'GET',
        path: `/api/v1/gift-cards${qs(params)}`,
      }),
    /** Look up a card (with balance) by its redemption code. */
    getByCode: (code: string) =>
      this.request<GiftCard>({ method: 'GET', path: `/api/v1/gift-cards/${encodeURIComponent(code)}` }),
    /** Thin balance view by code. */
    balance: (code: string) =>
      this.request<GiftCardBalance>({ method: 'GET', path: `/api/v1/gift-cards/${encodeURIComponent(code)}` }),
    /** Redeem the card as tender. Idempotent on (externalSource, externalRef). */
    redeem: (
      id: string,
      input: { amount: number; externalSource: string; externalRef: string; checkoutSessionId?: string | null; note?: string | null },
    ) =>
      this.request<GiftCardMutation>({
        method: 'POST',
        path: `/api/v1/gift-cards/${id}/redeem`,
        body: input,
        idempotencyKey: this.genIdem(),
      }),
    /** Add value (e.g. refund → store credit). Idempotent on the pair. */
    topup: (
      id: string,
      input: { amount: number; externalSource: string; externalRef: string; note?: string | null },
    ) =>
      this.request<GiftCardMutation>({
        method: 'POST',
        path: `/api/v1/gift-cards/${id}/topup`,
        body: input,
        idempotencyKey: this.genIdem(),
      }),
    void: (id: string, input: { note?: string | null } = {}) =>
      this.request<GiftCard>({
        method: 'POST',
        path: `/api/v1/gift-cards/${id}/void`,
        body: input,
        idempotencyKey: this.genIdem(),
      }),
  };

  // ─── Adapters (payment provider config) ────────────────────
  adapters = {
    list: () => this.request<AdapterConfig[]>({ method: 'GET', path: '/api/v1/adapters' }),
    updateXendit: (config: Record<string, unknown>) =>
      this.request<AdapterConfig>({ method: 'PUT', path: '/api/v1/adapters/xendit', body: config }),
    updatePaypal: (config: Record<string, unknown>) =>
      this.request<AdapterConfig>({ method: 'PUT', path: '/api/v1/adapters/paypal', body: config }),
    updateMidtrans: (config: Record<string, unknown>) =>
      this.request<AdapterConfig>({ method: 'PUT', path: '/api/v1/adapters/midtrans', body: config }),
    updateManual: (config: Record<string, unknown>) =>
      this.request<AdapterConfig>({ method: 'PUT', path: '/api/v1/adapters/manual', body: config }),
    managedOnboardingState: () =>
      this.request<ManagedOnboardingState>({ method: 'GET', path: '/api/v1/adapters/managed/onboarding' }),
    startManagedOnboarding: (input: { kind: AdapterKind; details?: Record<string, unknown> } = { kind: 'xendit' }) =>
      this.request<ManagedOnboardingState>({
        method: 'POST',
        path: '/api/v1/adapters/managed/onboarding',
        body: input,
        idempotencyKey: this.genIdem(),
      }),
    simulateManagedOnboarding: (input: { result: 'verified' | 'failed' } = { result: 'verified' }) =>
      this.request<ManagedOnboardingState>({
        method: 'POST',
        path: '/api/v1/adapters/managed/onboarding/_simulate',
        body: input,
      }),
  };

  // ─── API keys ───────────────────────────────────────────────
  apiKeys = {
    list: () => this.request<ApiKey[]>({ method: 'GET', path: '/api/v1/api-keys' }),
    create: (input: { description?: string; scope?: string }) =>
      this.request<ApiKey>({ method: 'POST', path: '/api/v1/api-keys', body: input, idempotencyKey: this.genIdem() }),
    revoke: (id: string) =>
      this.request<void>({ method: 'DELETE', path: `/api/v1/api-keys/${id}` }),
  };

  // ─── Billing (merchant subscription to Plugipay itself) ────
  billing = {
    listTiers: () => this.request<BillingTier[]>({ method: 'GET', path: '/api/v1/billing/tiers' }),
    listPlans: () => this.request<Plan[]>({ method: 'GET', path: '/api/v1/billing/plans' }),
    refreshTiers: () => this.request<{ refreshed: boolean }>({ method: 'POST', path: '/api/v1/billing/tiers/refresh', body: {} }),
  };

  // ─── Onboarding ─────────────────────────────────────────────
  onboarding = {
    provisionManaged: (input: { businessEmail: string; brandName?: string }) =>
      this.request<Workspace>({
        method: 'POST',
        path: '/api/v1/onboarding/provision-managed',
        body: input,
        idempotencyKey: this.genIdem(),
      }),
  };

  // ─── Checkout settings ──────────────────────────────────────
  checkoutSettings = {
    get: () => this.request<CheckoutSettings>({ method: 'GET', path: '/api/v1/checkout/settings' }),
    update: (patch: Partial<CheckoutSettings>) =>
      this.request<CheckoutSettings>({ method: 'PATCH', path: '/api/v1/checkout/settings', body: patch }),
  };

  // ─── Templates ──────────────────────────────────────────────
  templates = {
    list: (params: { kind?: TemplateKind } = {}) =>
      this.request<Template[]>({ method: 'GET', path: `/api/v1/templates${qs(params)}` }),
    get: (id: string) => this.request<Template>({ method: 'GET', path: `/api/v1/templates/${id}` }),
    create: (input: { kind: TemplateKind; name: string; document: Record<string, unknown> }) =>
      this.request<Template>({ method: 'POST', path: '/api/v1/templates', body: input, idempotencyKey: this.genIdem() }),
    update: (id: string, patch: Partial<{ name: string; document: Record<string, unknown> }>) =>
      this.request<Template>({ method: 'PATCH', path: `/api/v1/templates/${id}`, body: patch }),
    makeDefault: (id: string) =>
      this.request<Template>({ method: 'POST', path: `/api/v1/templates/${id}/make-default`, body: {} }),
    duplicate: (id: string, name?: string) =>
      this.request<Template>({
        method: 'POST',
        path: `/api/v1/templates/${id}/duplicate`,
        body: name ? { name } : {},
        idempotencyKey: this.genIdem(),
      }),
    preview: (input: { kind: TemplateKind; document: Record<string, unknown>; sampleData?: Record<string, unknown> }) =>
      this.request<{ html: string }>({ method: 'POST', path: '/api/v1/templates/preview', body: input }),
    delete: (id: string) =>
      this.request<void>({ method: 'DELETE', path: `/api/v1/templates/${id}` }),
  };

  // ─── Uploads ────────────────────────────────────────────────
  uploads = {
    /** Upload an image. Pass the raw bytes + filename + mime. */
    image: (input: { filename: string; mime: string; base64: string }) =>
      this.request<UploadedFile>({ method: 'POST', path: '/api/v1/uploads/image', body: input }),
  };

  // ─── Workspaces (merchant-facing CRUD) ─────────────────────
  workspaces = {
    list: () => this.request<Workspace[]>({ method: 'GET', path: '/api/v1/workspaces' }),
    create: (input: { brandName?: string; businessEmail?: string }) =>
      this.request<Workspace>({ method: 'POST', path: '/api/v1/workspaces', body: input, idempotencyKey: this.genIdem() }),
    update: (id: string, patch: Partial<{ brandName: string; businessEmail: string }>) =>
      this.request<Workspace>({ method: 'PATCH', path: `/api/v1/workspaces/${id}`, body: patch }),
    delete: (id: string) =>
      this.request<void>({ method: 'DELETE', path: `/api/v1/workspaces/${id}` }),
  };

  // ─── Account (merchant profile + sessions + linked) ────────
  account = {
    get: () => this.request<AccountProfile>({ method: 'GET', path: '/api/v1/account' }),
    update: (patch: Partial<{ name: string }>) =>
      this.request<AccountProfile>({ method: 'PATCH', path: '/api/v1/account', body: patch }),
    listSessions: () => this.request<BrowserSession[]>({ method: 'GET', path: '/api/v1/account/sessions' }),
    revokeSession: (id: string) =>
      this.request<void>({ method: 'POST', path: `/api/v1/account/sessions/${id}/revoke`, body: {} }),
    revokeAllSessions: () =>
      this.request<{ revoked: number }>({ method: 'POST', path: '/api/v1/account/sessions/revoke-all', body: {} }),
    listLinked: () => this.request<LinkedAccount[]>({ method: 'GET', path: '/api/v1/account/linked-accounts' }),
    unlink: (provider: string) =>
      this.request<void>({ method: 'DELETE', path: `/api/v1/account/linked-accounts/${provider}` }),
    changeEmail: (input: { newEmail: string; password: string }) =>
      this.request<{ pendingVerification: boolean }>({ method: 'POST', path: '/api/v1/account/email-change', body: input }),
    changePassword: (input: { currentPassword: string; newPassword: string }) =>
      this.request<void>({ method: 'POST', path: '/api/v1/account/password-change', body: input }),
    listMembers: () => this.request<WorkspaceMember[]>({ method: 'GET', path: '/api/v1/account/members' }),
  };

  // ─── Admin portal (Plugipay internal operators) ───────────
  adminPortal = {
    me: () => this.request<AdminPortalIdentity>({ method: 'GET', path: '/api/v1/admin-portal/me' }),
    listBillingAccounts: () =>
      this.request<unknown[]>({ method: 'GET', path: '/api/v1/admin-portal/billing-accounts' }),
    updateBillingAccount: (accountId: string, patch: Record<string, unknown>) =>
      this.request<unknown>({ method: 'PATCH', path: `/api/v1/admin-portal/billing-accounts/${accountId}`, body: patch }),
    listPartners: () => this.request<unknown[]>({ method: 'GET', path: '/api/v1/admin-portal/partners' }),
    createPartner: (input: Record<string, unknown>) =>
      this.request<unknown>({ method: 'POST', path: '/api/v1/admin-portal/partners', body: input }),
    updatePartner: (id: string, patch: Record<string, unknown>) =>
      this.request<unknown>({ method: 'PATCH', path: `/api/v1/admin-portal/partners/${id}`, body: patch }),
    deletePartner: (id: string) =>
      this.request<void>({ method: 'DELETE', path: `/api/v1/admin-portal/partners/${id}` }),
  };

  // ─── Platform admin (requires plugipay:platform:admin scope) ─
  admin = {
    provisionWorkspace: (input: {
      accountId: string;
      partner: 'storlaunch' | 'fulkruma' | 'ripllo';
      discountRate: number;
      brandName?: string;
      businessEmail?: string;
    }) => this.request<PartnerWorkspace>({ method: 'POST', path: '/api/v1/admin/workspaces', body: input }),
    getWorkspace: (accountId: string) =>
      this.request<PartnerWorkspace>({ method: 'GET', path: `/api/v1/admin/workspaces/${accountId}` }),
    partnerUsage: (params: { partner: 'storlaunch' | 'fulkruma' | 'ripllo'; from: string; to: string }) =>
      this.request<PartnerUsageSummary>({
        method: 'GET',
        path: `/api/v1/admin/partner/usage${qs(params)}`,
      }),
  };
}

function qs(params: Record<string, unknown>): string {
  const parts = Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== null)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`);
  return parts.length > 0 ? `?${parts.join('&')}` : '';
}

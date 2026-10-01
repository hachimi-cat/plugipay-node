import crypto from 'node:crypto';
import { GeneratedApi } from './api.generated.js';
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
  WebhookDelivery,
  WebhookDeliveryStatus,
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
  XenditAdapterInput,
  PaypalAdapterInput,
  MidtransAdapterInput,
  ManualAdapterInput,
  ApiKey,
  Template,
  TemplateKind,
  TemplateCreateInput,
  TemplatePreviewInput,
  TemplateConfig,
  PlanCreateInput,
  PriceInput,
  PortalFeatures,
  CheckoutSettingsUpdate,
  BillingPlan,
  UploadedFile,
  Workspace,
  AccountProfile,
  BrowserSession,
  LinkedAccounts,
  AccountProfileUpdate,
  WorkspaceRename,
  WorkspaceDeletion,
  PartnerId,
  RefundReason,
  SubscriptionCancelReason,
  SubscriptionStatus,
  CheckoutSessionStatus,
  WorkspaceMember,
  BillingTier,
  CheckoutSettings,
  AdminPortalIdentity,
} from './types.js';

/** An image for `uploads.image`: its bytes, or (the 0.8 shape) base64 text. */
export type UploadImageInput =
  | { file: Blob | Uint8Array | ArrayBuffer; filename?: string; contentType?: string }
  | { base64: string; filename: string; mime?: string };

function isFormData(v: unknown): v is FormData {
  return typeof FormData !== 'undefined' && v instanceof FormData;
}

export interface PlugipayClientOptions {
  /** HMAC access key id (e.g. 'ak_live_...'). With `secret`; or pass `apiKey`. */
  keyId?: string;
  /** HMAC secret for the key. */
  secret?: string;
  /** A key minted in the dashboard (Settings → API keys), `pk_live_…` / `pk_test_…`:
   *  sent as `Authorization: Bearer <key>` instead of signing with keyId + secret. */
  apiKey?: string;
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
  private readonly apiKey: string | undefined;
  private readonly baseUrl: string;
  private readonly defaultOnBehalfOf: string | undefined;
  private readonly timeoutMs: number;

  constructor(opts: PlugipayClientOptions) {
    if (!opts.apiKey && (!opts.keyId || !opts.secret)) {
      throw new Error('PlugipayClient: keyId and secret (or apiKey) are required');
    }
    this.keyId = opts.keyId ?? '';
    this.secret = opts.secret ?? '';
    this.apiKey = opts.apiKey;
    this.baseUrl = (opts.baseUrl ?? 'https://plugipay.com').replace(/\/+$/, '');
    this.defaultOnBehalfOf = opts.onBehalfOf;
    this.timeoutMs = opts.timeoutMs ?? 30_000;
  }

  /** Clone with a different onBehalfOf — useful for platform keys acting
   *  across many merchants. */
  forMerchant(accountId: string): PlugipayClient {
    return new PlugipayClient({
      keyId: this.keyId || undefined,
      secret: this.secret || undefined,
      apiKey: this.apiKey,
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

  /** The credential headers: a dashboard key as Bearer, else the HMAC signature
   *  (over the exact body bytes sent) and its timestamp. */
  private authHeaders(input: SignInput): Record<string, string> {
    if (this.apiKey) return { Authorization: `Bearer ${this.apiKey}` };
    const { signature, timestamp } = this.sign(input);
    return {
      Authorization: `Plugipay-HMAC-SHA256 keyId=${this.keyId}, scope=*, signature=${signature}`,
      'X-Plugipay-Timestamp': timestamp,
    };
  }

  /** Send a request, signed (with a fresh timestamp) as it is sent. `body` is sent as JSON,
   *  or, when it is a FormData (a file upload), as multipart/form-data: the server hashes
   *  no multipart body for the signature, so it is signed as an empty body. */
  async request<T>(args: FetchArgs): Promise<T> {
    const form = isFormData(args.body) ? args.body : null;
    const bodyJson = !form && args.body !== undefined ? JSON.stringify(args.body) : null;
    const headers: Record<string, string> = {
      Accept: 'application/json',
      ...this.authHeaders({ method: args.method, path: args.path, body: bodyJson, idempotencyKey: args.idempotencyKey }),
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
        // a FormData: fetch writes the multipart body and its Content-Type (with the boundary)
        body: form ?? bodyJson ?? undefined,
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
    // DELETE-style endpoints answer 204 with no body — there is no
    // envelope to parse and nothing to return.
    if (res.status === 204 || (res.ok && text === '')) return undefined as T;
    // A route that renders a page (POST /templates/preview) answers 2xx with the HTML
    // itself, not an envelope: that text is the result.
    if (res.ok && /^text\/html\b/i.test(res.headers?.get?.('content-type') ?? '')) return text as T;
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
    const headers: Record<string, string> = {
      Accept: 'application/json',
      ...this.authHeaders({ method: args.method, path: args.path, body: bodyJson, idempotencyKey: args.idempotencyKey }),
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

  /** Every feature route, one method each (generated from the API spec: api.generated.ts). */
  readonly api: GeneratedApi = new GeneratedApi(this);

  /** The call behind `client.api.*`: signed like every other request, with an
   *  idempotency key on writes. A file upload's body is a FormData, sent as it is. */
  async apigenRequest(method: string, path: string, query: Record<string, unknown> | undefined, body: unknown): Promise<unknown> {
    const qs = query
      ? new URLSearchParams(
          Object.entries(query).map(([k, v]): [string, string] => [k, typeof v === 'string' ? v : JSON.stringify(v)]),
        ).toString()
      : '';
    return this.request<unknown>({
      method: method as FetchArgs['method'],
      path: qs ? `${path}?${qs}` : path,
      body,
      idempotencyKey: method === 'GET' ? undefined : this.genIdem(),
    });
  }

  // ─── Resources ──────────────────────────────────────────────

  customers = {
    create: (input: {
      email?: string;
      name?: string;
      phone?: string;
      externalId?: string;
      taxId?: string;
      defaultPaymentTokenId?: string;
      metadata?: Record<string, string> | null;
    }) =>
      this.request<Customer>({ method: 'POST', path: '/api/v1/customers', body: input, idempotencyKey: this.genIdem() }),
    get: (id: string) =>
      this.request<Customer>({ method: 'GET', path: `/api/v1/customers/${id}` }),
    list: (params: { limit?: number; cursor?: string; order?: 'asc' | 'desc'; email?: string; externalId?: string; createdAfter?: string } = {}) =>
      this.requestList<Customer>({
        method: 'GET',
        path: `/api/v1/customers${qs(params)}`,
      }),
    /** Change a customer; only the fields given change (`metadata: null` clears it). */
    update: (
      id: string,
      patch: {
        email?: string;
        name?: string;
        phone?: string;
        externalId?: string;
        taxId?: string;
        defaultPaymentTokenId?: string;
        metadata?: Record<string, string> | null;
      },
    ) =>
      this.request<Customer>({ method: 'PATCH', path: `/api/v1/customers/${id}`, body: patch, idempotencyKey: this.genIdem() }),
    /** Delete a customer with no money history (409 when subscriptions, invoices, paid or
     *  in-flight checkout sessions, or gift cards hold it). */
    delete: (id: string) =>
      this.request<void>({ method: 'DELETE', path: `/api/v1/customers/${id}`, idempotencyKey: this.genIdem() }),
  };

  plans = {
    /** Create a plan with its prices. For a single flat price, `currency` + `amount`
     *  (minor units) stand for `prices: [{ currency, model: 'flat', unitAmount: amount }]`. */
    create: (input: PlanCreateInput) => {
      const { currency, amount, prices, portalFeatures, ...rest } = input;
      const body = {
        ...rest,
        portalFeatures: portalFeatures ?? DEFAULT_PORTAL_FEATURES,
        prices: prices ?? (currency !== undefined && amount !== undefined
          ? [{ currency, model: 'flat' as const, unitAmount: amount }]
          : []),
      };
      return this.request<Plan>({ method: 'POST', path: '/api/v1/plans', body, idempotencyKey: this.genIdem() });
    },
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
    addPrice: (planId: string, input: Omit<PriceInput, 'model'> & { model?: PriceInput['model'] }) =>
      this.request<Price>({
        method: 'POST',
        path: `/api/v1/plans/${planId}/prices`,
        // `model` defaults to flat (the API requires one)
        body: { ...input, model: input.model ?? 'flat' },
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
    /** `createdAfter` / `createdBefore`: ISO-8601 bounds on `createdAt`. */
    list: (params: { limit?: number; cursor?: string; order?: 'asc' | 'desc'; status?: CheckoutSessionStatus; customerId?: string; createdAfter?: string; createdBefore?: string } = {}) =>
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
      this.request<Invoice>({ method: 'POST', path: '/api/v1/invoices', body: input, idempotencyKey: this.genIdem() }),
    get: (id: string) => this.request<Invoice>({ method: 'GET', path: `/api/v1/invoices/${id}` }),
    list: (params: { limit?: number; cursor?: string; status?: string; customerId?: string } = {}) =>
      this.requestList<Invoice>({
        method: 'GET',
        path: `/api/v1/invoices${qs(params)}`,
      }),
    finalize: (id: string) => this.request<Invoice>({ method: 'POST', path: `/api/v1/invoices/${id}/finalize`, body: {}, idempotencyKey: this.genIdem() }),
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
    /** Change its price, default payment method or metadata (`metadata: null` clears it). */
    update: (id: string, patch: { priceId?: string; defaultPaymentTokenId?: string; metadata?: Record<string, string> | null }) =>
      this.request<Subscription>({ method: 'PATCH', path: `/api/v1/subscriptions/${id}`, body: patch, idempotencyKey: this.genIdem() }),
    list: (params: { limit?: number; cursor?: string; order?: 'asc' | 'desc'; status?: SubscriptionStatus; customerId?: string; planId?: string } = {}) =>
      this.requestList<Subscription>({
        method: 'GET',
        path: `/api/v1/subscriptions${qs(params)}`,
      }),
    /** `period_end` (the default) sets `cancelAt`; `now` cancels at once. */
    cancel: (id: string, at: 'now' | 'period_end' = 'period_end', reason?: SubscriptionCancelReason) =>
      this.request<Subscription>({ method: 'POST', path: `/api/v1/subscriptions/${id}/cancel`, body: reason ? { at, reason } : { at }, idempotencyKey: this.genIdem() }),
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
    /** Change url / events / description, or pause (`active: false`, its queued deliveries
     *  fail) and re-enable (`active: true`, also after Plugipay switched it off for failing;
     *  clears the failure streak). */
    update: (id: string, input: { url?: string; events?: string[]; description?: string; active?: boolean }) =>
      this.request<WebhookEndpoint>({ method: 'PATCH', path: `/api/v1/webhooks/${encodeURIComponent(id)}`, body: input }),
    delete: (id: string) =>
      this.request<void>({ method: 'DELETE', path: `/api/v1/webhooks/${id}` }),
    /** The delivery log, newest first: one row per event per endpoint with every attempt.
     *  Page with `cursor` while `hasMore`. */
    listDeliveries: (params: { limit?: number; cursor?: string; endpointId?: string; status?: WebhookDeliveryStatus; type?: string } = {}) =>
      this.requestList<WebhookDelivery>({ method: 'GET', path: `/api/v1/webhooks/deliveries${qs(params)}` }),
    getDelivery: (id: string) =>
      this.request<WebhookDelivery>({ method: 'GET', path: `/api/v1/webhooks/deliveries/${encodeURIComponent(id)}` }),
    /** Queue one more attempt now at a failed delivery (or send a succeeded one again); it
     *  goes out within seconds. 409 `already_queued` / `endpoint_disabled`. */
    retryDelivery: (id: string) =>
      this.request<WebhookDelivery>({ method: 'POST', path: `/api/v1/webhooks/deliveries/${encodeURIComponent(id)}/retry`, body: {} }),
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
    /** Send money back to the buyer through the PSP that took it.
     *
     *  Name the charge either way: `sourceType` + `sourceId` for the
     *  checkout session (what most callers hold), or `chargeId` for the
     *  gateway's own payment id.
     *
     *  A provider that refuses the refund answers 422 with its own
     *  reason — the Refund row is kept as `failed`, and no ledger
     *  movement is recorded. Only `succeeded` means the buyer is
     *  actually getting their money. */
    create: (input: {
      sourceType?: 'checkout_session' | 'invoice';
      sourceId?: string;
      chargeId?: string;
      amount?: number;
      reason?: RefundReason;
      metadata?: Record<string, string> | null;
    }) =>
      this.request<Refund>({ method: 'POST', path: '/api/v1/refunds', body: input, idempotencyKey: this.genIdem() }),
    get: (id: string) => this.request<Refund>({ method: 'GET', path: `/api/v1/refunds/${id}` }),
    /** Refunds in the key's mode, newest first; `chargeId` lists one payment's refunds (a
     *  checkout session's `paymentId`, or its own id for a manual payment). */
    list: (params: { limit?: number; cursor?: string; order?: 'asc' | 'desc'; status?: RefundStatus; chargeId?: string } = {}) =>
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
    /** The connected providers in the key's mode, one entry per kind (the API answers
     *  an object keyed by kind; this returns its values). */
    list: async () => {
      const byKind = await this.request<Record<string, AdapterConfig> | null>({ method: 'GET', path: '/api/v1/adapters' });
      return Object.values(byKind ?? {});
    },
    updateXendit: (config: XenditAdapterInput) =>
      this.request<AdapterConfig>({ method: 'PUT', path: '/api/v1/adapters/xendit', body: config, idempotencyKey: this.genIdem() }),
    updatePaypal: (config: PaypalAdapterInput) =>
      this.request<AdapterConfig>({ method: 'PUT', path: '/api/v1/adapters/paypal', body: config, idempotencyKey: this.genIdem() }),
    updateMidtrans: (config: MidtransAdapterInput) =>
      this.request<AdapterConfig>({ method: 'PUT', path: '/api/v1/adapters/midtrans', body: config, idempotencyKey: this.genIdem() }),
    updateManual: (config: ManualAdapterInput) =>
      this.request<AdapterConfig>({ method: 'PUT', path: '/api/v1/adapters/manual', body: config, idempotencyKey: this.genIdem() }),
    /** The managed sub-account, or null before onboarding started. */
    managedOnboardingState: () =>
      this.request<ManagedOnboardingState | null>({ method: 'GET', path: '/api/v1/adapters/managed/onboarding' }),
    /** Start managed payments: provisions the sub-account for the payout `email`. */
    startManagedOnboarding: (input: { email: string }) =>
      this.request<ManagedOnboardingState>({
        method: 'POST',
        path: '/api/v1/adapters/managed/onboarding',
        body: input,
        idempotencyKey: this.genIdem(),
      }),
    /** Staging only (404 on plugipay.com): set the sub-account's verification state. */
    simulateManagedOnboarding: (
      input: {
        kybStatus?: 'not_started' | 'invited' | 'registered' | 'live' | 'rejected';
        capabilitiesStatus?: 'pending' | 'live' | 'declined' | 'resubmission_required';
        payoutsReady?: boolean;
      } = { kybStatus: 'live', capabilitiesStatus: 'live', payoutsReady: true },
    ) =>
      this.request<ManagedOnboardingState>({
        method: 'POST',
        path: '/api/v1/adapters/managed/onboarding/_simulate',
        body: input,
      }),
  };

  // ─── API keys ───────────────────────────────────────────────
  /** Person-only: API keys are managed by a signed-in person in the dashboard; the API
   *  answers a key here with 403 person_only (a key must not mint or revoke keys). */
  apiKeys = {
    list: () => this.request<ApiKey[]>({ method: 'GET', path: '/api/v1/api-keys' }),
    create: (input: { name: string; environment?: 'test' | 'live'; scopes?: string[] }) =>
      this.request<ApiKey>({ method: 'POST', path: '/api/v1/api-keys', body: input, idempotencyKey: this.genIdem() }),
    revoke: (id: string) =>
      this.request<void>({ method: 'DELETE', path: `/api/v1/api-keys/${id}` }),
  };

  // ─── Billing (merchant subscription to Plugipay itself) ────
  billing = {
    listTiers: () => this.request<BillingTier[]>({ method: 'GET', path: '/api/v1/billing/tiers' }),
    listPlans: () => this.request<BillingPlan[]>({ method: 'GET', path: '/api/v1/billing/plans' }),
    refreshTiers: () => this.request<{ refreshed: boolean }>({ method: 'POST', path: '/api/v1/billing/tiers/refresh', body: {} }),
  };

  // ─── Onboarding ─────────────────────────────────────────────
  onboarding = {
    /** Provision the managed (xenPlatform) sub-account for the key's workspace; returns
     *  its id. Takes no input (the API reads none). */
    provisionManaged: () =>
      this.request<{ subAccountId: string }>({
        method: 'POST',
        path: '/api/v1/onboarding/provision-managed',
        body: {},
        idempotencyKey: this.genIdem(),
      }),
  };

  // ─── Checkout settings ──────────────────────────────────────
  checkoutSettings = {
    get: () => this.request<CheckoutSettings>({ method: 'GET', path: '/api/v1/checkout/settings' }),
    update: (patch: CheckoutSettingsUpdate) =>
      this.request<CheckoutSettings>({ method: 'PATCH', path: '/api/v1/checkout/settings', body: patch }),
  };

  // ─── Templates ──────────────────────────────────────────────
  templates = {
    list: (params: { kind?: TemplateKind } = {}) =>
      this.request<Template[]>({ method: 'GET', path: `/api/v1/templates${qs(params)}` }),
    get: (id: string) => this.request<Template>({ method: 'GET', path: `/api/v1/templates/${id}` }),
    create: (input: TemplateCreateInput) =>
      this.request<Template>({ method: 'POST', path: '/api/v1/templates', body: input, idempotencyKey: this.genIdem() }),
    /** Rename a template or replace its config (the whole config: fields left out reset
     *  to their defaults). */
    update: (id: string, patch: { name?: string; config?: TemplateConfig }) =>
      this.request<Template>({ method: 'PATCH', path: `/api/v1/templates/${id}`, body: patch, idempotencyKey: this.genIdem() }),
    makeDefault: (id: string) =>
      this.request<Template>({ method: 'POST', path: `/api/v1/templates/${id}/make-default`, body: {}, idempotencyKey: this.genIdem() }),
    /** Copy a template. The API names the copy "<name> (copy)"; pass `name` to rename
     *  it straight after (a second request). */
    duplicate: async (id: string, name?: string) => {
      const copy = await this.request<Template>({
        method: 'POST',
        path: `/api/v1/templates/${id}/duplicate`,
        body: {},
        idempotencyKey: this.genIdem(),
      });
      if (!name) return copy;
      return this.request<Template>({
        method: 'PATCH',
        path: `/api/v1/templates/${copy.id}`,
        body: { name },
        idempotencyKey: this.genIdem(),
      });
    },
    /** Render a kind + config as HTML with sample data, without saving anything. */
    preview: async (input: TemplatePreviewInput) => {
      const html = await this.request<string>({ method: 'POST', path: '/api/v1/templates/preview', body: input });
      return { html: typeof html === 'string' ? html : '' };
    },
    delete: (id: string) =>
      this.request<void>({ method: 'DELETE', path: `/api/v1/templates/${id}` }),
  };

  // ─── Uploads ────────────────────────────────────────────────
  uploads = {
    /**
     * Upload an image (PNG, JPEG or WEBP, at most 5 MB): sent as multipart/form-data, the
     * file in the field `file`. Pass the bytes (`file`: a Blob / File, a Buffer or
     * Uint8Array) or, as before 0.9, `base64` + `filename`. Plugipay tells the type from
     * the bytes. Returns the image's URL (relative, served by plugipay.com).
     */
    image: (input: UploadImageInput) => {
      const i = (input && typeof input === 'object' ? input : {}) as {
        file?: Blob | Uint8Array | ArrayBuffer; base64?: string; filename?: string; contentType?: string; mime?: string;
      };
      const type = i.contentType ?? i.mime;
      const bytes = typeof i.base64 === 'string' ? Buffer.from(i.base64, 'base64') : i.file ?? new Uint8Array();
      const blob = bytes instanceof Blob ? bytes : new Blob([bytes], type ? { type } : {});
      const filename = i.filename ?? (typeof File !== 'undefined' && bytes instanceof File ? bytes.name : 'image');
      const form = new FormData();
      form.append('file', blob, filename);
      return this.request<UploadedFile>({ method: 'POST', path: '/api/v1/uploads/image', body: form, idempotencyKey: this.genIdem() });
    },
  };

  // ─── Workspaces (merchant-facing CRUD) ─────────────────────
  /** `list` answers a key with its own workspace. `create` / `update` / `delete` are
   *  person-only (they change the owner's Huudis account): 403 person_only with a key. */
  workspaces = {
    list: () => this.request<Workspace[]>({ method: 'GET', path: '/api/v1/workspaces' }),
    /** A new workspace you own, named `name` (its slug is made from the name). */
    create: (input: { name: string }) =>
      this.request<Workspace>({ method: 'POST', path: '/api/v1/workspaces', body: input, idempotencyKey: this.genIdem() }),
    /** Rename a workspace (owners and admins). */
    update: (id: string, patch: { name: string }) =>
      this.request<WorkspaceRename>({ method: 'PATCH', path: `/api/v1/workspaces/${id}`, body: patch }),
    /** Schedule the workspace's deletion (owners only); it happens at `pendingDeletionAt`. */
    delete: (id: string) =>
      this.request<WorkspaceDeletion>({ method: 'DELETE', path: `/api/v1/workspaces/${id}` }),
  };

  // ─── Account (merchant profile + sessions + linked) ────────
  /** Person-only: the owner's Huudis profile, sign-in and members, reached with their
   *  signed-in session; the API answers a key here with 403 person_only. */
  account = {
    get: () => this.request<AccountProfile>({ method: 'GET', path: '/api/v1/account' }),
    /** Change the name (`null` clears it) or locale; answers with those fields. */
    update: (patch: { name?: string | null; locale?: string }) =>
      this.request<AccountProfileUpdate>({ method: 'PATCH', path: '/api/v1/account', body: patch }),
    listSessions: () => this.request<BrowserSession[]>({ method: 'GET', path: '/api/v1/account/sessions' }),
    /** Sign out one session (not the current one: 400 CANNOT_REVOKE_CURRENT). */
    revokeSession: (id: string) =>
      this.request<{ revoked: boolean }>({ method: 'POST', path: `/api/v1/account/sessions/${id}/revoke`, body: {} }),
    /** Sign out every other session. */
    revokeAllSessions: () =>
      this.request<{ revokedCount: number }>({ method: 'POST', path: '/api/v1/account/sessions/revoke-all', body: {} }),
    listLinked: () => this.request<LinkedAccounts>({ method: 'GET', path: '/api/v1/account/linked-accounts' }),
    /** Unlink a sign-in: `provider` is `google` or `apple`. */
    unlink: (provider: string) =>
      this.request<{ removed: boolean; provider: string }>({ method: 'DELETE', path: `/api/v1/account/linked-accounts/${provider}` }),
    /** Start an email change: a link goes to the new address. `password` is the current
     *  one (ignored for a person without a password). */
    changeEmail: (input: { email: string; password: string }) =>
      this.request<{ pending: boolean; newEmail: string }>({ method: 'POST', path: '/api/v1/account/email-change', body: input }),
    /** `currentPassword` is required unless the person has none yet (Google / Apple only). */
    changePassword: (input: { currentPassword?: string; newPassword: string }) =>
      this.request<{ changed: boolean }>({ method: 'POST', path: '/api/v1/account/password-change', body: input }),
    listMembers: () => this.request<WorkspaceMember[]>({ method: 'GET', path: '/api/v1/account/members' }),
  };

  // ─── Admin portal (Plugipay internal operators) ───────────
  /** Plugipay's own operators only (an admin-portal session); a merchant key gets 401. */
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
      partner: PartnerId;
      discountRate: number;
      brandName?: string;
      businessEmail?: string;
    }) => this.request<PartnerWorkspace>({ method: 'POST', path: '/api/v1/admin/workspaces', body: input }),
    getWorkspace: (accountId: string) =>
      this.request<PartnerWorkspace>({ method: 'GET', path: `/api/v1/admin/workspaces/${accountId}` }),
    partnerUsage: (params: { partner: PartnerId; from: string; to: string }) =>
      this.request<PartnerUsageSummary>({
        method: 'GET',
        path: `/api/v1/admin/partner/usage${qs(params)}`,
      }),
  };
}

/** What a plan lets its customers do in the billing portal when `plans.create` is given
 *  no `portalFeatures`: the dashboard's defaults (cancel, update the payment method). */
const DEFAULT_PORTAL_FEATURES: PortalFeatures = {
  selfServeCancel: true,
  selfServePause: false,
  selfServeUpgrade: false,
  selfServeDowngrade: false,
  updatePaymentMethod: true,
};

function qs(params: Record<string, unknown>): string {
  const parts = Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== null)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`);
  return parts.length > 0 ? `?${parts.join('&')}` : '';
}

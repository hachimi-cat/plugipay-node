import { describe, it, expect, beforeEach } from 'vitest';
import { PlugipayClient } from '../src/index.js';

interface Captured {
  url: string;
  method: string;
  headers: Record<string, string>;
  body?: string;
}

function makeClient(opts: Partial<{ onBehalfOf: string }> = {}) {
  const captured: Captured[] = [];
  const fetchImpl: typeof fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    captured.push({
      url: typeof input === 'string' ? input : input.toString(),
      method: init?.method ?? 'GET',
      headers: (init?.headers ?? {}) as Record<string, string>,
      body: typeof init?.body === 'string' ? init.body : undefined,
    });
    return new Response(
      JSON.stringify({
        data: { ok: true },
        error: null,
        meta: { requestId: 'req_test', timestamp: new Date().toISOString() },
      }),
      { headers: { 'content-type': 'application/json' } },
    );
  }) as typeof fetch;
  const realFetch = globalThis.fetch;
  globalThis.fetch = fetchImpl;
  const client = new PlugipayClient({
    keyId: 'ak_test',
    secret: 'sk_test',
    baseUrl: 'https://plugipay.test',
    ...opts,
  });
  return {
    client,
    captured,
    restore: () => {
      globalThis.fetch = realFetch;
    },
  };
}

describe('v0.5.0 new resources', () => {
  let h: ReturnType<typeof makeClient>;
  beforeEach(() => {
    h = makeClient();
  });
  afterEach(() => h.restore());

  it('refunds.create POSTs to /refunds with body', async () => {
    await h.client.refunds.create({ sourceType: 'invoice', sourceId: 'in_1', amount: 5000 });
    const c = h.captured[0]!;
    expect(c.method).toBe('POST');
    expect(c.url).toContain('/api/v1/refunds');
    expect(JSON.parse(c.body!)).toMatchObject({ sourceType: 'invoice', sourceId: 'in_1', amount: 5000 });
    expect(c.headers['Idempotency-Key']).toBeTruthy();
  });

  it('refunds.list passes status query', async () => {
    await h.client.refunds.list({ status: 'failed', limit: 10 });
    const u = new URL(h.captured[0]!.url);
    expect(u.searchParams.get('status')).toBe('failed');
    expect(u.searchParams.get('limit')).toBe('10');
  });

  it('adapters.updateXendit PUTs to /adapters/xendit', async () => {
    await h.client.adapters.updateXendit({ secretKey: 'xnd_secret_1' });
    expect(h.captured[0]!.method).toBe('PUT');
    expect(h.captured[0]!.url).toContain('/api/v1/adapters/xendit');
  });

  it('adapters.startManagedOnboarding POSTs', async () => {
    await h.client.adapters.startManagedOnboarding({ kind: 'midtrans' });
    expect(h.captured[0]!.method).toBe('POST');
    expect(h.captured[0]!.url).toContain('/api/v1/adapters/managed/onboarding');
  });

  it('apiKeys.create POSTs', async () => {
    await h.client.apiKeys.create({ description: 'CI key' });
    expect(h.captured[0]!.method).toBe('POST');
    expect(h.captured[0]!.url).toContain('/api/v1/api-keys');
  });

  it('apiKeys.revoke DELETEs /:id', async () => {
    await h.client.apiKeys.revoke('ak_1');
    expect(h.captured[0]!.method).toBe('DELETE');
    expect(h.captured[0]!.url).toContain('/api/v1/api-keys/ak_1');
  });

  it('billing.listTiers GETs', async () => {
    await h.client.billing.listTiers();
    expect(h.captured[0]!.url).toContain('/api/v1/billing/tiers');
  });

  it('onboarding.provisionManaged POSTs', async () => {
    await h.client.onboarding.provisionManaged({ businessEmail: 'a@b.com', brandName: 'Brand' });
    expect(h.captured[0]!.method).toBe('POST');
    expect(h.captured[0]!.url).toContain('/api/v1/onboarding/provision-managed');
  });

  it('checkoutSettings.update PATCHes', async () => {
    await h.client.checkoutSettings.update({ brandColor: '#ff8800' });
    expect(h.captured[0]!.method).toBe('PATCH');
    expect(h.captured[0]!.url).toContain('/api/v1/checkout/settings');
  });

  it('templates.makeDefault POSTs', async () => {
    await h.client.templates.makeDefault('tpl_1');
    expect(h.captured[0]!.url).toContain('/api/v1/templates/tpl_1/make-default');
    expect(h.captured[0]!.method).toBe('POST');
  });

  it('templates.duplicate POSTs', async () => {
    await h.client.templates.duplicate('tpl_1', 'Copy of Default');
    expect(h.captured[0]!.url).toContain('/api/v1/templates/tpl_1/duplicate');
  });

  it('uploads.image POSTs (multipart: test/uploads.test.ts)', async () => {
    await h.client.uploads.image({ filename: 'logo.png', mime: 'image/png', base64: 'iVBORw0KGgo=' });
    expect(h.captured[0]!.url).toContain('/api/v1/uploads/image');
    expect(h.captured[0]!.method).toBe('POST');
  });

  it('workspaces.create / update send the name Huudis reads', async () => {
    await h.client.workspaces.create({ name: 'Toko' });
    await h.client.workspaces.update('acc_1', { name: 'Toko Dua' });
    expect(h.captured[0]!.method).toBe('POST');
    expect(h.captured[0]!.url).toContain('/api/v1/workspaces');
    expect(JSON.parse(h.captured[0]!.body!)).toEqual({ name: 'Toko' });
    expect(h.captured[1]!.method).toBe('PATCH');
    expect(JSON.parse(h.captured[1]!.body!)).toEqual({ name: 'Toko Dua' });
  });

  it('account.changeEmail sends email (Huudis does not read newEmail)', async () => {
    await h.client.account.changeEmail({ email: 'new@example.com', password: 'pw' });
    expect(JSON.parse(h.captured[0]!.body!)).toEqual({ email: 'new@example.com', password: 'pw' });
  });

  it('account.changePassword may leave out the current password', async () => {
    await h.client.account.changePassword({ newPassword: 'a-long-new-password' });
    expect(JSON.parse(h.captured[0]!.body!)).toEqual({ newPassword: 'a-long-new-password' });
  });

  it('subscriptions.update PATCHes; cancel can carry a reason', async () => {
    await h.client.subscriptions.update('sub_1', { metadata: { seats: '12' } });
    await h.client.subscriptions.cancel('sub_1', 'now', 'merchant');
    expect(h.captured[0]!.method).toBe('PATCH');
    expect(h.captured[0]!.url).toContain('/api/v1/subscriptions/sub_1');
    expect(JSON.parse(h.captured[0]!.body!)).toEqual({ metadata: { seats: '12' } });
    expect(JSON.parse(h.captured[1]!.body!)).toEqual({ at: 'now', reason: 'merchant' });
  });

  it('customers.delete DELETEs', async () => {
    await h.client.customers.delete('cus_1');
    expect(h.captured[0]!.method).toBe('DELETE');
    expect(h.captured[0]!.url).toContain('/api/v1/customers/cus_1');
  });

  it('account.revokeAllSessions POSTs', async () => {
    await h.client.account.revokeAllSessions();
    expect(h.captured[0]!.url).toContain('/api/v1/account/sessions/revoke-all');
  });

  it('account.unlink DELETEs /:provider', async () => {
    await h.client.account.unlink('google');
    expect(h.captured[0]!.method).toBe('DELETE');
    expect(h.captured[0]!.url).toContain('/api/v1/account/linked-accounts/google');
  });

  it('adminPortal.me GETs', async () => {
    await h.client.adminPortal.me();
    expect(h.captured[0]!.url).toContain('/api/v1/admin-portal/me');
  });

  it('HMAC signature header is present on every call', async () => {
    await h.client.refunds.list();
    const auth = h.captured[0]!.headers.Authorization;
    expect(auth).toMatch(/^Plugipay-HMAC-SHA256 keyId=ak_test, scope=\*, signature=[a-f0-9]+/);
    expect(h.captured[0]!.headers['X-Plugipay-Timestamp']).toMatch(/^\d+$/);
  });
});

describe('onBehalfOf threading', () => {
  it('attaches X-Plugipay-On-Behalf-Of when set at client level', async () => {
    const h = makeClient({ onBehalfOf: 'acc_storlaunch_xyz' });
    try {
      await h.client.refunds.list();
      expect(h.captured[0]!.headers['X-Plugipay-On-Behalf-Of']).toBe('acc_storlaunch_xyz');
    } finally {
      h.restore();
    }
  });
});

describe('gift cards / store credit', () => {
  let h: ReturnType<typeof makeClient>;
  beforeEach(() => {
    h = makeClient();
  });
  afterEach(() => h.restore());

  it('issue POSTs to /gift-cards with body + idempotency key', async () => {
    await h.client.giftCards.issue({ amount: 100000, customerId: 'cus_1', currency: 'IDR' });
    const c = h.captured[0]!;
    expect(c.method).toBe('POST');
    expect(c.url).toContain('/api/v1/gift-cards');
    expect(JSON.parse(c.body!)).toMatchObject({ amount: 100000, customerId: 'cus_1' });
    expect(c.headers['Idempotency-Key']).toBeTruthy();
  });

  it('list passes customerId + status query', async () => {
    await h.client.giftCards.list({ customerId: 'cus_1', status: 'active', limit: 5 });
    const u = new URL(h.captured[0]!.url);
    expect(u.searchParams.get('customerId')).toBe('cus_1');
    expect(u.searchParams.get('status')).toBe('active');
  });

  it('getByCode GETs /:code', async () => {
    await h.client.giftCards.getByCode('GC-ABCD-1234');
    expect(h.captured[0]!.method).toBe('GET');
    expect(h.captured[0]!.url).toContain('/api/v1/gift-cards/GC-ABCD-1234');
  });

  it('redeem POSTs /:id/redeem with idempotent pair', async () => {
    await h.client.giftCards.redeem('gc_1', { amount: 25000, externalSource: 'malapos', externalRef: 'sale_9' });
    const c = h.captured[0]!;
    expect(c.method).toBe('POST');
    expect(c.url).toContain('/api/v1/gift-cards/gc_1/redeem');
    expect(JSON.parse(c.body!)).toMatchObject({ amount: 25000, externalSource: 'malapos', externalRef: 'sale_9' });
    expect(c.headers['Idempotency-Key']).toBeTruthy();
  });

  it('topup POSTs /:id/topup', async () => {
    await h.client.giftCards.topup('gc_1', { amount: 5000, externalSource: 'refund', externalRef: 'rf_3' });
    expect(h.captured[0]!.url).toContain('/api/v1/gift-cards/gc_1/topup');
    expect(h.captured[0]!.headers['Idempotency-Key']).toBeTruthy();
  });

  it('void POSTs /:id/void', async () => {
    await h.client.giftCards.void('gc_1');
    expect(h.captured[0]!.method).toBe('POST');
    expect(h.captured[0]!.url).toContain('/api/v1/gift-cards/gc_1/void');
  });
});

describe('204 no-body responses', () => {
  // Every backend DELETE answers 204 with an empty body. The parser
  // must treat that as void, not as a non-JSON envelope.
  it('delete resolves void on 204 instead of throwing invalid_response', async () => {
    const realFetch = globalThis.fetch;
    globalThis.fetch = (async () => new Response(null, { status: 204 })) as typeof fetch;
    try {
      const client = new PlugipayClient({ keyId: 'ak_test', secret: 'sk_test', baseUrl: 'https://plugipay.test' });
      await expect(client.webhookEndpoints.delete('we_1')).resolves.toBeUndefined();
      await expect(
        client.request({ method: 'DELETE', path: '/api/v1/customers/cus_1' }),
      ).resolves.toBeUndefined();
    } finally {
      globalThis.fetch = realFetch;
    }
  });
});

// vitest globals
import { afterEach } from 'vitest';

describe('0.10.0: hand-written methods the API refused before', () => {
  const realFetch = globalThis.fetch;
  afterEach(() => { globalThis.fetch = realFetch; });

  /** Answer each request with the next of `replies` (status, content-type, body). */
  function serve(...replies: Array<{ body: string; type?: string; status?: number }>) {
    const sent: Array<{ method: string; url: string; headers: Record<string, string>; body: unknown }> = [];
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      sent.push({
        method: init?.method ?? 'GET',
        url: String(input),
        headers: (init?.headers ?? {}) as Record<string, string>,
        body: typeof init?.body === 'string' ? JSON.parse(init.body) : undefined,
      });
      const r = replies[Math.min(sent.length - 1, replies.length - 1)]!;
      return new Response(r.body, { status: r.status ?? 200, headers: { 'content-type': r.type ?? 'application/json' } });
    }) as typeof fetch;
    return { sent, client: new PlugipayClient({ keyId: 'ak_test', secret: 'sk_test', baseUrl: 'https://plugipay.test' }) };
  }
  const env = (data: unknown) => ({ body: JSON.stringify({ data, error: null, meta: { requestId: 'r' } }) });

  it('customers.update sends an Idempotency-Key', async () => {
    const { sent, client } = serve(env({ id: 'cus_1' }));
    await client.customers.update('cus_1', { name: 'Ada', metadata: { a: 'b' } });
    expect(sent[0]).toMatchObject({ method: 'PATCH', body: { name: 'Ada', metadata: { a: 'b' } } });
    expect(sent[0]!.headers['Idempotency-Key']).toMatch(/^idem_/);
  });

  it('plans.create turns currency + amount into one flat price, with default portal features', async () => {
    const { sent, client } = serve(env({ id: 'pln_1' }));
    await client.plans.create({ name: 'Pro', interval: 'month', currency: 'IDR', amount: 150000 });
    expect(sent[0]!.body).toEqual({
      name: 'Pro',
      interval: 'month',
      portalFeatures: { selfServeCancel: true, selfServePause: false, selfServeUpgrade: false, selfServeDowngrade: false, updatePaymentMethod: true },
      prices: [{ currency: 'IDR', model: 'flat', unitAmount: 150000 }],
    });
  });

  it('templates.create / update send config', async () => {
    const { sent, client } = serve(env({ id: 'tpl_1' }));
    await client.templates.create({ kind: 'invoice', name: 'Net 14', config: { termsText: 'Net 14' } });
    await client.templates.update('tpl_1', { config: { termsText: 'Net 30' } });
    expect(sent.map((s) => s.body)).toEqual([
      { kind: 'invoice', name: 'Net 14', config: { termsText: 'Net 14' } },
      { config: { termsText: 'Net 30' } },
    ]);
  });

  it('templates.preview returns the HTML page the route answers with', async () => {
    const { client } = serve({ body: '<!doctype html><p>hi</p>', type: 'text/html; charset=utf-8' });
    await expect(client.templates.preview({ kind: 'receipt', config: {} })).resolves.toEqual({ html: '<!doctype html><p>hi</p>' });
  });

  it('templates.duplicate with a name renames the copy', async () => {
    const { sent, client } = serve(env({ id: 'tpl_2', name: 'A (copy)' }), env({ id: 'tpl_2', name: 'B' }));
    await expect(client.templates.duplicate('tpl_1', 'B')).resolves.toMatchObject({ name: 'B' });
    expect(sent.map((s) => `${s.method} ${new URL(s.url).pathname}`)).toEqual([
      'POST /api/v1/templates/tpl_1/duplicate',
      'PATCH /api/v1/templates/tpl_2',
    ]);
    expect(sent[1]!.body).toEqual({ name: 'B' });
  });

  it('adapters.list returns the adapters the API keys by kind', async () => {
    const { client } = serve(env({ manual: { kind: 'manual', status: 'active' }, xendit: { kind: 'xendit', status: 'active' } }));
    await expect(client.adapters.list()).resolves.toEqual([
      { kind: 'manual', status: 'active' },
      { kind: 'xendit', status: 'active' },
    ]);
  });

  it('adapters.update* send an Idempotency-Key', async () => {
    const { sent, client } = serve(env({ kind: 'xendit' }));
    await client.adapters.updateXendit({ secretKey: 'xnd_sk_test_1' });
    await client.adapters.updateManual({ instructions: 'Transfer' });
    expect(sent.every((s) => /^idem_/.test(s.headers['Idempotency-Key'] ?? ''))).toBe(true);
  });
});

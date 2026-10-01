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

  it('workspaces.create POSTs', async () => {
    await h.client.workspaces.create({ brandName: 'NewBrand' });
    expect(h.captured[0]!.method).toBe('POST');
    expect(h.captured[0]!.url).toContain('/api/v1/workspaces');
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

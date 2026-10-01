import crypto from 'node:crypto';
import { describe, it, expect, afterEach } from 'vitest';
import { PlugipayClient } from '../src/index.js';

// client.api: every feature route, generated from the API spec (scripts/apigen.sh).
describe('client.api (generated from the spec)', () => {
  const realFetch = globalThis.fetch;
  afterEach(() => { globalThis.fetch = realFetch; });

  function capture() {
    const seen: Array<{ url: string; method: string; body?: string; headers: Headers }> = [];
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      seen.push({
        url: typeof input === 'string' ? input : input.toString(),
        method: init?.method ?? 'GET',
        body: typeof init?.body === 'string' ? init.body : undefined,
        headers: new Headers(init?.headers),
      });
      return new Response(JSON.stringify({ data: { ok: true }, error: null, meta: { requestId: 'r', timestamp: '' } }), {
        headers: { 'content-type': 'application/json' },
      });
    }) as typeof fetch;
    return seen;
  }

  // What the backend checks (middleware/hmac-auth.ts, verifySdkSignature): the method,
  // the path with its query, the timestamp, the body hash and the idempotency key.
  function serverSignature(req: { url: string; method: string; body?: string; headers: Headers }, secret: string): string {
    const url = new URL(req.url);
    const idem = req.headers.get('idempotency-key');
    const bodyHash = crypto.createHash('sha256').update(req.body ?? '').digest('hex');
    const toSign = `${req.method}\n${url.pathname}${url.search}\n${req.headers.get('x-plugipay-timestamp')}\n${bodyHash}${idem ? `\n${idem}` : ''}`;
    return crypto.createHmac('sha256', secret).update(toSign).digest('hex');
  }

  it('creates a customer with the fields Plugipay validates, signed as the backend verifies', async () => {
    const seen = capture();
    const client = new PlugipayClient({ keyId: 'AKIAPLUGIPAYTESTA', secret: 'sk', baseUrl: 'https://plugipay.test' });
    await client.api.customersCreate({ email: 'ada@example.com', name: 'Ada' });
    const req = seen[0]!;
    expect(req.method).toBe('POST');
    expect(req.url).toBe('https://plugipay.test/api/v1/customers');
    expect(JSON.parse(req.body!)).toEqual({ email: 'ada@example.com', name: 'Ada' });
    expect(req.headers.get('idempotency-key')).toMatch(/^idem_/);
    const auth = req.headers.get('authorization')!;
    expect(auth).toMatch(/^Plugipay-HMAC-SHA256 keyId=AKIAPLUGIPAYTESTA, scope=\*, signature=[0-9a-f]{64}$/);
    expect(auth.split('signature=')[1]).toBe(serverSignature(req, 'sk'));
  });

  it('puts path parameters in the path and query fields in the signed query', async () => {
    const seen = capture();
    const client = new PlugipayClient({ keyId: 'ak', secret: 'sk', baseUrl: 'https://plugipay.test' });
    await client.api.customersGet('cus 1');
    await client.api.dashboardMetrics({ window: '30d' });
    expect(seen[0]!.url).toBe('https://plugipay.test/api/v1/customers/cus%201');
    expect(seen[0]!.headers.get('idempotency-key')).toBeNull();
    const listed = new URL(seen[1]!.url);
    expect(listed.pathname).toBe('/api/v1/dashboard/metrics');
    expect(Object.fromEntries(listed.searchParams)).toEqual({ window: '30d' });
    expect(seen[1]!.headers.get('authorization')!.split('signature=')[1]).toBe(serverSignature(seen[1]!, 'sk'));
  });

  it('carries onBehalfOf like every other call', async () => {
    const seen = capture();
    const client = new PlugipayClient({ keyId: 'ak', secret: 'sk', baseUrl: 'https://plugipay.test', onBehalfOf: 'acc_merchant' });
    await client.api.plansList();
    expect(seen[0]!.headers.get('x-plugipay-on-behalf-of')).toBe('acc_merchant');
  });

  it('sends a dashboard key (apiKey) as Bearer, without signing', async () => {
    const seen = capture();
    const client = new PlugipayClient({ apiKey: 'pk_live_abc123', baseUrl: 'https://plugipay.test' });
    await client.api.customersList();
    await client.customers.get('cus_1');
    for (const req of seen) {
      expect(req.headers.get('authorization')).toBe('Bearer pk_live_abc123');
      expect(req.headers.get('x-plugipay-timestamp')).toBeNull();
    }
    expect(() => new PlugipayClient({ baseUrl: 'https://plugipay.test' })).toThrow(/apiKey/);
  });

  it('has a method for every feature route', () => {
    const client = new PlugipayClient({ keyId: 'ak', secret: 'sk' });
    const methods = Object.getOwnPropertyNames(Object.getPrototypeOf(client.api)).filter((n) => n !== 'constructor' && n !== 'call');
    expect(methods.length).toBeGreaterThan(130);
    expect(methods).toContain('giftCardsCreate');
  });
});

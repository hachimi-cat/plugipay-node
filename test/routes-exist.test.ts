import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, it, expect, afterEach } from 'vitest';
import { PlugipayClient } from '../src/index.js';

// Every hand-written method calls a route the backend really has. The spec
// (backend/openapi.json) is made from the backend's own code by scripts/apigen.sh,
// so a method pointing at a route that was renamed or never existed fails here
// instead of 404ing for a customer. (client.api is generated from the same spec.)
const specFile = fileURLToPath(new URL('../../../backend/openapi.json', import.meta.url));
// A public mirror of sdk/node has no backend beside it.
const hasSpec = fs.existsSync(specFile);
const spec = (hasSpec ? JSON.parse(fs.readFileSync(specFile, 'utf8')) : { paths: {} }) as {
  paths: Record<string, Record<string, unknown>>;
};
const shape = (path: string) => path.replace(/\{[^}]+\}/g, '{}');
const routes = new Set(
  Object.entries(spec.paths).flatMap(([path, ops]) => Object.keys(ops).map((m) => `${m.toUpperCase()} ${shape(path)}`)),
);

type Fn = (...args: unknown[]) => Promise<unknown>;
function methodsOf(obj: Record<string, unknown>, prefix: string, out: Array<[string, Fn]>) {
  for (const [key, value] of Object.entries(obj)) {
    if (typeof value === 'function') out.push([`${prefix}${key}`, value as Fn]);
    else if (value && typeof value === 'object' && !Array.isArray(value)) {
      methodsOf(value as Record<string, unknown>, `${prefix}${key}.`, out);
    }
  }
}

describe.skipIf(!hasSpec)('hand-written methods', () => {
  const realFetch = globalThis.fetch;
  afterEach(() => { globalThis.fetch = realFetch; });

  it('every one calls a route that exists in backend/openapi.json', async () => {
    const calls: string[] = [];
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(typeof input === 'string' ? input : input.toString());
      // Ids the test passed ("__0__", "__1__") stand for the path's parameters.
      calls.push(`${init?.method ?? 'GET'} ${decodeURIComponent(url.pathname).replace(/__\d__/g, '{}')}`);
      return new Response(JSON.stringify({ data: {}, error: null, meta: { requestId: 'r' } }));
    }) as typeof fetch;
    const client = new PlugipayClient({ keyId: 'ak', secret: 'sk', baseUrl: 'https://plugipay.test' });
    const { api: _generated, ...handWritten } = client as unknown as Record<string, unknown>;

    // The resource namespaces (client.customers.list, …); the client's own fields
    // (the key, the base URL) are not API methods.
    const namespaces = Object.fromEntries(
      Object.entries(handWritten).filter(([, v]) => v && typeof v === 'object'),
    );
    const methods: Array<[string, Fn]> = [];
    methodsOf(namespaces, '', methods);
    expect(methods.length).toBeGreaterThan(80);

    const missing: string[] = [];
    for (const [name, fn] of methods) {
      calls.length = 0;
      await fn('__0__', '__1__').catch(() => undefined);
      if (calls.length !== 1) {
        missing.push(`${name}: made ${calls.length} requests`);
        continue;
      }
      if (!routes.has(calls[0]!)) missing.push(`${name}: ${calls[0]}`);
    }
    expect(missing).toEqual([]);
  });
});

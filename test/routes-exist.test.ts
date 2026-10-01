import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, it, expect, afterEach } from 'vitest';
import { PlugipayClient } from '../src/index.js';
import { declaredInputs } from './declared-inputs.js';

// Every hand-written method calls a route the backend really has, and sends what that
// route requires. The spec (backend/openapi.json) is made from the backend's own code by
// scripts/apigen.sh, so a method pointing at a route that was renamed or never existed,
// one that sends no Idempotency-Key where the route requires one, or one whose body the
// route's schema refuses (a required field it can't send, a field a strict schema
// doesn't know) fails here instead of 4xx-ing for a customer. (client.api is generated
// from the same spec.)
const specFile = fileURLToPath(new URL('../../../backend/openapi.json', import.meta.url));
// A public mirror of sdk/node has no backend beside it.
const hasSpec = fs.existsSync(specFile);

interface JsonSchema {
  type?: string;
  properties?: Record<string, unknown>;
  required?: string[];
  additionalProperties?: unknown;
  anyOf?: JsonSchema[];
}
interface Operation {
  'x-forjio'?: { guards?: string[]; body?: string };
  requestBody?: { content?: Record<string, { schema?: JsonSchema }> };
}
const spec = (hasSpec ? JSON.parse(fs.readFileSync(specFile, 'utf8')) : { paths: {} }) as {
  paths: Record<string, Record<string, Operation>>;
};
const shape = (path: string) => path.replace(/\{[^}]+\}/g, '{}');
const routes = new Map<string, Operation>(
  Object.entries(spec.paths).flatMap(([path, ops]) =>
    Object.entries(ops).map(([m, op]): [string, Operation] => [`${m.toUpperCase()} ${shape(path)}`, op]),
  ),
);

/** Methods that make more than one request, and why. */
const MULTI_REQUEST: Record<string, string> = {
  // the route copies the template as "<name> (copy)"; a name of your own is a rename after it
  'templates.duplicate': 'duplicate, then PATCH the name',
};

type Fn = (...args: unknown[]) => Promise<unknown>;
function methodsOf(obj: Record<string, unknown>, prefix: string, out: Array<[string, Fn]>) {
  for (const [key, value] of Object.entries(obj)) {
    if (typeof value === 'function') out.push([`${prefix}${key}`, value as Fn]);
    else if (value && typeof value === 'object' && !Array.isArray(value)) {
      methodsOf(value as Record<string, unknown>, `${prefix}${key}.`, out);
    }
  }
}

interface Sent {
  route: string;
  idempotencyKey: string | undefined;
  body: unknown;
}

/** What is wrong with one request against the spec ([] when nothing). */
function problems(sent: Sent): string[] {
  const op = routes.get(sent.route);
  if (!op) return [`${sent.route}: no such route`];
  const out: string[] = [];
  const x = op['x-forjio'] ?? {};
  if ((x.guards ?? []).includes('idempotency') && !sent.idempotencyKey) {
    out.push(`${sent.route}: sends no Idempotency-Key (the route takes one)`);
  }
  const body = sent.body;
  if (body && typeof body === 'object' && !Array.isArray(body)) {
    const keys = Object.keys(body);
    const schema = op.requestBody?.content?.['application/json']?.schema;
    if (x.body === 'validated' && schema) {
      const branches = schema.anyOf ?? [schema];
      const fits = (s: JsonSchema) =>
        (s.required ?? []).every((k) => keys.includes(k)) &&
        (s.additionalProperties !== false || keys.every((k) => k in (s.properties ?? {})));
      if (!branches.some(fits)) {
        const s = branches[0]!;
        const missing = (s.required ?? []).filter((k) => !keys.includes(k));
        const unknown = s.additionalProperties === false ? keys.filter((k) => !(k in (s.properties ?? {}))) : [];
        out.push(
          `${sent.route}: body the route refuses` +
            (missing.length ? ` — can never send required ${missing.join(', ')}` : '') +
            (unknown.length ? ` — sends ${unknown.join(', ')}, which the schema doesn't allow` : ''),
        );
      }
    } else if (x.body === 'none' && keys.length > 0) {
      out.push(`${sent.route}: sends ${keys.join(', ')}, but the route reads no body`);
    } else if (x.body === 'read-unvalidated' && schema?.properties) {
      const ignored = keys.filter((k) => !(k in schema.properties!));
      if (ignored.length) out.push(`${sent.route}: sends ${ignored.join(', ')}, which the route never reads`);
    }
  }
  return out;
}

describe.skipIf(!hasSpec)('hand-written methods', () => {
  const realFetch = globalThis.fetch;
  afterEach(() => { globalThis.fetch = realFetch; });

  it('every one calls a route in backend/openapi.json and sends what it requires', async () => {
    const sent: Sent[] = [];
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(typeof input === 'string' ? input : input.toString());
      const headers = (init?.headers ?? {}) as Record<string, string>;
      let body: unknown;
      if (typeof init?.body === 'string') {
        try { body = JSON.parse(init.body); } catch { body = init.body; }
      }
      sent.push({
        // Ids the test passed ("__0__", "__1__") stand for the path's parameters.
        route: `${init?.method ?? 'GET'} ${decodeURIComponent(url.pathname).replace(/__\d__/g, '{}')}`,
        idempotencyKey: headers['Idempotency-Key'],
        body,
      });
      // a created object's id ("__9__") stands for a path parameter too (duplicate + rename)
      return new Response(JSON.stringify({ data: { id: '__9__' }, error: null, meta: { requestId: 'r' } }), {
        headers: { 'content-type': 'application/json' },
      });
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

    // Each method is called with every input its signature declares filled in.
    const inputs = declaredInputs();
    const found: string[] = [];
    for (const [name, fn] of methods) {
      const argLists = inputs.get(name);
      if (!argLists) {
        found.push(`${name}: not found in src/client.ts`);
        continue;
      }
      for (const args of argLists) {
        sent.length = 0;
        await fn(...args).catch(() => undefined);
        if (sent.length === 0 || (sent.length > 1 && !MULTI_REQUEST[name])) {
          found.push(`${name}: made ${sent.length} requests`);
          continue;
        }
        for (const s of sent) found.push(...problems(s).map((p) => `${name}: ${p}`));
      }
    }
    expect([...new Set(found)]).toEqual([]);
  });
});

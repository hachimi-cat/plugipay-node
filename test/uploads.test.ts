import crypto from 'node:crypto';
import { afterEach, describe, expect, it } from 'vitest';
import { PlugipayClient } from '../src/index.js';

// POST /api/v1/uploads/image takes multipart/form-data with the image in the field `file`
// (backend/src/routes/uploads.ts). Until 0.9 uploads.image sent JSON and got 400.
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
);

interface Seen {
  url: string;
  method: string;
  headers: Headers;
  /** The request as the server gets it: its multipart body parsed back. */
  form: FormData | null;
  contentType: string | null;
}

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

function capture(): Seen[] {
  const seen: Seen[] = [];
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    // Serialise the body exactly as fetch would put it on the wire, then read it back.
    const wire = new Request(typeof input === 'string' ? input : input.toString(), { method: init?.method, body: init?.body ?? null });
    const contentType = wire.headers.get('content-type');
    seen.push({
      url: wire.url,
      method: wire.method,
      headers: new Headers(init?.headers),
      contentType,
      form: contentType?.startsWith('multipart/form-data') ? await wire.formData() : null,
    });
    return new Response(
      JSON.stringify({ data: { url: '/api/v1/files/1-ab.png', fileName: 'logo.png', fileSize: PNG.length }, error: null, meta: { requestId: 'r' } }),
      { headers: { 'content-type': 'application/json' } },
    );
  }) as typeof fetch;
  return seen;
}

/** What the backend checks (middleware/hmac-auth.ts): a multipart body hashes as ''. */
function serverSignature(s: Seen, secret: string): string {
  const url = new URL(s.url);
  const idem = s.headers.get('idempotency-key');
  const toSign = `${s.method}\n${url.pathname}${url.search}\n${s.headers.get('x-plugipay-timestamp')}\n${crypto.createHash('sha256').update('').digest('hex')}${idem ? `\n${idem}` : ''}`;
  return crypto.createHmac('sha256', secret).update(toSign).digest('hex');
}

const client = () => new PlugipayClient({ keyId: 'AKIAPLUGIPAYTESTA', secret: 'sk', baseUrl: 'https://plugipay.test' });

describe('uploads.image', () => {
  it('sends the bytes as multipart/form-data in the field "file", signed as the server checks', async () => {
    const seen = capture();
    const out = await client().uploads.image({ file: PNG, filename: 'logo.png', contentType: 'image/png' });
    expect(out).toEqual({ url: '/api/v1/files/1-ab.png', fileName: 'logo.png', fileSize: PNG.length });
    const s = seen[0]!;
    expect([s.method, s.url]).toEqual(['POST', 'https://plugipay.test/api/v1/uploads/image']);
    expect(s.contentType).toMatch(/^multipart\/form-data; boundary=/);
    expect(s.headers.get('content-type')).toBeNull(); // fetch sets it, with the boundary
    const file = s.form!.get('file') as File;
    expect(file.name).toBe('logo.png');
    expect(file.type).toBe('image/png');
    expect(Buffer.from(await file.arrayBuffer())).toEqual(PNG);
    expect([...s.form!.keys()]).toEqual(['file']);
    expect(s.headers.get('idempotency-key')).toMatch(/^idem_/);
    expect(s.headers.get('authorization')!.split('signature=')[1]).toBe(serverSignature(s, 'sk'));
  });

  it('still takes the 0.8 shape (base64 + filename + mime), now sent as the file it encodes', async () => {
    const seen = capture();
    await client().uploads.image({ filename: 'qris.png', mime: 'image/png', base64: PNG.toString('base64') });
    const file = seen[0]!.form!.get('file') as File;
    expect(file.name).toBe('qris.png');
    expect(Buffer.from(await file.arrayBuffer())).toEqual(PNG);
  });

  it('a File keeps its name', async () => {
    const seen = capture();
    await client().uploads.image({ file: new File([PNG], 'from-disk.png', { type: 'image/png' }) });
    expect((seen[0]!.form!.get('file') as File).name).toBe('from-disk.png');
  });

  it('client.api.uploadsImage (generated) sends the same form', async () => {
    const seen = capture();
    await client().api.uploadsImage({ file: new File([PNG], 'gen.png', { type: 'image/png' }) });
    const s = seen[0]!;
    expect(s.contentType).toMatch(/^multipart\/form-data/);
    expect((s.form!.get('file') as File).name).toBe('gen.png');
    expect(s.headers.get('authorization')!.split('signature=')[1]).toBe(serverSignature(s, 'sk'));
  });

  it('every request carries a fresh timestamp', async () => {
    const seen = capture();
    const c = client();
    const t0 = Math.floor(Date.now() / 1000);
    await c.uploads.image({ file: PNG });
    await c.api.uploadsImage({ file: new Blob([PNG]) });
    for (const s of seen) {
      const ts = Number(s.headers.get('x-plugipay-timestamp'));
      expect(Math.abs(ts - t0)).toBeLessThanOrEqual(2);
    }
  });
});

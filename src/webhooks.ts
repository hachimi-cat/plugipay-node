import crypto from 'node:crypto';
import { PlugipayError, WebhookEvent } from './types.js';

export interface VerifyOptions {
  /** Window in seconds within which the timestamp is accepted. Default 5m. */
  toleranceSec?: number;
}

/**
 * Verify a Plugipay webhook signature and return the typed event.
 *
 * Plugipay signs webhooks with HMAC-SHA256 over
 *   `${timestamp}.${rawBody}`
 * and sends the signature as
 *   X-Plugipay-Signature: t=<ts>,v1=<hex>
 *
 * Callers must pass the *raw* request body (as a string or Buffer) —
 * not the parsed object — otherwise re-serialization mismatches break
 * verification.
 */
export function verifyWebhook(
  rawBody: string | Buffer,
  signatureHeader: string | string[] | undefined,
  secret: string,
  opts: VerifyOptions = {},
): WebhookEvent {
  if (!signatureHeader) {
    throw new PlugipayError(401, 'signature_missing', 'X-Plugipay-Signature header is missing');
  }
  const header = Array.isArray(signatureHeader) ? signatureHeader[0] : signatureHeader;
  if (!header) throw new PlugipayError(401, 'signature_missing', 'empty signature header');
  const parts = Object.fromEntries(
    header.split(',').map((p) => {
      const [k, ...rest] = p.trim().split('=');
      return [k ?? '', rest.join('=')];
    }),
  );
  const ts = parts['t'];
  const sig = parts['v1'];
  if (!ts || !sig) throw new PlugipayError(401, 'signature_malformed', 'missing t= or v1= in signature');
  const tolerance = opts.toleranceSec ?? 300;
  const age = Math.abs(Math.floor(Date.now() / 1000) - Number(ts));
  if (!Number.isFinite(age) || age > tolerance) {
    throw new PlugipayError(401, 'signature_stale', `timestamp outside ${tolerance}s tolerance`);
  }
  const body = typeof rawBody === 'string' ? rawBody : rawBody.toString('utf8');
  const expected = crypto.createHmac('sha256', secret).update(`${ts}.${body}`).digest('hex');
  const a = Buffer.from(expected, 'hex');
  const b = Buffer.from(sig, 'hex');
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    throw new PlugipayError(401, 'signature_invalid', 'signature did not match');
  }
  return JSON.parse(body) as WebhookEvent;
}

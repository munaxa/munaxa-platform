/**
 * Encoding helpers.
 *
 * Base64url (RFC 4648 §5) is the platform's default wire encoding: it survives URLs, cookies,
 * JSON and JWT segments unescaped, which is more than can be said for base64.
 */

export function toBase64Url(input: Uint8Array | Buffer | string): string {
  const buffer = typeof input === 'string' ? Buffer.from(input, 'utf8') : Buffer.from(input);
  return buffer.toString('base64url');
}

export function fromBase64Url(input: string): Buffer {
  return Buffer.from(input, 'base64url');
}

export function toHex(input: Uint8Array | Buffer): string {
  return Buffer.from(input).toString('hex');
}

export function fromHex(input: string): Buffer {
  if (!/^[0-9a-fA-F]*$/.test(input) || input.length % 2 !== 0) {
    throw new TypeError('Invalid hex string');
  }
  return Buffer.from(input, 'hex');
}

export function utf8(input: string): Buffer {
  return Buffer.from(input, 'utf8');
}

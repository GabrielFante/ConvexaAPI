import { createHmac, timingSafeEqual } from "node:crypto";

const SIGNATURE_PREFIX = "sha256=";
const SHA256_HEX = /^[0-9a-f]{64}$/i;

export function signMetaPayload(rawBody: Buffer, appSecret: string): string {
  const digest = createHmac("sha256", appSecret).update(rawBody).digest("hex");
  return `${SIGNATURE_PREFIX}${digest}`;
}

export function isValidMetaSignature(
  rawBody: Buffer,
  signature: string,
  appSecret: string,
): boolean {
  if (!signature.startsWith(SIGNATURE_PREFIX)) {
    return false;
  }

  const provided = signature.slice(SIGNATURE_PREFIX.length);

  if (!SHA256_HEX.test(provided)) {
    return false;
  }

  const expected = createHmac("sha256", appSecret).update(rawBody).digest();

  return timingSafeEqual(Buffer.from(provided, "hex"), expected);
}

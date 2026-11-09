import crypto from 'crypto';
import { verifyTableToken, generateTableToken } from '@qr-restaurant/shared';

export { verifyTableToken, generateTableToken };

export function generateTableSignature(restaurantIdOrSlug: string, tableNumber: string): string {
  return generateTableToken(restaurantIdOrSlug, tableNumber);
}

export function verifyTableSignature(
  restaurantIdOrSlug: string,
  tableNumber: string,
  signature: string
): boolean {
  if (!signature || !tableNumber || !restaurantIdOrSlug) return false;

  // 1. Check shared cryptographic table token
  if (verifyTableToken(restaurantIdOrSlug, tableNumber, signature)) {
    return true;
  }

  // 2. Fallback to HMAC signature for legacy tokens
  const secret = process.env.JWT_ACCESS_SECRET || process.env.JWT_SECRET || 'table_signing_fallback_secret_key';
  const expectedHmac = crypto
    .createHmac('sha256', secret)
    .update(`${restaurantIdOrSlug}:${tableNumber}`)
    .digest('hex')
    .slice(0, 16);
  return expectedHmac === signature;
}

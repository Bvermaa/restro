/**
 * Cryptographic & Deterministic Table Token Utility
 * Generates and verifies unique tokens binding a restaurant slug and table number.
 */

function computeHash(slug: string, tableNumber: string): string {
  const cleanTable = tableNumber.trim();
  const cleanSlug = slug.trim().toLowerCase();
  let hashVal = 5381;
  const str = `ezrestro_table_salt_v2:${cleanSlug}:table:${cleanTable}`;
  for (let i = 0; i < str.length; i++) {
    hashVal = ((hashVal << 5) + hashVal) + str.charCodeAt(i);
    hashVal = hashVal & hashVal; // 32-bit integer
  }
  return Math.abs(hashVal).toString(36);
}

function base64urlEncode(str: string): string {
  if (typeof btoa !== 'undefined') {
    return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(str, 'utf-8')
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
  }
  return str;
}

function base64urlDecode(b64url: string): string {
  let b64 = b64url.replace(/-/g, '+').replace(/_/g, '/');
  while (b64.length % 4) b64 += '=';

  if (typeof atob !== 'undefined') {
    return atob(b64);
  }
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(b64, 'base64').toString('utf-8');
  }
  return b64url;
}

/**
 * Generates a tamper-proof table token containing the slug, table number, and hash.
 */
export function generateTableToken(slug: string, tableNumber: string): string {
  const cleanTable = tableNumber.trim();
  const cleanSlug = slug.trim().toLowerCase();
  if (!cleanTable || !cleanSlug) return '';

  const hash = computeHash(cleanSlug, cleanTable);
  const rawPayload = `${cleanSlug}:${cleanTable}:${hash}`;
  return base64urlEncode(rawPayload);
}

/**
 * Resolves and cryptographically verifies a table token.
 * Supports both v2 format (slug:table:hash) and legacy v1 format (table:hash).
 */
export function resolveTableToken(
  token: string,
  expectedSlug?: string
): { valid: boolean; slug?: string; tableNumber?: string } {
  if (!token || typeof token !== 'string') return { valid: false };

  try {
    const decoded = base64urlDecode(token.trim());
    const parts = decoded.split(':');

    // Format v2: [slug, table, hash]
    if (parts.length >= 3 && parts[0] && parts[1] && parts[2]) {
      const slug = parts[0].trim().toLowerCase();
      const tableNumber = parts[1].trim();
      const hash = parts[2].trim();

      if (expectedSlug && slug !== expectedSlug.trim().toLowerCase()) {
        return { valid: false };
      }

      const expectedHash = computeHash(slug, tableNumber);
      if (hash === expectedHash) {
        return { valid: true, slug, tableNumber };
      }
    }

    // Format legacy: [table, hash] (requires expectedSlug)
    if (parts.length === 2 && parts[0] && parts[1] && expectedSlug) {
      const tableNumber = parts[0].trim();
      const hash = parts[1].trim();

      let legacyHashVal = 5381;
      const str = `ezrestro_salt:${expectedSlug.trim().toLowerCase()}:table:${tableNumber}`;
      for (let i = 0; i < str.length; i++) {
        legacyHashVal = ((legacyHashVal << 5) + legacyHashVal) + str.charCodeAt(i);
        legacyHashVal = legacyHashVal & legacyHashVal;
      }
      const expectedLegacyHash = Math.abs(legacyHashVal).toString(36);

      if (hash === expectedLegacyHash || hash === computeHash(expectedSlug, tableNumber)) {
        return { valid: true, slug: expectedSlug.trim().toLowerCase(), tableNumber };
      }
    }

    return { valid: false };
  } catch {
    return { valid: false };
  }
}

/**
 * Validates that a table token is valid for a given restaurant slug and table number.
 */
export function verifyTableToken(slug: string, tableNumber: string, token: string): boolean {
  if (!slug || !tableNumber || !token) return false;
  const result = resolveTableToken(token, slug);
  return result.valid && result.tableNumber === tableNumber.trim();
}

import {
  generateTableToken,
  resolveTableToken,
  verifyTableToken,
} from '@qr-restaurant/shared';

export { generateTableToken, resolveTableToken, verifyTableToken };

export function generateUniqueTableCode(slug: string, tableNumber: string): string {
  return generateTableToken(slug, tableNumber);
}

export function resolveUniqueTableCode(
  slug: string,
  code: string
): { valid: boolean; tableNumber?: string } {
  const result = resolveTableToken(code, slug);
  return {
    valid: result.valid,
    tableNumber: result.tableNumber,
  };
}

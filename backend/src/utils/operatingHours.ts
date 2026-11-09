export const DAYS_OF_WEEK = [
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
  'sunday',
] as const;

/**
 * Sorts operating hours object keys in canonical Monday -> Sunday order.
 */
export function sortOperatingHours(operatingHours: any): any {
  if (!operatingHours || typeof operatingHours !== 'object') return operatingHours;
  const sorted: Record<string, any> = {};
  for (const day of DAYS_OF_WEEK) {
    if (operatingHours[day] !== undefined) {
      sorted[day] = operatingHours[day];
    }
  }
  for (const key of Object.keys(operatingHours)) {
    if (!(key in sorted)) {
      sorted[key] = operatingHours[key];
    }
  }
  return sorted;
}

/**
 * Checks if a restaurant is currently open based on its operating hours.
 * 
 * @param operatingHours - Record of day names to open/close/closed settings.
 * @param isOpenManualOverride - The manual isOpen toggle status from the database.
 * @returns boolean
 */
export function isRestaurantOpen(
  operatingHours: any,
  isOpenManualOverride = true
): boolean {
  // If the owner manually toggled the restaurant to open, it is open (master switch)
  return isOpenManualOverride;
}


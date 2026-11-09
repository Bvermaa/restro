export type OperatingHoursDay = {
  open: string;
  close: string;
  closed: boolean;
};

export type OperatingHours = Record<string, OperatingHoursDay>;

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
 * Checks if a restaurant is currently open based on its operating hours.
 * 
 * @param operatingHours - Record of day names to open/close/closed settings.
 * @param isOpenManualOverride - The manual isOpen toggle status from the database.
 * @returns boolean
 */
export function isRestaurantOpen(
  operatingHours: OperatingHours | null | undefined,
  isOpenManualOverride = true
): boolean {
  // If the owner manually toggled the restaurant to open, it is open (master switch)
  return isOpenManualOverride;
}

/**
 * Format a 24-hour time string into a 12-hour AM/PM string.
 * @param timeStr e.g. "13:30" or "09:00"
 */
export function formatTime12h(timeStr: string): string {
  if (!timeStr) return '';
  const [hour, min] = timeStr.split(':').map(Number);
  const ampm = hour >= 12 ? 'PM' : 'AM';
  const hour12 = hour % 12 || 12;
  const minStr = min < 10 ? `0${min}` : min;
  return `${hour12}:${minStr} ${ampm}`;
}

/**
 * Gets a beautiful status breakdown text and visual metadata for the restaurant state.
 */
export function getDetailedStatus(
  operatingHours: OperatingHours | null | undefined,
  isOpenManualOverride = true
): {
  status: 'OPEN' | 'CLOSED' | 'TEMPORARILY_CLOSED';
  badgeText: string;
  detailText: string;
  nextTimeText?: string;
} {
  if (!isOpenManualOverride) {
    return {
      status: 'TEMPORARILY_CLOSED',
      badgeText: 'Closed',
      detailText: 'Temporarily closed by owner',
    };
  }

  if (!operatingHours) {
    return {
      status: 'OPEN',
      badgeText: 'Open',
      detailText: 'Open now',
    };
  }

  const now = new Date();
  const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  const currentDayIndex = now.getDay();
  const currentDay = days[currentDayIndex];
  
  const isOpenNow = isRestaurantOpen(operatingHours, isOpenManualOverride);

  if (isOpenNow) {
    // Determine when it closes
    const hoursToday = operatingHours[currentDay];
    
    // Check if we are in yesterday's overnight session
    const yesterdayIndex = (currentDayIndex - 1 + 7) % 7;
    const yesterdayDay = days[yesterdayIndex];
    const hoursYesterday = operatingHours[yesterdayDay];
    const currentMinutes = now.getHours() * 60 + now.getMinutes();
    
    let closeTime = '';
    if (hoursYesterday && !hoursYesterday.closed && hoursYesterday.open && hoursYesterday.close) {
      const [yesterdayOpenHour, yesterdayOpenMin] = hoursYesterday.open.split(':').map(Number);
      const [yesterdayCloseHour, yesterdayCloseMin] = hoursYesterday.close.split(':').map(Number);
      const yesterdayOpenMinutes = yesterdayOpenHour * 60 + yesterdayOpenMin;
      const yesterdayCloseMinutes = yesterdayCloseHour * 60 + yesterdayCloseMin;
      
      if (yesterdayCloseMinutes < yesterdayOpenMinutes && currentMinutes < yesterdayCloseMinutes) {
        closeTime = hoursYesterday.close;
      }
    }
    
    if (!closeTime && hoursToday && !hoursToday.closed && hoursToday.close) {
      closeTime = hoursToday.close;
    }

    return {
      status: 'OPEN',
      badgeText: 'Open Now',
      detailText: closeTime ? `Closes at ${formatTime12h(closeTime)}` : 'Open now',
    };
  } else {
    // Closed. Find the next opening time.
    // Check if it opens later today
    const hoursToday = operatingHours[currentDay];
    const currentMinutes = now.getHours() * 60 + now.getMinutes();

    if (hoursToday && !hoursToday.closed && hoursToday.open) {
      const [openHour, openMin] = hoursToday.open.split(':').map(Number);
      const openMinutes = openHour * 60 + openMin;
      if (currentMinutes < openMinutes) {
        return {
          status: 'CLOSED',
          badgeText: 'Closed',
          detailText: `Opens today at ${formatTime12h(hoursToday.open)}`,
        };
      }
    }

    // Check upcoming days
    for (let i = 1; i <= 7; i++) {
      const nextDayIndex = (currentDayIndex + i) % 7;
      const nextDay = days[nextDayIndex];
      const hoursNextDay = operatingHours[nextDay];
      if (hoursNextDay && !hoursNextDay.closed && hoursNextDay.open) {
        const dayPrefix = i === 1 ? 'tomorrow' : nextDay;
        // Capitalize dayPrefix
        const formattedDay = dayPrefix.charAt(0).toUpperCase() + dayPrefix.slice(1);
        return {
          status: 'CLOSED',
          badgeText: 'Closed',
          detailText: `Opens ${formattedDay} at ${formatTime12h(hoursNextDay.open)}`,
        };
      }
    }

    return {
      status: 'CLOSED',
      badgeText: 'Closed',
      detailText: 'Closed',
    };
  }
}

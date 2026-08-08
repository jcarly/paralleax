import { getStoryWeekday, isStoryDateTime } from './calendar.js';
import type { TemporalCondition } from './types.js';

export function temporalConditionMatches(
  condition: TemporalCondition,
  currentDateTime: string,
): boolean {
  if (!isStoryDateTime(currentDateTime)) return false;
  const currentDate = currentDateTime.slice(0, 10);
  const currentTime = currentDateTime.slice(11);
  const calendar = [
    ...(condition.temporal.dates ?? []).map((date) => currentDate === date),
    ...(condition.temporal.dateRanges ?? []).map(
      ({ startDate, endDate }) => currentDate >= startDate && currentDate <= endDate,
    ),
  ];
  if (calendar.length > 0 && !calendar.some(Boolean)) return false;

  const weekdays = condition.temporal.weekdays ?? [];
  if (weekdays.length > 0 && !weekdays.includes(getStoryWeekday(currentDateTime))) return false;

  const slots = condition.temporal.timeSlots ?? [];
  return (
    slots.length === 0 ||
    slots.some(({ startTime, endTime }) =>
      startTime < endTime
        ? currentTime >= startTime && currentTime < endTime
        : currentTime >= startTime || currentTime < endTime,
    )
  );
}

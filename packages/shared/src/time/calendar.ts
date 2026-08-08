import type { Story } from '../model/stories.js';
import type { Weekday } from './types.js';

export const DEFAULT_STORY_DATE_TIME = '2000-01-03T08:00';

const STORY_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const STORY_TIME_PATTERN = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
const STORY_DATE_TIME_PATTERN = /^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d$/;
const WEEKDAYS: Weekday[] = [
  'sunday',
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
];

export function isStoryDate(value: string): boolean {
  if (!STORY_DATE_PATTERN.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
  );
}

export function isStoryTime(value: string): boolean {
  return STORY_TIME_PATTERN.test(value);
}

export function isStoryDateTime(value: string): boolean {
  return STORY_DATE_TIME_PATTERN.test(value) && isStoryDate(value.slice(0, 10));
}

export function addStoryMinutes(dateTime: string, minutes: number): string {
  if (!isStoryDateTime(dateTime)) throw new Error('Invalid story date and time');
  if (!Number.isInteger(minutes) || minutes < 0) {
    throw new Error('Interaction duration must be a non-negative integer');
  }
  const date = storyDateTimeToDate(dateTime);
  date.setUTCMinutes(date.getUTCMinutes() + minutes);
  return formatStoryDateTime(date);
}

export function getJourneyDateTime(story: Story, journey: string[]): string {
  let current = story.startDateTime ?? DEFAULT_STORY_DATE_TIME;
  for (const interactionId of journey) {
    const interaction = story.interactions.find(({ id }) => id === interactionId);
    if (interaction) current = addStoryMinutes(current, interaction.durationMinutes ?? 0);
  }
  return current;
}

export function getStoryWeekday(dateTime: string): Weekday {
  return WEEKDAYS[storyDateTimeToDate(dateTime).getUTCDay()];
}

function storyDateTimeToDate(value: string): Date {
  const [date, time] = value.split('T');
  const [year, month, day] = date.split('-').map(Number);
  const [hour, minute] = time.split(':').map(Number);
  return new Date(Date.UTC(year, month - 1, day, hour, minute));
}

function formatStoryDateTime(value: Date): string {
  return `${value.getUTCFullYear().toString().padStart(4, '0')}-${(value.getUTCMonth() + 1)
    .toString()
    .padStart(2, '0')}-${value.getUTCDate().toString().padStart(2, '0')}T${value
    .getUTCHours()
    .toString()
    .padStart(2, '0')}:${value.getUTCMinutes().toString().padStart(2, '0')}`;
}

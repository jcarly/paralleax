export type Weekday =
  'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday' | 'sunday';

export interface DateRange {
  startDate: string;
  endDate: string;
}

export interface TimeSlot {
  startTime: string;
  endTime: string;
}

export interface TemporalCondition {
  temporal: {
    dates?: string[];
    dateRanges?: DateRange[];
    weekdays?: Weekday[];
    timeSlots?: TimeSlot[];
  };
}

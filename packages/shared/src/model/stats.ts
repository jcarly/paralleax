export const STAT_VALUE_TYPES = ['number', 'boolean', 'string'] as const;

export type StatValueType = (typeof STAT_VALUE_TYPES)[number];
export type StatValue = number | boolean | string;

export interface StatDefinition {
  id: string;
  name: string;
  /** Existing definitions without an explicit type are numeric. */
  valueType?: StatValueType;
  category?: string;
  imageUrl?: string;
  changePerHour?: number;
}

export interface StatAssignment {
  id: string;
  statDefinitionId: string;
  initialValue: StatValue;
}

export interface StatEffect {
  statId: string;
  itemId?: string;
  operation: 'add' | 'set';
  value: StatValue;
}

export function getStatValueType(definition: StatDefinition): StatValueType {
  return definition.valueType ?? 'number';
}

export function isStatValueOfType(value: StatValue, valueType: StatValueType): boolean {
  return typeof value === valueType && (valueType !== 'number' || Number.isFinite(value));
}

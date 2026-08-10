export interface StatDefinition {
  id: string;
  name: string;
  category?: string;
  imageUrl?: string;
  changePerHour?: number;
}

export interface CharacterStat {
  id: string;
  statDefinitionId: string;
  initialValue: number;
}

export interface StatEffect {
  statId: string;
  operation: 'add' | 'set';
  value: number;
}

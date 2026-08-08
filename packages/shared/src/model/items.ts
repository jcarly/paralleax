export interface ItemDefinition {
  id: string;
  name: string;
  description: string;
  imageUrl?: string;
  stats?: ItemDefinitionStat[];
}

export interface ItemDefinitionStat {
  statDefinitionId: string;
  initialValue: number;
}

export interface ItemInstance {
  id: string;
  itemDefinitionId: string;
  parentItemId?: string;
  relationshipType?: ItemRelationshipType;
  slotKey?: string;
}

export type ItemRelationshipType =
  'contained' | 'equipped' | 'attached' | 'part_of' | 'installed' | 'worn' | 'held';

export interface ItemEffect {
  itemId?: string;
  itemDefinitionId?: string;
  characterId?: string;
  operation: 'obtain' | 'lose';
}

export interface ItemStatEffect {
  itemId: string;
  statDefinitionId: string;
  operation: 'add' | 'set';
  value: number;
}

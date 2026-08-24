import type { StatAssignment } from './stats.js';

export interface ItemDefinition {
  id: string;
  name: string;
  description: string;
  category?: string;
  imageUrl?: string;
  stats?: StatAssignment[];
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

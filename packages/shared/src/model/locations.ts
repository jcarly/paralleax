import type { ItemInstance } from './items.js';

export interface Location {
  id: string;
  name: string;
  description: string;
  category?: string;
  imageUrl?: string;
  items?: ItemInstance[];
}

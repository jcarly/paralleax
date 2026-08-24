import type { ItemInstance } from './items.js';
import type { StatAssignment } from './stats.js';

export interface Location {
  id: string;
  name: string;
  description: string;
  category?: string;
  imageUrl?: string;
  stats?: StatAssignment[];
  items?: ItemInstance[];
}

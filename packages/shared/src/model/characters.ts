import type { ItemInstance } from './items.js';
import type { StatAssignment } from './stats.js';

export interface Character {
  id: string;
  name: string;
  description: string;
  category?: string;
  imageUrl?: string;
  isPlayable?: boolean;
  stats?: StatAssignment[];
  items?: ItemInstance[];
}

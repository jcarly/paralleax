import type { ItemInstance } from './items.js';
import type { CharacterStat } from './stats.js';

export interface Character {
  id: string;
  name: string;
  description: string;
  imageUrl?: string;
  isPlayable?: boolean;
  stats?: CharacterStat[];
  items?: ItemInstance[];
}

import type { Story } from '@paralleax/shared';

export function storyHasBranchingChoice(story: Story): boolean {
  const destinationsBySource = new Map<string, Set<string>>();
  for (const target of story.interactions) {
    for (const trigger of target.triggers) {
      for (const sourceId of trigger.inputInteractionIds) {
        const destinations = destinationsBySource.get(sourceId) ?? new Set<string>();
        destinations.add(target.id);
        destinationsBySource.set(sourceId, destinations);
        if (destinations.size > 1) return true;
      }
    }
  }
  return false;
}

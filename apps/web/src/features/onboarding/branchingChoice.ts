import type { Story } from '@paralleax/shared';

const defaultScenePrompt = 'Describe what happens here.';

export function storyHasAuthoredScene(story: Story): boolean {
  return story.interactions.some(({ body }) => {
    const text = body
      .replace(/<[^>]*>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    return text.length > 0 && text !== defaultScenePrompt;
  });
}

function* connectedDestinations(story: Story): Iterable<{ sourceId: string; targetId: string }> {
  for (const target of story.interactions) {
    for (const trigger of target.triggers) {
      for (const sourceId of trigger.inputInteractionIds) {
        yield { sourceId, targetId: target.id };
      }
    }
  }
}

export function storyHasBranchingChoice(story: Story): boolean {
  const destinationsBySource = new Map<string, Set<string>>();
  for (const { sourceId, targetId } of connectedDestinations(story)) {
    const destinations = destinationsBySource.get(sourceId) ?? new Set<string>();
    destinations.add(targetId);
    destinationsBySource.set(sourceId, destinations);
    if (destinations.size > 1) {
      return true;
    }
  }
  return false;
}

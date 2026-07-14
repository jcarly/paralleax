export interface Position { x: number; y: number }
export interface TriggerCondition { interactionId: string; hasBeenVisited: boolean }
export interface Trigger {
  id: string;
  inputInteractionIds: string[];
  conditions: TriggerCondition[];
}
export interface Interaction {
  id: string;
  title: string;
  body: string;
  position: Position;
  triggers: Trigger[];
}
export interface Story {
  id: string;
  title: string;
  interactions: Interaction[];
  createdAt: string;
  updatedAt: string;
}
export interface CreateStoryInput { title?: string }
export interface CreateInteractionInput { parentId?: string; position?: Position }
export interface UpdateInteractionInput { title?: string; body?: string; position?: Position }
export interface UpdateTriggerInput { inputInteractionIds: string[]; conditions: TriggerCondition[] }

export function isTriggerEligible(trigger: Trigger, currentInteractionId: string | null, visited: Set<string>): boolean {
  const inputMatches = trigger.inputInteractionIds.length === 0
    ? currentInteractionId === null
    : currentInteractionId !== null && trigger.inputInteractionIds.includes(currentInteractionId);
  return inputMatches && trigger.conditions.every((condition) =>
    condition.hasBeenVisited ? visited.has(condition.interactionId) : !visited.has(condition.interactionId),
  );
}

export function getAvailableInteractions(story: Story, currentInteractionId: string | null, visitedIds: string[]): Interaction[] {
  const visited = new Set(visitedIds);
  return story.interactions.filter((interaction) =>
    interaction.triggers.some((trigger) => isTriggerEligible(trigger, currentInteractionId, visited)),
  );
}

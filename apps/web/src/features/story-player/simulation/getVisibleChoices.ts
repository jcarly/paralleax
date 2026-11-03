import type { TFunction } from 'i18next';
import type { Interaction, StatValue, Story, TriggerEvaluationContext } from '@paralleax/shared';
import {
  getInputReachableInteractions,
  getInteractionTimerState,
  getTriggerConditionFailures,
} from '@paralleax/shared';
import { getUnavailableReason } from '../storyPlayerPresentation';

interface VisibleChoiceContext {
  story?: Story;
  choices: Interaction[];
  isSimulationMode: boolean;
  runtimeSliceReady: boolean;
  availableChoiceIds: ReadonlySet<string>;
  currentInteraction?: Interaction;
  visited: string[];
  currentLocationId: string | null;
  currentDateTime: string;
  currentCharacterIds: string[];
  statValues: Readonly<Record<string, StatValue>>;
  ownedItemDefinitionIds: readonly string[];
  itemStatValues: Readonly<Record<string, Readonly<Record<string, StatValue>>>>;
  evaluationContext: TriggerEvaluationContext;
  t: TFunction;
}

type VisibleChoice = {
  interaction: Interaction;
  available: boolean;
  timerState: ReturnType<typeof getInteractionTimerState>;
  unavailableReason?: string;
};

export function getVisibleChoices(context: VisibleChoiceContext): VisibleChoice[] {
  if (!context.isSimulationMode || !context.story || !context.runtimeSliceReady) {
    return getReaderChoices(context);
  }
  const currentId = context.currentInteraction?.id ?? null;
  return getInputReachableInteractions(context.story, currentId).flatMap((interaction) => {
    const choice = getSimulationChoice(interaction, context);
    return choice ? [choice] : [];
  });
}

function getReaderChoices(context: VisibleChoiceContext): VisibleChoice[] {
  return context.choices.map((interaction) => ({
    interaction,
    available: true,
    timerState: getTimerState(interaction, context),
    unavailableReason: undefined,
  }));
}

function getSimulationChoice(
  interaction: Interaction,
  context: VisibleChoiceContext,
): VisibleChoice | undefined {
  const available = context.availableChoiceIds.has(interaction.id);
  if (!available && getConditionFailures(interaction, context).some(isLocationFailure)) {
    return undefined;
  }
  return {
    interaction,
    available,
    timerState: getTimerState(interaction, context),
    unavailableReason: available ? undefined : getReason(interaction, context),
  };
}

function getConditionFailures(interaction: Interaction, context: VisibleChoiceContext) {
  return getTriggerConditionFailures(
    interaction,
    context.currentInteraction?.id ?? null,
    context.visited,
    context.currentLocationId,
    context.currentCharacterIds,
    context.statValues,
    context.currentDateTime,
    context.ownedItemDefinitionIds,
    context.itemStatValues,
  );
}

function isLocationFailure(failure: ReturnType<typeof getTriggerConditionFailures>[number]) {
  return 'locationId' in failure.condition;
}

function getTimerState(interaction: Interaction, context: VisibleChoiceContext) {
  return getInteractionTimerState(
    interaction,
    context.currentInteraction?.id ?? null,
    context.visited,
    context.evaluationContext,
    context.currentLocationId,
    context.currentCharacterIds,
    context.statValues,
    context.currentDateTime,
    context.ownedItemDefinitionIds,
    context.itemStatValues,
  );
}

function getReason(interaction: Interaction, context: VisibleChoiceContext) {
  if (!context.story) {
    return undefined;
  }
  return getUnavailableReason(
    context.story,
    interaction,
    context.currentInteraction?.id ?? null,
    context.visited,
    context.currentLocationId,
    context.currentCharacterIds,
    context.statValues,
    context.currentDateTime,
    context.ownedItemDefinitionIds,
    context.itemStatValues,
    context.t,
    context.evaluationContext,
  );
}

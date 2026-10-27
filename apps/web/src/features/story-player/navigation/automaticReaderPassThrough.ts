import type { Interaction, Story } from '@paralleax/shared';
import { hasVisibleRichTextContent } from '../../../components/richTextProjection';

type ConditionalTextState = Parameters<typeof hasVisibleRichTextContent>[1];

interface ReaderBodyVisibilityOptions {
  current: Interaction | undefined;
  conditionalTextState: ConditionalTextState | undefined;
  conditionalTextBlockState: ConditionalTextState | undefined;
  statValues: Parameters<typeof hasVisibleRichTextContent>[3];
  itemStatValues: Parameters<typeof hasVisibleRichTextContent>[4];
}

interface AutomaticPathCandidate {
  storyId: string;
  journeyLength: number;
  interactionId: string;
  destinationId: string;
  stepKey: string;
}

interface PassThroughVisibilityOptions extends ReaderBodyVisibilityOptions {
  isSimulationMode: boolean;
  loadedKey: string;
  loadKey: string;
  runtimeSliceReady: boolean;
  hasRuntimeSliceError: boolean;
  journeyLength: number;
  playableCharacterCount: number;
  playedCharacterId: string | undefined;
  story: Story | undefined;
  currentStepStartedAt: string | undefined;
  choices: Interaction[];
  isAutomaticStepBlocked: (stepKey: string) => boolean;
  canContinueAutomaticPath: (path: AutomaticPathCandidate) => boolean;
}

export function isReaderInteractionBodyVisible({
  current,
  conditionalTextState,
  conditionalTextBlockState,
  statValues,
  itemStatValues,
}: ReaderBodyVisibilityOptions): boolean {
  return Boolean(
    current &&
    hasVisibleRichTextContent(
      current.body,
      conditionalTextState,
      conditionalTextBlockState,
      statValues,
      itemStatValues,
    ),
  );
}

export function getAutomaticReaderPassThroughDestination({
  story,
  current,
  choices,
  ...bodyState
}: ReaderBodyVisibilityOptions & {
  story: Story | undefined;
  choices: Interaction[];
}): Interaction | undefined {
  if (!story || !current || choices.length !== 1) {
    return undefined;
  }
  return isReaderInteractionBodyVisible({ current, ...bodyState }) ? undefined : choices[0];
}

export function getAutomaticReaderStepKey({
  story,
  journeyLength,
  current,
  currentStepStartedAt,
  choices,
}: Pick<
  PassThroughVisibilityOptions,
  'story' | 'journeyLength' | 'current' | 'currentStepStartedAt' | 'choices'
>): string {
  return [
    story?.id ?? '',
    story?.revision ?? 0,
    journeyLength,
    current?.id ?? '',
    currentStepStartedAt ?? '',
    choices.map(({ id }) => id).join(','),
  ].join(':');
}

export function shouldHideAutomaticReaderPassThrough(
  options: PassThroughVisibilityOptions,
): boolean {
  if (!hasPassThroughContext(options)) {
    return false;
  }
  if (!options.runtimeSliceReady) {
    return !options.hasRuntimeSliceError && !isReaderInteractionBodyVisible(options);
  }
  return hasAutomaticPassThroughDestination(options);
}

function hasPassThroughContext({
  isSimulationMode,
  loadedKey,
  loadKey,
  current,
  journeyLength,
  playableCharacterCount,
  playedCharacterId,
}: PassThroughVisibilityOptions): boolean {
  return Boolean(
    !isSimulationMode &&
    loadedKey === loadKey &&
    current &&
    journeyLength > 0 &&
    !(playableCharacterCount > 0 && !playedCharacterId),
  );
}

function hasAutomaticPassThroughDestination(options: PassThroughVisibilityOptions): boolean {
  const { story, current, choices, journeyLength, currentStepStartedAt } = options;
  const destination = getAutomaticReaderPassThroughDestination({
    story,
    current,
    choices,
    conditionalTextState: options.conditionalTextState,
    conditionalTextBlockState: options.conditionalTextBlockState,
    statValues: options.statValues,
    itemStatValues: options.itemStatValues,
  });
  const stepKey = getAutomaticReaderStepKey({
    story,
    journeyLength,
    current,
    currentStepStartedAt,
    choices,
  });
  if (!destination || !story || !current || options.isAutomaticStepBlocked(stepKey)) {
    return false;
  }
  return options.canContinueAutomaticPath({
    storyId: story.id,
    journeyLength,
    interactionId: current.id,
    destinationId: destination.id,
    stepKey,
  });
}

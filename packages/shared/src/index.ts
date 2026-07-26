export interface Position {
  x: number;
  y: number;
}
export interface InteractionVisitedCondition {
  interactionId: string;
  hasBeenVisited: boolean;
}
export interface LocationCondition {
  locationId: string;
  isCurrentLocation: boolean;
}
export interface CharacterCondition {
  characterId: string;
  isPresent: boolean;
}
export type StatComparisonOperator = 'eq' | 'lt' | 'lte' | 'gt' | 'gte';
export interface CharacterStatCondition {
  statId: string;
  operator: StatComparisonOperator;
  value: number;
}
export type Weekday =
  'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday' | 'sunday';
export interface DateRange {
  startDate: string;
  endDate: string;
}
export interface TimeSlot {
  startTime: string;
  endTime: string;
}
export interface TemporalCondition {
  temporal: {
    dates?: string[];
    dateRanges?: DateRange[];
    weekdays?: Weekday[];
    timeSlots?: TimeSlot[];
  };
}
export type TriggerCondition =
  | InteractionVisitedCondition
  | LocationCondition
  | CharacterCondition
  | CharacterStatCondition
  | TemporalCondition;
export interface Location {
  id: string;
  name: string;
  description: string;
  imageUrl?: string;
}
export interface Character {
  id: string;
  name: string;
  description: string;
  imageUrl?: string;
  stats?: CharacterStat[];
  items?: ItemInstance[];
}
export interface StatDefinition {
  id: string;
  name: string;
  imageUrl?: string;
}
export interface CharacterStat {
  id: string;
  statDefinitionId: string;
  initialValue: number;
}
export interface ItemDefinition {
  id: string;
  name: string;
  description: string;
  imageUrl?: string;
}
export interface ItemInstance {
  id: string;
  itemDefinitionId: string;
}
export interface StatEffect {
  statId: string;
  operation: 'add' | 'set';
  value: number;
}
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
  locationId?: string | null;
  characterIds?: string[];
  statEffects?: StatEffect[];
  durationMinutes?: number;
  triggers: Trigger[];
}
export interface Story {
  id: string;
  revision?: number;
  title: string;
  locations?: Location[];
  characters?: Character[];
  statDefinitions?: StatDefinition[];
  itemDefinitions?: ItemDefinition[];
  interactions: Interaction[];
  startDateTime?: string;
  createdAt: string;
  updatedAt: string;
}
export interface StoryMutationMetadata {
  revision: number;
  updatedAt: string;
}
export interface InteractionMutationResult extends StoryMutationMetadata {
  interaction: Interaction;
}
export interface TriggerMutationResult extends StoryMutationMetadata {
  interactionId: string;
  trigger: Trigger;
}
export interface LocationMutationResult extends StoryMutationMetadata {
  location: Location;
}
export interface CharacterMutationResult extends StoryMutationMetadata {
  character: Character;
}
export interface CharacterStatMutationResult extends StoryMutationMetadata {
  characterId: string;
  stat: CharacterStat;
}
export interface StatDefinitionMutationResult extends StoryMutationMetadata {
  statDefinition: StatDefinition;
}
export interface ItemDefinitionMutationResult extends StoryMutationMetadata {
  itemDefinition: ItemDefinition;
}
export interface CharacterItemMutationResult extends StoryMutationMetadata {
  characterId: string;
  item: ItemInstance;
}
export interface ReaderProgressState {
  version: 1;
  journeyInteractionIds: string[];
  currentInteractionId: string | null;
  visitedInteractionIds: string[];
  currentDateTime: string;
  currentLocationId: string | null;
  statValues: Record<string, number>;
  ownedItemIds: string[];
}
export interface ReaderProgress {
  state: ReaderProgressState;
  updatedAt: string;
}
export interface SaveReaderProgressInput {
  journeyInteractionIds: string[];
  ownedItemIds?: string[];
}
export interface CreateStoryInput {
  title: string;
}
export interface UpdateStoryInput {
  title?: string;
  startDateTime?: string;
}
export interface CreateInteractionInput {
  parentId?: string;
  position?: Position;
}
export interface UpdateInteractionInput {
  title?: string;
  body?: string | null;
  position?: Position;
  locationId?: string | null;
  characterIds?: string[];
  statEffects?: StatEffect[];
  durationMinutes?: number;
}
export interface CreateLocationInput {
  name: string;
  description?: string;
  imageUrl?: string;
}
export interface UpdateLocationInput {
  name?: string;
  description?: string;
  imageUrl?: string;
}
export interface CreateCharacterInput {
  name: string;
  description?: string;
  imageUrl?: string;
}
export interface UpdateCharacterInput {
  name?: string;
  description?: string;
  imageUrl?: string;
}
export interface CreateCharacterStatInput {
  statDefinitionId: string;
  initialValue: number;
}
export interface UpdateCharacterStatInput {
  initialValue?: number;
}
export interface CreateStatDefinitionInput {
  name: string;
  imageUrl?: string;
}
export interface UpdateStatDefinitionInput {
  name?: string;
  imageUrl?: string;
}
export interface CreateItemDefinitionInput {
  name: string;
  description?: string;
  imageUrl?: string;
}
export interface UpdateItemDefinitionInput {
  name?: string;
  description?: string;
  imageUrl?: string;
}
export interface CreateCharacterItemInput {
  itemDefinitionId: string;
}
export interface UpdateTriggerInput {
  inputInteractionIds: string[];
  conditions: TriggerCondition[];
}
export interface TriggerConditionFailure {
  triggerId: string;
  condition: TriggerCondition;
}
export type InteractionContentPatch = Partial<
  Pick<
    Interaction,
    | 'title'
    | 'body'
    | 'position'
    | 'locationId'
    | 'characterIds'
    | 'statEffects'
    | 'durationMinutes'
  >
>;
export type TriggerPatch = Pick<Trigger, 'inputInteractionIds' | 'conditions'>;

export const childOffsetX = 0;
export const childOffsetY = 132;
export const childVerticalGap = 132;
export const minNodeVerticalDistance = 112;
export const sameColumnTolerance = 260;
export const rootColumnX = 80;
export const rootStartY = 120;

export function createDemoStory(storyId: string, timestamp: string): Story {
  return {
    id: storyId,
    title: 'Demo: branching investigation',
    startDateTime: DEFAULT_STORY_DATE_TIME,
    locations: [],
    characters: [],
    createdAt: timestamp,
    updatedAt: timestamp,
    interactions: [
      {
        id: 'demo-root-museum',
        title: 'Enter the museum',
        body: 'The museum opens for a private evening visit. Two wings are lit, but the staff has vanished.',
        position: { x: 80, y: 120 },
        triggers: [{ id: 'demo-trigger-root-museum', inputInteractionIds: [], conditions: [] }],
      },
      {
        id: 'demo-root-archive',
        title: 'Start in the archive',
        body: 'You begin in the basement archive, surrounded by catalog cards and old security logs.',
        position: { x: 80, y: 420 },
        triggers: [{ id: 'demo-trigger-root-archive', inputInteractionIds: [], conditions: [] }],
      },
      {
        id: 'demo-signal',
        title: 'Follow the radio signal',
        body: 'A handheld radio crackles with a repeating code coming from the east wing.',
        position: { x: 420, y: 60 },
        triggers: [
          {
            id: 'demo-trigger-signal',
            inputInteractionIds: ['demo-root-museum'],
            conditions: [],
          },
        ],
      },
      {
        id: 'demo-door',
        title: 'Inspect the sealed door',
        body: 'A service door is sealed with a new electronic lock. Fresh scratches mark the frame.',
        position: { x: 420, y: 250 },
        triggers: [
          { id: 'demo-trigger-door', inputInteractionIds: ['demo-root-museum'], conditions: [] },
        ],
      },
      {
        id: 'demo-ledger',
        title: 'Read the missing ledger',
        body: 'The archive ledger lists one exhibit that should not exist: Gallery Zero.',
        position: { x: 420, y: 470 },
        triggers: [
          {
            id: 'demo-trigger-ledger',
            inputInteractionIds: ['demo-root-archive'],
            conditions: [],
          },
        ],
      },
      {
        id: 'demo-courtyard',
        title: 'Reach the inner courtyard',
        body: 'Both paths lead to a glass courtyard. Rain taps against the roof while the lights flicker.',
        position: { x: 760, y: 160 },
        triggers: [
          {
            id: 'demo-trigger-courtyard',
            inputInteractionIds: ['demo-signal', 'demo-door'],
            conditions: [],
          },
        ],
      },
      {
        id: 'demo-vault',
        title: 'Open Gallery Zero',
        body: 'The ledger code unlocks a hidden gallery. Inside, the missing exhibit waits under a dust cover.',
        position: { x: 1100, y: 80 },
        triggers: [
          {
            id: 'demo-trigger-vault',
            inputInteractionIds: ['demo-courtyard'],
            conditions: [{ interactionId: 'demo-ledger', hasBeenVisited: true }],
          },
        ],
      },
      {
        id: 'demo-guard',
        title: 'Call the night guard',
        body: 'Without the archive code, you call the night guard and describe the courtyard clue.',
        position: { x: 1100, y: 300 },
        triggers: [
          {
            id: 'demo-trigger-guard',
            inputInteractionIds: ['demo-courtyard'],
            conditions: [{ interactionId: 'demo-ledger', hasBeenVisited: false }],
          },
        ],
      },
      {
        id: 'demo-report',
        title: 'Write the incident report',
        body: 'Your notes connect the radio code, the sealed door, and the archive ledger into one report.',
        position: { x: 1440, y: 190 },
        triggers: [
          {
            id: 'demo-trigger-report',
            inputInteractionIds: ['demo-vault', 'demo-guard'],
            conditions: [],
          },
        ],
      },
    ],
  };
}

function hasOwn<T extends object, K extends PropertyKey>(
  item: T,
  key: K,
): item is T & Record<K, unknown> {
  return Object.prototype.hasOwnProperty.call(item, key);
}

export function normalizeTriggerInputIds(inputInteractionIds: string[]): string[] {
  return [...new Set(inputInteractionIds)];
}

export function updateInteractionInStory(
  story: Story,
  interactionId: string,
  patch: Partial<Interaction>,
): Story {
  return {
    ...story,
    interactions: story.interactions.map((item) =>
      item.id === interactionId ? { ...item, ...patch } : item,
    ),
  };
}

export function updateTriggerInStory(
  story: Story,
  interactionId: string,
  triggerId: string,
  patch: TriggerPatch,
): Story {
  return {
    ...story,
    interactions: story.interactions.map((item) =>
      item.id === interactionId
        ? {
            ...item,
            triggers: item.triggers.map((trigger) =>
              trigger.id === triggerId
                ? {
                    ...trigger,
                    inputInteractionIds: normalizeTriggerInputIds(patch.inputInteractionIds),
                    conditions: patch.conditions,
                  }
                : trigger,
            ),
          }
        : item,
    ),
  };
}

export function deleteTriggerInStory(
  story: Story,
  interactionId: string,
  triggerId: string,
): Story {
  return {
    ...story,
    interactions: story.interactions.map((item) =>
      item.id === interactionId
        ? {
            ...item,
            triggers:
              item.triggers.length <= 1
                ? item.triggers.map((trigger) =>
                    trigger.id === triggerId ? { ...trigger, inputInteractionIds: [] } : trigger,
                  )
                : item.triggers.filter((trigger) => trigger.id !== triggerId),
          }
        : item,
    ),
  };
}

export function deleteInteractionFromStory(story: Story, interactionId: string): Story {
  return {
    ...story,
    interactions: story.interactions
      .filter((item) => item.id !== interactionId)
      .map((item) => ({
        ...item,
        triggers: item.triggers.map((trigger) => {
          const inputInteractionIds = trigger.inputInteractionIds.filter(
            (id) => id !== interactionId,
          );
          return {
            ...trigger,
            inputInteractionIds,
            conditions: trigger.conditions.filter(
              (condition) =>
                !('interactionId' in condition) || condition.interactionId !== interactionId,
            ),
          };
        }),
      })),
  };
}

export function mergeServerStory(
  current: Story,
  incoming: Story,
  edited?: { interactionId: string; patch: InteractionContentPatch },
  options: {
    preserveCurrentTriggers?: boolean;
    deletedTriggerIds?: ReadonlySet<string>;
    deletedTriggerInputKeys?: ReadonlySet<string>;
  } = {},
): Story {
  return {
    ...incoming,
    interactions: incoming.interactions.map((item) => {
      const currentItem = current.interactions.find((candidate) => candidate.id === item.id);
      const triggers = (
        options.preserveCurrentTriggers && currentItem ? currentItem.triggers : item.triggers
      )
        .filter((trigger) => !options.deletedTriggerIds?.has(trigger.id))
        .map((trigger) => ({
          ...trigger,
          inputInteractionIds: trigger.inputInteractionIds.filter(
            (inputId) => !options.deletedTriggerInputKeys?.has(`${trigger.id}:${inputId}`),
          ),
        }));
      if (!currentItem) return { ...item, triggers };
      const patch = item.id === edited?.interactionId ? edited.patch : undefined;

      return {
        ...item,
        title: hasOwn(patch ?? {}, 'title') ? (patch?.title ?? '') : currentItem.title,
        body: hasOwn(patch ?? {}, 'body') ? (patch?.body ?? '') : currentItem.body,
        position: hasOwn(patch ?? {}, 'position')
          ? (patch?.position ?? currentItem.position)
          : currentItem.position,
        locationId: hasOwn(patch ?? {}, 'locationId')
          ? (patch?.locationId ?? null)
          : currentItem.locationId,
        characterIds: hasOwn(patch ?? {}, 'characterIds')
          ? (patch?.characterIds ?? [])
          : currentItem.characterIds,
        statEffects: hasOwn(patch ?? {}, 'statEffects')
          ? (patch?.statEffects ?? [])
          : currentItem.statEffects,
        durationMinutes: hasOwn(patch ?? {}, 'durationMinutes')
          ? (patch?.durationMinutes ?? 0)
          : currentItem.durationMinutes,
        triggers,
      };
    }),
  };
}

export function ensureStoryInteractionPositions(story: Story): Story {
  return {
    ...story,
    interactions: story.interactions.map((interaction, index) =>
      hasPosition(interaction)
        ? interaction
        : { ...interaction, position: getDefaultInteractionPosition(index) },
    ),
  };
}

export function getNextChildPosition(story: Story, parent: Interaction): Position {
  const parentPosition = getInteractionPosition(
    parent,
    story.interactions.findIndex((interaction) => interaction.id === parent.id),
  );
  const x = parentPosition.x + childOffsetX;
  const firstY = parentPosition.y + childOffsetY;
  const occupied = story.interactions.filter((item) => item.id !== parent.id);

  return findFreePosition(occupied, x, firstY);
}

export function getNextParentPosition(story: Story, target: Interaction): Position {
  const targetPosition = getInteractionPosition(
    target,
    story.interactions.findIndex((interaction) => interaction.id === target.id),
  );
  const x = targetPosition.x - childOffsetX;
  return findFreePositionAbove(story.interactions, x, targetPosition.y - childOffsetY);
}

export function getNextRootPosition(story: Story): Position {
  const roots = story.interactions.filter((interaction) =>
    interaction.triggers.some((trigger) => trigger.inputInteractionIds.length === 0),
  );
  if (roots.length === 0) return { x: rootColumnX, y: rootStartY };

  const lowestRoot = roots.reduce((lowest, interaction) => {
    const interactionPosition = getInteractionPosition(
      interaction,
      story.interactions.findIndex((item) => item.id === interaction.id),
    );
    const lowestPosition = getInteractionPosition(
      lowest,
      story.interactions.findIndex((item) => item.id === lowest.id),
    );
    return interactionPosition.y > lowestPosition.y ? interaction : lowest;
  });
  const lowestRootPosition = getInteractionPosition(
    lowestRoot,
    story.interactions.findIndex((item) => item.id === lowestRoot.id),
  );

  return findFreePosition(
    story.interactions,
    lowestRootPosition.x,
    lowestRootPosition.y + childVerticalGap,
  );
}

function findFreePosition(occupied: Interaction[], x: number, firstY: number): Position {
  for (let index = 0; index <= occupied.length + 1; index += 1) {
    const y = firstY + index * childVerticalGap;
    const isFree = occupied.every((item, itemIndex) => {
      const position = getInteractionPosition(item, itemIndex);
      return (
        Math.abs(position.x - x) > sameColumnTolerance ||
        Math.abs(position.y - y) >= minNodeVerticalDistance
      );
    });
    if (isFree) return { x, y };
  }

  return { x, y: firstY + (occupied.length + 2) * childVerticalGap };
}

function findFreePositionAbove(occupied: Interaction[], x: number, firstY: number): Position {
  for (let index = 0; index <= occupied.length + 1; index += 1) {
    const y = firstY - index * childVerticalGap;
    const isFree = occupied.every((item, itemIndex) => {
      const position = getInteractionPosition(item, itemIndex);
      return (
        Math.abs(position.x - x) > sameColumnTolerance ||
        Math.abs(position.y - y) >= minNodeVerticalDistance
      );
    });
    if (isFree) return { x, y };
  }

  return { x, y: firstY - (occupied.length + 2) * childVerticalGap };
}

function getInteractionPosition(interaction: Interaction, index: number): Position {
  if (hasPosition(interaction)) {
    return interaction.position;
  }

  return getDefaultInteractionPosition(index);
}

function getDefaultInteractionPosition(index: number): Position {
  return {
    x: rootColumnX,
    y: rootStartY + Math.max(index, 0) * childVerticalGap,
  };
}

function hasPosition(interaction: Interaction): boolean {
  return (
    typeof interaction.position?.x === 'number' &&
    Number.isFinite(interaction.position.x) &&
    typeof interaction.position?.y === 'number' &&
    Number.isFinite(interaction.position.y)
  );
}

export const DEFAULT_STORY_DATE_TIME = '2000-01-03T08:00';
const STORY_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const STORY_TIME_PATTERN = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
const STORY_DATE_TIME_PATTERN = /^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d$/;
const WEEKDAYS: Weekday[] = [
  'sunday',
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
];

export function isStoryDate(value: string): boolean {
  if (!STORY_DATE_PATTERN.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
  );
}

export function isStoryTime(value: string): boolean {
  return STORY_TIME_PATTERN.test(value);
}

export function isStoryDateTime(value: string): boolean {
  return STORY_DATE_TIME_PATTERN.test(value) && isStoryDate(value.slice(0, 10));
}

export function addStoryMinutes(dateTime: string, minutes: number): string {
  if (!isStoryDateTime(dateTime)) throw new Error('Invalid story date and time');
  if (!Number.isInteger(minutes) || minutes < 0) {
    throw new Error('Interaction duration must be a non-negative integer');
  }
  const date = storyDateTimeToDate(dateTime);
  date.setUTCMinutes(date.getUTCMinutes() + minutes);
  return formatStoryDateTime(date);
}

export function getJourneyDateTime(story: Story, journey: string[]): string {
  let current = story.startDateTime ?? DEFAULT_STORY_DATE_TIME;
  for (const interactionId of journey) {
    const interaction = story.interactions.find(({ id }) => id === interactionId);
    if (interaction) current = addStoryMinutes(current, interaction.durationMinutes ?? 0);
  }
  return current;
}

export function temporalConditionMatches(
  condition: TemporalCondition,
  currentDateTime: string,
): boolean {
  if (!isStoryDateTime(currentDateTime)) return false;
  const currentDate = currentDateTime.slice(0, 10);
  const currentTime = currentDateTime.slice(11);
  const calendar = [
    ...(condition.temporal.dates ?? []).map((date) => currentDate === date),
    ...(condition.temporal.dateRanges ?? []).map(
      ({ startDate, endDate }) => currentDate >= startDate && currentDate <= endDate,
    ),
  ];
  if (calendar.length > 0 && !calendar.some(Boolean)) return false;

  const weekdays = condition.temporal.weekdays ?? [];
  if (weekdays.length > 0) {
    const weekday = WEEKDAYS[storyDateTimeToDate(currentDateTime).getUTCDay()];
    if (!weekdays.includes(weekday)) return false;
  }

  const slots = condition.temporal.timeSlots ?? [];
  return (
    slots.length === 0 ||
    slots.some(({ startTime, endTime }) =>
      startTime < endTime
        ? currentTime >= startTime && currentTime < endTime
        : currentTime >= startTime || currentTime < endTime,
    )
  );
}

function storyDateTimeToDate(value: string): Date {
  const [date, time] = value.split('T');
  const [year, month, day] = date.split('-').map(Number);
  const [hour, minute] = time.split(':').map(Number);
  return new Date(Date.UTC(year, month - 1, day, hour, minute));
}

function formatStoryDateTime(value: Date): string {
  return `${value.getUTCFullYear().toString().padStart(4, '0')}-${(value.getUTCMonth() + 1)
    .toString()
    .padStart(2, '0')}-${value.getUTCDate().toString().padStart(2, '0')}T${value
    .getUTCHours()
    .toString()
    .padStart(2, '0')}:${value.getUTCMinutes().toString().padStart(2, '0')}`;
}

export function isTriggerEligible(
  trigger: Trigger,
  currentInteractionId: string | null,
  visited: Set<string>,
  currentLocationId: string | null = null,
  currentCharacterIds: string[] = [],
  statValues: Readonly<Record<string, number>> = {},
  currentDateTime = DEFAULT_STORY_DATE_TIME,
): boolean {
  return (
    doesTriggerInputMatch(trigger, currentInteractionId) &&
    trigger.conditions.every((condition) =>
      conditionMatches(
        condition,
        visited,
        currentLocationId,
        currentCharacterIds,
        statValues,
        currentDateTime,
      ),
    )
  );
}

export function doesTriggerInputMatch(
  trigger: Trigger,
  currentInteractionId: string | null,
): boolean {
  const hasInputs = trigger.inputInteractionIds.length > 0;
  const hasConditions = trigger.conditions.length > 0;
  return hasInputs
    ? currentInteractionId !== null && trigger.inputInteractionIds.includes(currentInteractionId)
    : hasConditions || currentInteractionId === null;
}

export function getAvailableInteractions(
  story: Story,
  currentInteractionId: string | null,
  visitedIds: string[],
  currentLocationId: string | null = null,
  currentCharacterIds: string[] = [],
  statValues: Readonly<Record<string, number>> = {},
  currentDateTime = story.startDateTime ?? DEFAULT_STORY_DATE_TIME,
): Interaction[] {
  const visited = new Set(visitedIds);
  return story.interactions.filter((interaction) =>
    interaction.triggers.some((trigger) =>
      isTriggerEligible(
        trigger,
        currentInteractionId,
        visited,
        currentLocationId,
        currentCharacterIds,
        statValues,
        currentDateTime,
      ),
    ),
  );
}

export function getInputReachableInteractions(
  story: Story,
  currentInteractionId: string | null,
): Interaction[] {
  return story.interactions.filter((interaction) =>
    interaction.triggers.some((trigger) => doesTriggerInputMatch(trigger, currentInteractionId)),
  );
}

export function getTriggerConditionFailures(
  interaction: Interaction,
  currentInteractionId: string | null,
  visitedIds: string[],
  currentLocationId: string | null = null,
  currentCharacterIds: string[] = [],
  statValues: Readonly<Record<string, number>> = {},
  currentDateTime = DEFAULT_STORY_DATE_TIME,
): TriggerConditionFailure[] {
  const visited = new Set(visitedIds);
  const inputMatchingTriggers = interaction.triggers.filter((trigger) =>
    doesTriggerInputMatch(trigger, currentInteractionId),
  );

  if (
    inputMatchingTriggers.some((trigger) =>
      trigger.conditions.every((condition) =>
        conditionMatches(
          condition,
          visited,
          currentLocationId,
          currentCharacterIds,
          statValues,
          currentDateTime,
        ),
      ),
    )
  ) {
    return [];
  }

  return inputMatchingTriggers.flatMap((trigger) =>
    trigger.conditions
      .filter(
        (condition) =>
          !conditionMatches(
            condition,
            visited,
            currentLocationId,
            currentCharacterIds,
            statValues,
            currentDateTime,
          ),
      )
      .map((condition) => ({ triggerId: trigger.id, condition })),
  );
}

function conditionMatches(
  condition: TriggerCondition,
  visited: Set<string>,
  currentLocationId: string | null,
  currentCharacterIds: string[],
  statValues: Readonly<Record<string, number>>,
  currentDateTime: string,
) {
  if ('interactionId' in condition) {
    return condition.hasBeenVisited
      ? visited.has(condition.interactionId)
      : !visited.has(condition.interactionId);
  }
  if ('locationId' in condition) {
    const matches = currentLocationId === condition.locationId;
    return condition.isCurrentLocation ? matches : !matches;
  }
  if ('characterId' in condition) {
    const isPresent = currentCharacterIds.includes(condition.characterId);
    return condition.isPresent ? isPresent : !isPresent;
  }
  if ('temporal' in condition) return temporalConditionMatches(condition, currentDateTime);
  const currentValue = statValues[condition.statId] ?? 0;
  if (condition.operator === 'eq') return currentValue === condition.value;
  if (condition.operator === 'lt') return currentValue < condition.value;
  if (condition.operator === 'lte') return currentValue <= condition.value;
  if (condition.operator === 'gt') return currentValue > condition.value;
  return currentValue >= condition.value;
}

export function getInitialStatValues(story: Story): Record<string, number> {
  return Object.fromEntries(
    (story.characters ?? []).flatMap((character) =>
      (character.stats ?? []).map((stat) => [stat.id, stat.initialValue]),
    ),
  );
}

export function applyInteractionStatEffects(
  values: Readonly<Record<string, number>>,
  interaction: Interaction,
): Record<string, number> {
  const next = { ...values };
  for (const effect of interaction.statEffects ?? []) {
    next[effect.statId] =
      effect.operation === 'set' ? effect.value : (next[effect.statId] ?? 0) + effect.value;
  }
  return next;
}

export function getJourneyStatValues(story: Story, journey: string[]): Record<string, number> {
  return journey.reduce((values, interactionId) => {
    const interaction = story.interactions.find(({ id }) => id === interactionId);
    return interaction ? applyInteractionStatEffects(values, interaction) : values;
  }, getInitialStatValues(story));
}

export function getJourneyLocation(story: Story, journey: string[]): string | null {
  for (let index = journey.length - 1; index >= 0; index -= 1) {
    const interaction = story.interactions.find(({ id }) => id === journey[index]);
    if (interaction?.locationId) return interaction.locationId;
  }
  return null;
}

export function buildReaderProgressState(
  story: Story,
  journeyInteractionIds: string[],
  ownedItemIds: string[] = [],
): ReaderProgressState {
  const interactionIds = new Set(story.interactions.map(({ id }) => id));
  const itemIds = new Set(
    (story.characters ?? []).flatMap((character) => (character.items ?? []).map(({ id }) => id)),
  );
  const journey = journeyInteractionIds.filter((id) => interactionIds.has(id));
  const items = [...new Set(ownedItemIds.filter((id) => itemIds.has(id)))];
  return {
    version: 1,
    journeyInteractionIds: journey,
    currentInteractionId: journey.at(-1) ?? null,
    visitedInteractionIds: [...new Set(journey)],
    currentDateTime: getJourneyDateTime(story, journey),
    currentLocationId: getJourneyLocation(story, journey),
    statValues: getJourneyStatValues(story, journey),
    ownedItemIds: items,
  };
}

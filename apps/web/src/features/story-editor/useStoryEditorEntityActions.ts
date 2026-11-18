import type { Character, ItemDefinition, Location, StatDefinition, Story } from '@paralleax/shared';
import type { useStoryEditorPersistence } from '../../hooks/useStoryEditorPersistence';
import type { useStoryContextNavigation } from './navigation/useStoryContextNavigation';
import type { StoryEditorExclusiveSelection } from './selection/useStoryEditorSelection';

type StoryEditorEntityActionInput = {
  story: Story | undefined;
  selectedCharacter: Character | undefined;
  setStory: (story: Story) => void;
  selectExclusive: (selection?: StoryEditorExclusiveSelection) => void;
  openContextPanel: () => void;
  openContextSection: ReturnType<typeof useStoryContextNavigation>['openContextSection'];
} & Pick<
  ReturnType<typeof useStoryEditorPersistence>,
  'createLocation' | 'createCharacter' | 'createStatDefinition' | 'createItemDefinition'
>;

async function addStoryLocation(input: StoryEditorEntityActionInput) {
  const locationId = await input.createLocation();
  if (locationId === undefined || locationId.length === 0) {
    return;
  }
  input.selectExclusive({ type: 'location', id: locationId });
  input.openContextPanel();
  input.openContextSection('locations');
}

function updateStoryLocation(input: StoryEditorEntityActionInput, nextLocation: Location) {
  if (!input.story) {
    return;
  }
  input.setStory({
    ...input.story,
    locations: (input.story.locations ?? []).map((location) =>
      location.id === nextLocation.id ? nextLocation : location,
    ),
  });
}

async function addStoryCharacter(input: StoryEditorEntityActionInput) {
  const characterId = await input.createCharacter();
  if (characterId === undefined || characterId.length === 0) {
    return;
  }
  input.selectExclusive({ type: 'character', id: characterId });
  input.openContextPanel();
  input.openContextSection('characters');
}

function addStoryStatDefinition(input: StoryEditorEntityActionInput) {
  input.selectExclusive({ type: 'statDefinitionCreation' });
  input.openContextPanel();
  input.openContextSection('stats');
}

function updateStoryStatDefinition(
  input: StoryEditorEntityActionInput,
  nextDefinition: StatDefinition,
) {
  if (!input.story) {
    return;
  }
  input.setStory({
    ...input.story,
    statDefinitions: (input.story.statDefinitions ?? []).map((definition) =>
      definition.id === nextDefinition.id ? nextDefinition : definition,
    ),
  });
}

async function addStoryItemDefinition(input: StoryEditorEntityActionInput) {
  const itemDefinitionId = await input.createItemDefinition();
  if (itemDefinitionId === undefined || itemDefinitionId.length === 0) {
    return;
  }
  input.selectExclusive({ type: 'itemDefinition', id: itemDefinitionId });
  input.openContextPanel();
  input.openContextSection('items');
}

function updateStoryItemDefinition(
  input: StoryEditorEntityActionInput,
  nextDefinition: ItemDefinition,
) {
  if (!input.story) {
    return;
  }
  input.setStory({
    ...input.story,
    itemDefinitions: (input.story.itemDefinitions ?? []).map((definition) =>
      definition.id === nextDefinition.id ? nextDefinition : definition,
    ),
  });
}

function updateStoryCharacter(input: StoryEditorEntityActionInput, patch: Partial<Character>) {
  if (!input.story || !input.selectedCharacter) {
    return;
  }
  input.setStory({
    ...input.story,
    characters: (input.story.characters ?? []).map((character) =>
      character.id === input.selectedCharacter?.id ? { ...character, ...patch } : character,
    ),
  });
}

export function useStoryEditorEntityActions(input: StoryEditorEntityActionInput) {
  return {
    addLocation: () => addStoryLocation(input),
    updateLocalLocation: (location: Location) => {
      updateStoryLocation(input, location);
    },
    addCharacter: () => addStoryCharacter(input),
    addStatDefinition: () => {
      addStoryStatDefinition(input);
    },
    updateLocalStatDefinition: (definition: StatDefinition) => {
      updateStoryStatDefinition(input, definition);
    },
    addItemDefinition: () => addStoryItemDefinition(input),
    updateLocalItemDefinition: (definition: ItemDefinition) => {
      updateStoryItemDefinition(input, definition);
    },
    updateLocalCharacter: (patch: Partial<Character>) => {
      updateStoryCharacter(input, patch);
    },
  };
}

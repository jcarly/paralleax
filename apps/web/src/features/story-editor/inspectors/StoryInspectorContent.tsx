import { lazy, Suspense } from 'react';
import { CharacterInspector } from '../../../components/CharacterInspector';
import { ItemDefinitionInspector } from '../../../components/ItemDefinitionInspector';
import { LocationInspector } from '../../../components/LocationInspector';
import { StatDefinitionInspector } from '../../../components/StatDefinitionInspector';
import { StoryGraphSelectionInspector } from '../../../components/StoryGraphSelectionInspector';
import { GraphDecorationInspector } from '../../graph-decorations/GraphDecorationInspector';
import { ReviewTargetInspector } from './ReviewTargetInspector';
import type {
  StoryEditorInspectorActions,
  StoryEditorInspectorModel,
} from './storyEditorInspectorModel';

const TriggerInspector = lazy(() =>
  import('../../../components/TriggerInspector').then((module) => ({
    default: module.TriggerInspector,
  })),
);
const InteractionInspector = lazy(() =>
  import('../../../components/InteractionInspector').then((module) => ({
    default: module.InteractionInspector,
  })),
);

export function StoryInspectorContent({ model }: { model: StoryEditorInspectorModel }) {
  const { selection } = model;
  if (selection.graphSelection) {
    return <StoryGraphSelectionContent model={model} />;
  }
  if (selection.selectedGraphDecoration) {
    return <StoryGraphDecorationContent model={model} />;
  }
  if (
    !model.reviewOnly &&
    (selection.isCreatingStatDefinition || selection.selectedStatDefinition)
  ) {
    return <StoryStatDefinitionContent model={model} />;
  }
  if (model.reviewOnly) {
    return <StoryReviewContent model={model} />;
  }
  if (selection.selected) {
    return <StoryInteractionContent model={model} />;
  }
  if (selection.selectedTriggerTarget) {
    return <StoryTriggerContent model={model} />;
  }
  if (hasStoryContextInspectorSelection(selection)) {
    return <StoryContextEntityInspectorContent model={model} />;
  }
  return null;
}

function hasStoryContextInspectorSelection(selection: StoryEditorInspectorModel['selection']) {
  return Boolean(
    selection.selectedLocation ?? selection.selectedCharacter ?? selection.selectedItemDefinition,
  );
}

function StoryContextEntityInspectorContent({ model }: { model: StoryEditorInspectorModel }) {
  if (model.selection.selectedLocation) {
    return <StoryLocationContent model={model} />;
  }
  if (model.selection.selectedCharacter) {
    return <StoryCharacterContent model={model} />;
  }
  if (model.selection.selectedItemDefinition) {
    return <StoryItemDefinitionContent model={model} />;
  }
  return null;
}

function StoryGraphSelectionContent({ model }: { model: StoryEditorInspectorModel }) {
  const selection = model.selection.graphSelection;
  if (!selection) {
    return null;
  }
  return (
    <StoryGraphSelectionInspector
      selection={selection}
      onCreateGroup={async (title, ids) =>
        Boolean(await model.actions.createEditorGroup(title, ids))
      }
    />
  );
}

function StoryGraphDecorationContent({ model }: { model: StoryEditorInspectorModel }) {
  const decoration = model.selection.selectedGraphDecoration;
  if (!decoration) {
    return null;
  }
  return (
    <GraphDecorationInspector
      decoration={decoration}
      onPatch={(patch) => void model.actions.updateGraphDecoration(decoration.id, patch)}
      onDelete={() =>
        void model.actions.deleteGraphElement({
          kind: 'graphDecoration',
          decorationId: decoration.id,
        })
      }
    />
  );
}

function StoryStatDefinitionContent({ model }: { model: StoryEditorInspectorModel }) {
  const { selection, actions, story } = model;
  return (
    <StatDefinitionInspector
      categorySuggestions={model.statCategories}
      creating={selection.isCreatingStatDefinition}
      key={selection.selectedStatDefinition?.id ?? 'creating-stat-definition'}
      onChange={actions.updateLocalStatDefinition}
      onClose={actions.closeInspector}
      onCreate={async (input) => createStoryStatDefinition(model, input)}
      onPatch={actions.updateStatDefinition}
      onStory={actions.setStory}
      statDefinition={selection.selectedStatDefinition}
      story={story}
      textCommentCounts={model.commentSummary.selectedTextCommentCounts}
      onOpenTextComments={actions.openTextComments}
      semanticCommentCounts={model.commentSummary.selectedSemanticCommentCounts}
      onOpenSemanticComments={actions.openSemanticComments}
    />
  );
}

async function createStoryStatDefinition(
  model: StoryEditorInspectorModel,
  input: Parameters<StoryEditorInspectorActions['createStatDefinition']>[0],
) {
  const definitionId = await model.actions.createStatDefinition(input);
  if (definitionId !== undefined && definitionId.length > 0) {
    model.actions.selectExclusive({ type: 'statDefinition', id: definitionId });
  }
  return definitionId;
}

function StoryReviewContent({ model }: { model: StoryEditorInspectorModel }) {
  const { selection, commentSummary, actions } = model;
  return (
    <ReviewTargetInspector
      interaction={selection.selected}
      trigger={selection.selectedTriggerTarget?.trigger}
      location={selection.selectedLocation}
      character={selection.selectedCharacter}
      statDefinition={selection.selectedStatDefinition}
      itemDefinition={selection.selectedItemDefinition}
      textCommentCounts={commentSummary.selectedTextCommentCounts}
      onOpenTextComments={actions.openTextComments}
    />
  );
}

function StoryInteractionContent({ model }: { model: StoryEditorInspectorModel }) {
  const interaction = model.selection.selected;
  if (!interaction) {
    return null;
  }
  const { actions, commentSummary } = model;
  return (
    <Suspense
      fallback={
        <p className="hint" role="status">
          {model.t('shell.loading')}
        </p>
      }
    >
      <InteractionInspector
        story={model.story}
        interaction={interaction}
        onChange={actions.setStory}
        onPatch={actions.patchInteraction}
        onContentSaved={(body) => {
          if (body.replace(/<[^>]*>/g, ' ').trim()) {
            actions.reportStepComplete(model.storyId, 'write-scene');
          }
        }}
        onDelete={actions.remove}
        onSelectInteraction={(interactionId) => {
          actions.selectExclusive({ type: 'interaction', id: interactionId });
        }}
        onAddOption={() => actions.createChildAndFocus(interaction.id)}
        textCommentCounts={commentSummary.selectedTextCommentCounts}
        onOpenTextComments={actions.openTextComments}
        semanticCommentCounts={commentSummary.selectedSemanticCommentCounts}
        onOpenSemanticComments={actions.openSemanticComments}
      />
    </Suspense>
  );
}

function StoryTriggerContent({ model }: { model: StoryEditorInspectorModel }) {
  const target = model.selection.selectedTriggerTarget;
  if (!target) {
    return null;
  }
  return (
    <Suspense
      fallback={
        <p className="hint" role="status">
          {model.t('shell.loading')}
        </p>
      }
    >
      <TriggerInspector
        story={model.story}
        interaction={target.interaction}
        trigger={target.trigger}
        onSaveTrigger={model.actions.saveTrigger}
        onDeleteTrigger={model.actions.deleteSelectedTrigger}
        semanticCommentCounts={model.commentSummary.selectedSemanticCommentCounts}
        onOpenSemanticComments={model.actions.openSemanticComments}
      />
    </Suspense>
  );
}

function StoryLocationContent({ model }: { model: StoryEditorInspectorModel }) {
  const location = model.selection.selectedLocation;
  if (!location) {
    return null;
  }
  return (
    <LocationInspector
      location={location}
      categorySuggestions={model.locationCategories}
      onLocalChange={model.actions.updateLocalLocation}
      onPatch={model.actions.updateLocation}
      itemDefinitions={model.story.itemDefinitions ?? []}
      statDefinitions={model.story.statDefinitions ?? []}
      onMoveItem={model.actions.moveItemInstance}
      textCommentCounts={model.commentSummary.selectedTextCommentCounts}
      onOpenTextComments={model.actions.openTextComments}
      semanticCommentCounts={model.commentSummary.selectedSemanticCommentCounts}
      onOpenSemanticComments={model.actions.openSemanticComments}
    />
  );
}

function StoryCharacterContent({ model }: { model: StoryEditorInspectorModel }) {
  const character = model.selection.selectedCharacter;
  if (!character) {
    return null;
  }
  const { actions, story, commentSummary } = model;
  return (
    <CharacterInspector
      character={character}
      categorySuggestions={model.characterCategories}
      statDefinitions={story.statDefinitions ?? []}
      itemDefinitions={story.itemDefinitions ?? []}
      onChange={actions.updateLocalCharacter}
      onPatch={actions.updateCharacter}
      onCreateStat={actions.createCharacterStat}
      onPatchStat={actions.updateCharacterStat}
      onDeleteStat={actions.deleteCharacterStat}
      onCreateItem={actions.createCharacterItem}
      onDeleteItem={actions.deleteCharacterItem}
      onMoveItem={actions.moveItemInstance}
      textCommentCounts={commentSummary.selectedTextCommentCounts}
      onOpenTextComments={actions.openTextComments}
      semanticCommentCounts={commentSummary.selectedSemanticCommentCounts}
      onOpenSemanticComments={actions.openSemanticComments}
    />
  );
}

function StoryItemDefinitionContent({ model }: { model: StoryEditorInspectorModel }) {
  const itemDefinition = model.selection.selectedItemDefinition;
  if (!itemDefinition) {
    return null;
  }
  return (
    <ItemDefinitionInspector
      itemDefinition={itemDefinition}
      categorySuggestions={model.itemCategories}
      statDefinitions={model.story.statDefinitions ?? []}
      onChange={model.actions.updateLocalItemDefinition}
      onPatch={model.actions.updateItemDefinition}
      textCommentCounts={model.commentSummary.selectedTextCommentCounts}
      onOpenTextComments={model.actions.openTextComments}
      semanticCommentCounts={model.commentSummary.selectedSemanticCommentCounts}
      onOpenSemanticComments={model.actions.openSemanticComments}
    />
  );
}

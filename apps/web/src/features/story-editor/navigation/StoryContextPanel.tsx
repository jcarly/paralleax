import type { Dispatch, SetStateAction } from 'react';
import type { useTranslation } from 'react-i18next';
import type { CommentTargetType, Story } from '@paralleax/shared';
import type { useStoryEditorPersistence } from '../../../hooks/useStoryEditorPersistence';
import type {
  useStoryEditorSelection,
  StoryEditorExclusiveSelection,
} from '../selection/useStoryEditorSelection';
import type { useStoryEditorEntityActions } from '../useStoryEditorEntityActions';
import type { useStoryContextNavigation } from './useStoryContextNavigation';
import { StoryGroupsPanel } from './StoryGroupsPanel';
import {
  CharacterContextSection,
  ItemDefinitionContextSection,
  LocationContextSection,
  StatDefinitionContextSection,
} from './StoryContextEntitySections';

type StoryEditorSelectionModel = ReturnType<typeof useStoryEditorSelection>;
type StoryContextNavigationModel = ReturnType<typeof useStoryContextNavigation>;
type StoryGroupActions = {
  create: (title: string, ids: string[], parentGroupId?: string) => Promise<string | false>;
  editingGroupId: string | undefined;
  setEditingGroupId: Dispatch<SetStateAction<string | undefined>>;
  update: ReturnType<typeof useStoryEditorPersistence>['updateGroup'];
  delete: ReturnType<typeof useStoryEditorPersistence>['deleteGroup'];
};

type StoryContextPanelProps = {
  story: Story;
  navigation: StoryContextNavigationModel;
  selection: StoryEditorSelectionModel;
  reviewOnly: boolean;
  commentCounts: ReadonlyMap<string, number>;
  selectExclusive: (selection?: StoryEditorExclusiveSelection) => void;
  selectInteraction: (interactionId: string) => void;
  setCommentsOpen: Dispatch<SetStateAction<boolean>>;
  openCommentsForTarget: (targetType: CommentTargetType, targetId: string) => void;
  focusInteractions: (ids: string[]) => void;
  groupActions: StoryGroupActions;
  entityActions: Pick<
    ReturnType<typeof useStoryEditorEntityActions>,
    'addStatDefinition' | 'addItemDefinition' | 'addCharacter' | 'addLocation'
  >;
  t: ReturnType<typeof useTranslation>['t'];
};

export function StoryContextPanel(props: StoryContextPanelProps) {
  const { navigation, t } = props;
  const open = navigation.isContextPanelOpen;
  return (
    <nav className={`location-panel ${open ? '' : 'collapsed'}`} aria-label={t('editor.context')}>
      <button
        className="ghost navigation-toggle"
        type="button"
        aria-label={t(open ? 'editor.collapseContext' : 'editor.expandContext')}
        aria-expanded={open}
        aria-controls="story-context-panel-content"
        onClick={navigation.toggleContextPanel}
      >
        {open ? '‹' : '›'}
      </button>
      {open ? <StoryContextPanelContent {...props} /> : null}
    </nav>
  );
}

function StoryContextPanelContent(props: StoryContextPanelProps) {
  return (
    <div className="location-panel-content" id="story-context-panel-content">
      <StoryContextSearch navigation={props.navigation} t={props.t} />
      <StoryContextEntitySectionsTop {...props} />
      <StoryContextEntitySectionsBottom {...props} />
      <StoryContextGroupsSection {...props} />
    </div>
  );
}

function StoryContextSearch({ navigation, t }: Pick<StoryContextPanelProps, 'navigation' | 't'>) {
  const count = navigation.navigationInteractionIds.length;
  const position = count === 0 ? '0 / 0' : `${navigation.currentNavigationIndex + 1} / ${count}`;
  return (
    <div className="context-search">
      <input
        type="search"
        aria-label={t('editor.search')}
        placeholder={t('editor.searchPlaceholder')}
        value={navigation.searchQuery}
        onChange={(event) => {
          navigation.setSearchQuery(event.target.value);
        }}
      />
      <button
        className="ghost"
        type="button"
        aria-label={t('editor.previousResult')}
        title={t('editor.previousResult')}
        disabled={count === 0}
        onClick={() => {
          navigation.navigateInteractions(-1);
        }}
      >
        ↑
      </button>
      <button
        className="ghost"
        type="button"
        aria-label={t('editor.nextResult')}
        title={t('editor.nextResult')}
        disabled={count === 0}
        onClick={() => {
          navigation.navigateInteractions(1);
        }}
      >
        ↓
      </button>
      <span className="context-search-count" aria-live="polite">
        {position}
      </span>
    </div>
  );
}

function StoryContextEntitySectionsTop(props: StoryContextPanelProps) {
  const { navigation, selection, story, reviewOnly, commentCounts } = props;
  return (
    <>
      <StatDefinitionContextSection
        items={navigation.filteredStatDefinitions}
        searchQuery={navigation.searchQuery}
        count={story.statDefinitions?.length ?? 0}
        open={navigation.openContextSections.stats}
        selectedId={selection.selectedStatDefinitionId}
        referenceCounts={navigation.contextReferenceCounts.stats}
        commentCounts={commentCounts}
        onToggle={() => {
          navigation.toggleContextSection('stats');
        }}
        onAdd={!reviewOnly ? props.entityActions.addStatDefinition : undefined}
        onSelect={(id) => {
          selectContextEntity(props, { type: 'statDefinition', id });
        }}
        onOpenComments={(id) => {
          props.openCommentsForTarget('statDefinition', id);
        }}
      />
      <ItemDefinitionContextSection
        items={navigation.filteredItemDefinitions}
        searchQuery={navigation.searchQuery}
        count={story.itemDefinitions?.length ?? 0}
        open={navigation.openContextSections.items}
        selectedId={selection.selectedItemDefinitionId}
        referenceCounts={navigation.contextReferenceCounts.items}
        commentCounts={commentCounts}
        onToggle={() => {
          navigation.toggleContextSection('items');
        }}
        onAdd={!reviewOnly ? () => void props.entityActions.addItemDefinition() : undefined}
        onSelect={(id) => {
          selectContextEntity(props, { type: 'itemDefinition', id });
        }}
        onOpenComments={(id) => {
          props.openCommentsForTarget('itemDefinition', id);
        }}
      />
    </>
  );
}

function StoryContextEntitySectionsBottom(props: StoryContextPanelProps) {
  const { navigation, selection, story, reviewOnly, commentCounts } = props;
  return (
    <>
      <CharacterContextSection
        items={navigation.filteredCharacters}
        searchQuery={navigation.searchQuery}
        count={story.characters?.length ?? 0}
        open={navigation.openContextSections.characters}
        selectedId={selection.selectedCharacterId}
        referenceCounts={navigation.contextReferenceCounts.characters}
        commentCounts={commentCounts}
        onToggle={() => {
          navigation.toggleContextSection('characters');
        }}
        onAdd={!reviewOnly ? () => void props.entityActions.addCharacter() : undefined}
        onSelect={(id) => {
          selectContextEntity(props, { type: 'character', id });
        }}
        onOpenComments={(id) => {
          props.openCommentsForTarget('character', id);
        }}
      />
      <LocationContextSection
        items={navigation.filteredLocations}
        searchQuery={navigation.searchQuery}
        count={story.locations?.length ?? 0}
        open={navigation.openContextSections.locations}
        selectedId={selection.selectedLocationId}
        referenceCounts={navigation.contextReferenceCounts.locations}
        commentCounts={commentCounts}
        onToggle={() => {
          navigation.toggleContextSection('locations');
        }}
        onAdd={!reviewOnly ? () => void props.entityActions.addLocation() : undefined}
        onSelect={(id) => {
          selectContextEntity(props, { type: 'location', id });
        }}
        onOpenComments={(id) => {
          props.openCommentsForTarget('location', id);
        }}
      />
    </>
  );
}

function selectContextEntity(
  props: Pick<StoryContextPanelProps, 'navigation' | 'selectExclusive' | 'setCommentsOpen'>,
  selection: StoryEditorExclusiveSelection,
) {
  props.navigation.clearSearch();
  props.setCommentsOpen(false);
  props.selectExclusive(selection);
}

function StoryContextGroupsSection(props: StoryContextPanelProps) {
  const { navigation, selection, story, reviewOnly, groupActions, t } = props;
  const selectionIds =
    selection.graphSelection?.interactionIds ??
    (selection.selectedId !== undefined && selection.selectedId.length > 0
      ? [selection.selectedId]
      : []);
  return (
    <StoryGroupsPanel
      key={story.id}
      story={story}
      searchQuery={navigation.searchQuery}
      matchingInteractionIds={navigation.matchingInteractionIds}
      open={navigation.openContextSections.groups}
      onToggle={() => {
        navigation.toggleContextSection('groups');
      }}
      onAdd={() => void groupActions.create(t('editor.groups.newGroup'), [])}
      selectedGroupId={selection.selectedGroupId}
      selectedInteractionId={selection.selectedId}
      editingGroupId={groupActions.editingGroupId}
      onEditingChange={groupActions.setEditingGroupId}
      onCreate={groupActions.create}
      onSelectInteractions={selection.selectGraphInteractions}
      selectionIds={selectionIds}
      readOnly={reviewOnly}
      onSelect={(id) => {
        selectContextEntity(props, { type: 'group', id });
      }}
      onSelectInteraction={props.selectInteraction}
      onFocus={props.focusInteractions}
      onUpdate={groupActions.update}
      onDelete={groupActions.delete}
    />
  );
}

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Background,
  Controls,
  ReactFlow,
  useNodesState,
  type OnConnectEnd,
  type OnConnectStart,
  type Connection,
  type NodeMouseHandler,
  type ReactFlowInstance,
} from '@xyflow/react';
import { Link, useParams } from 'react-router-dom';
import type { Position } from '@paralleax/shared';
import { CharacterInspector } from '../components/CharacterInspector';
import { InteractionInspector } from '../components/InteractionInspector';
import { InteractionNode } from '../components/InteractionNode';
import { ItemDefinitionInspector } from '../components/ItemDefinitionInspector';
import { LocationInspector } from '../components/LocationInspector';
import { StatDefinitionInspector } from '../components/StatDefinitionInspector';
import { TriggerEdge } from '../components/TriggerEdge';
import { TriggerInspector } from '../components/TriggerInspector';
import { TriggerNode } from '../components/TriggerNode';
import { useStoryEditorPersistence } from '../hooks/useStoryEditorPersistence';
import {
  buildInteractionNodes,
  buildTriggerNodes,
  buildTriggerEdges,
  type SelectedTrigger,
  type StoryFlowNode,
  type TriggerFlowEdge,
} from '../storyGraph';
import { findInteraction, findSelectedTrigger } from '../storySelection';
import { getPendingConnection } from '../storyConnection';

const nodeTypes = { interaction: InteractionNode, trigger: TriggerNode };
const edgeTypes = { trigger: TriggerEdge };
const droppedNodeOffset = { x: 105, y: 48 };
const fitViewOptions = { padding: 0.18, maxZoom: 1 };

export function StoryEditor() {
  const { storyId = '' } = useParams();
  const {
    story,
    setStory,
    error,
    saveStatus,
    retry,
    renameStory,
    updateStoryStartDateTime,
    saveTrigger,
    createTriggerVariant,
    deleteTrigger,
    deleteTriggerVariants,
    deleteTriggerInput,
    connectInteractions,
    connectToExistingTrigger,
    createRoot,
    createChild,
    createChildFromInteraction,
    createParentForInteraction,
    patchInteraction,
    deleteInteraction,
    createLocation,
    updateLocation,
    createCharacter,
    updateCharacter,
    createStatDefinition,
    updateStatDefinition,
    createItemDefinition,
    updateItemDefinition,
    createCharacterStat,
    updateCharacterStat,
    deleteCharacterStat,
    createCharacterItem,
    deleteCharacterItem,
  } = useStoryEditorPersistence(storyId);
  const [selectedId, setSelectedId] = useState<string>();
  const [selectedTrigger, setSelectedTrigger] = useState<SelectedTrigger>();
  const [selectedLocationId, setSelectedLocationId] = useState<string>();
  const [selectedCharacterId, setSelectedCharacterId] = useState<string>();
  const [selectedStatDefinitionId, setSelectedStatDefinitionId] = useState<string>();
  const [selectedItemDefinitionId, setSelectedItemDefinitionId] = useState<string>();
  const [isLocationPanelOpen, setIsLocationPanelOpen] = useState(true);
  const [openContextSections, setOpenContextSections] = useState({
    locations: true,
    characters: true,
    stats: true,
    items: true,
  });
  const [isConnecting, setIsConnecting] = useState(false);
  const [pendingConnection, setPendingConnection] = useState<Connection>();
  const [nodes, setNodes, onNodesChange] = useNodesState<StoryFlowNode>([]);
  const pendingConnectionStart = useRef<{
    nodeId: string;
    handleType: 'source' | 'target';
  } | null>(null);
  const flowInstance = useRef<ReactFlowInstance<StoryFlowNode, TriggerFlowEdge> | null>(null);

  const selected = findInteraction(story, selectedId);
  const selectedTriggerTarget = findSelectedTrigger(story, selectedTrigger);
  const selectedLocation = story?.locations?.find(({ id }) => id === selectedLocationId);
  const selectedCharacter = story?.characters?.find(({ id }) => id === selectedCharacterId);
  const selectedStatDefinition = story?.statDefinitions?.find(
    ({ id }) => id === selectedStatDefinitionId,
  );
  const selectedItemDefinition = story?.itemDefinitions?.find(
    ({ id }) => id === selectedItemDefinitionId,
  );
  const hasInspectorSelection = Boolean(
    selected ||
    selectedTriggerTarget ||
    selectedLocation ||
    selectedCharacter ||
    selectedStatDefinition ||
    selectedItemDefinition,
  );

  const closeInspector = useCallback(() => {
    setSelectedId(undefined);
    setSelectedTrigger(undefined);
    setSelectedLocationId(undefined);
    setSelectedCharacterId(undefined);
    setSelectedStatDefinitionId(undefined);
    setSelectedItemDefinitionId(undefined);
  }, []);

  const storyNodes = useMemo(
    () =>
      buildInteractionNodes(story, selectedId, selectedTrigger, {
        showNewTriggerInput: isConnecting,
        onCreateChild: (interactionId) => void createChildFromInteraction(interactionId),
        onCreateParent: (interactionId) => void createParentForInteraction(interactionId),
        onSelectRootTrigger: (interactionId, triggerId) => {
          closeInspector();
          setSelectedTrigger({ interactionId, triggerId });
        },
      }),
    [
      closeInspector,
      createChildFromInteraction,
      createParentForInteraction,
      isConnecting,
      selectedId,
      selectedTrigger,
      story,
    ],
  );
  const triggerNodes = useMemo(
    () =>
      buildTriggerNodes(story, selectedTrigger, {
        onSelectTrigger: (interactionId, triggerId) => {
          closeInspector();
          setSelectedTrigger({ interactionId, triggerId });
        },
      }),
    [closeInspector, selectedTrigger, story],
  );

  useEffect(() => {
    setNodes([...storyNodes, ...triggerNodes]);
  }, [setNodes, storyNodes, triggerNodes]);

  const selectTriggerData = useCallback(
    (trigger: SelectedTrigger) => {
      closeInspector();
      setSelectedTrigger(trigger);
    },
    [closeInspector],
  );
  const deleteSelectedTriggerInput = useCallback(
    async (interactionId: string, triggerId: string, inputInteractionId: string) => {
      await deleteTriggerInput(interactionId, triggerId, inputInteractionId);
      setSelectedTrigger(undefined);
    },
    [deleteTriggerInput],
  );
  const edges = useMemo(
    () =>
      buildTriggerEdges(story, selectTriggerData, (interactionId, triggerId, inputId) => {
        void deleteSelectedTriggerInput(interactionId, triggerId, inputId);
      }),
    [deleteSelectedTriggerInput, selectTriggerData, story],
  );

  const select: NodeMouseHandler = (_, node) => {
    if (node.type !== 'interaction') return;
    closeInspector();
    setSelectedId(node.id);
  };

  const startCanvasConnection: OnConnectStart = (_, params) => {
    if (!params.nodeId || !params.handleType) {
      pendingConnectionStart.current = null;
      setIsConnecting(false);
      return;
    }
    pendingConnectionStart.current = {
      nodeId: params.nodeId,
      handleType: params.handleType,
    };
    setIsConnecting(true);
  };

  const endCanvasConnection: OnConnectEnd = (event, connectionState) => {
    const start = pendingConnectionStart.current;
    pendingConnectionStart.current = null;
    setIsConnecting(false);
    const triggerDropTarget = getTriggerDropTarget(event);
    if (
      start?.handleType === 'source' &&
      triggerDropTarget?.interactionId &&
      triggerDropTarget.triggerId
    ) {
      void connectToExistingTrigger(
        start.nodeId,
        triggerDropTarget.interactionId,
        triggerDropTarget.triggerId,
      );
      return;
    }

    if (!start || connectionState.isValid === true || connectionState.toNode) return;
    const position = getDroppedInteractionPosition(connectionState.pointer, flowInstance.current);

    if (start.handleType === 'source') {
      void createChildFromInteraction(start.nodeId, position);
      return;
    }

    void createParentForInteraction(start.nodeId, position);
  };

  async function deleteSelectedTrigger(interactionId: string, triggerId: string) {
    if (!window.confirm('Delete this trigger?')) return;
    await deleteTrigger(interactionId, triggerId);
    setSelectedTrigger(undefined);
  }

  async function createSelectedTriggerVariant(interactionId: string, triggerId: string) {
    const createdTriggerId = await createTriggerVariant(interactionId, triggerId);
    if (createdTriggerId) {
      setSelectedTrigger({ interactionId, triggerId: createdTriggerId });
    }
  }

  async function deleteSelectedTriggerVariants(interactionId: string, triggerIds: string[]) {
    if (!window.confirm('Delete all condition groups on this route?')) return;
    await deleteTriggerVariants(interactionId, triggerIds);
    setSelectedTrigger(undefined);
  }

  async function createSelectedChild() {
    if (!story || !selected) return;
    await createChild(selected);
  }

  async function remove() {
    if (!selected) return;
    if (!window.confirm(`Delete “${selected.title}” and its trigger links?`)) return;
    await deleteInteraction(selected.id);
    setSelectedId(undefined);
  }

  async function addLocation() {
    const locationId = await createLocation();
    if (!locationId) return;
    closeInspector();
    setSelectedLocationId(locationId);
    setIsLocationPanelOpen(true);
  }

  function updateLocalLocation(nextLocation: NonNullable<typeof selectedLocation>) {
    if (!story) return;
    setStory({
      ...story,
      locations: (story.locations ?? []).map((location) =>
        location.id === nextLocation.id ? nextLocation : location,
      ),
    });
  }

  async function addCharacter() {
    const characterId = await createCharacter();
    if (!characterId) return;
    closeInspector();
    setSelectedCharacterId(characterId);
    setIsLocationPanelOpen(true);
  }

  async function addStatDefinition() {
    const statDefinitionId = await createStatDefinition();
    if (!statDefinitionId) return;
    closeInspector();
    setSelectedStatDefinitionId(statDefinitionId);
    setIsLocationPanelOpen(true);
    setOpenContextSections((sections) => ({ ...sections, stats: true }));
  }

  function updateLocalStatDefinition(nextDefinition: NonNullable<typeof selectedStatDefinition>) {
    setStory({
      ...story!,
      statDefinitions: (story?.statDefinitions ?? []).map((definition) =>
        definition.id === nextDefinition.id ? nextDefinition : definition,
      ),
    });
  }

  async function addItemDefinition() {
    const itemDefinitionId = await createItemDefinition();
    if (!itemDefinitionId) return;
    closeInspector();
    setSelectedItemDefinitionId(itemDefinitionId);
    setIsLocationPanelOpen(true);
    setOpenContextSections((sections) => ({ ...sections, items: true }));
  }

  function updateLocalItemDefinition(nextDefinition: NonNullable<typeof selectedItemDefinition>) {
    setStory({
      ...story!,
      itemDefinitions: (story?.itemDefinitions ?? []).map((definition) =>
        definition.id === nextDefinition.id ? nextDefinition : definition,
      ),
    });
  }

  function toggleContextSection(section: keyof typeof openContextSections) {
    setOpenContextSections((sections) => ({ ...sections, [section]: !sections[section] }));
  }

  function updateLocalCharacter(patch: Partial<NonNullable<typeof selectedCharacter>>) {
    if (!story || !selectedCharacter) return;
    setStory({
      ...story,
      characters: (story.characters ?? []).map((character) =>
        character.id === selectedCharacter.id ? { ...character, ...patch } : character,
      ),
    });
  }

  if (!story) return <main className="page">{error || 'Loading...'}</main>;
  const simulationPath = selected
    ? `/stories/${storyId}/play?mode=simulation&startInteractionId=${encodeURIComponent(
        selected.id,
      )}`
    : `/stories/${storyId}/play?mode=simulation`;
  const pending = pendingConnection ? getPendingConnection(story, pendingConnection) : undefined;
  const existingTriggerChoices =
    pending?.target.triggers.filter(
      (trigger) => !trigger.inputInteractionIds.includes(pending.sourceId),
    ) ?? [];

  function requestConnection(connection: Connection) {
    const candidate = getPendingConnection(story, connection);
    if (!candidate) return;
    const canExtendExisting = candidate.target.triggers.some(
      (trigger) => !trigger.inputInteractionIds.includes(candidate.sourceId),
    );
    if (canExtendExisting) {
      setPendingConnection(connection);
      return;
    }
    void connectInteractions(connection);
  }

  function createPendingTrigger() {
    if (!pendingConnection) return;
    const connection = pendingConnection;
    setPendingConnection(undefined);
    void connectInteractions(connection);
  }

  function extendPendingTrigger(triggerId: string) {
    if (!pending) return;
    setPendingConnection(undefined);
    void connectToExistingTrigger(pending.sourceId, pending.target.id, triggerId);
  }

  return (
    <main className="editor-page">
      <div className="editor-toolbar">
        <input
          className="story-title-input"
          value={story.title}
          onChange={(e) => setStory({ ...story, title: e.target.value })}
          onBlur={(e) => void renameStory(e.target.value)}
        />
        <label className="story-time-field">
          Story starts
          <input
            aria-label="Story start date and time"
            type="datetime-local"
            value={story.startDateTime ?? '2000-01-03T08:00'}
            onChange={(event) => setStory({ ...story, startDateTime: event.target.value })}
            onBlur={(event) => void updateStoryStartDateTime(event.target.value)}
          />
        </label>
        <div className="actions">
          <span className={`save-status ${saveStatus}`} role="status" aria-live="polite">
            {saveStatus === 'saving'
              ? 'Saving…'
              : saveStatus === 'saved'
                ? 'Saved'
                : saveStatus === 'error'
                  ? 'Save failed'
                  : ''}
          </span>
          <button disabled={!selected} onClick={() => void createSelectedChild()}>
            Add child
          </button>
          <Link className="button secondary" to={simulationPath}>
            {selected ? 'Test from current interaction' : 'Test'}
          </Link>
        </div>
      </div>
      {error ? (
        <div className="save-error" role="alert">
          <span>{error}</span>
          <button className="secondary" type="button" onClick={() => void retry()}>
            Reload story
          </button>
        </div>
      ) : null}
      <div
        className={`editor-layout with-navigation ${isLocationPanelOpen ? '' : 'with-navigation-collapsed'} ${
          hasInspectorSelection ? 'with-inspector' : ''
        }`}
      >
        <nav
          className={`location-panel ${isLocationPanelOpen ? '' : 'collapsed'}`}
          aria-label="Story context"
        >
          <button
            className="ghost navigation-toggle"
            type="button"
            aria-label={isLocationPanelOpen ? 'Collapse story context' : 'Expand story context'}
            aria-expanded={isLocationPanelOpen}
            onClick={() => setIsLocationPanelOpen((open) => !open)}
          >
            {isLocationPanelOpen ? '‹' : '›'}
          </button>
          {isLocationPanelOpen ? (
            <div className="location-panel-content">
              <div className="location-panel-header">
                <button
                  className="ghost context-heading"
                  type="button"
                  aria-expanded={openContextSections.locations}
                  onClick={() => toggleContextSection('locations')}
                >
                  <span>{openContextSections.locations ? '▾' : '▸'}</span> Locations
                </button>
                <button aria-label="Add location" type="button" onClick={() => void addLocation()}>
                  Add
                </button>
              </div>
              {!openContextSections.locations ? null : (story.locations?.length ?? 0) === 0 ? (
                <p className="hint">No locations yet.</p>
              ) : (
                <ul>
                  {(story.locations ?? []).map((location) => (
                    <li key={location.id}>
                      <button
                        type="button"
                        className={location.id === selectedLocationId ? 'selected' : 'ghost'}
                        onClick={() => {
                          closeInspector();
                          setSelectedLocationId(location.id);
                        }}
                      >
                        {location.imageUrl ? (
                          <img className="context-picto" src={location.imageUrl} alt="" />
                        ) : null}
                        {location.name}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <div className="location-panel-header context-section">
                <button
                  className="ghost context-heading"
                  type="button"
                  aria-expanded={openContextSections.characters}
                  onClick={() => toggleContextSection('characters')}
                >
                  <span>{openContextSections.characters ? '▾' : '▸'}</span> Characters
                </button>
                <button
                  aria-label="Add character"
                  type="button"
                  onClick={() => void addCharacter()}
                >
                  Add
                </button>
              </div>
              {!openContextSections.characters ? null : (story.characters?.length ?? 0) === 0 ? (
                <p className="hint">No characters yet.</p>
              ) : (
                <ul>
                  {(story.characters ?? []).map((character) => (
                    <li key={character.id}>
                      <button
                        type="button"
                        className={character.id === selectedCharacterId ? 'selected' : 'ghost'}
                        onClick={() => {
                          closeInspector();
                          setSelectedCharacterId(character.id);
                        }}
                      >
                        {character.imageUrl ? (
                          <img className="context-picto" src={character.imageUrl} alt="" />
                        ) : null}
                        {character.name}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <div className="location-panel-header context-section">
                <button
                  className="ghost context-heading"
                  type="button"
                  aria-expanded={openContextSections.stats}
                  onClick={() => toggleContextSection('stats')}
                >
                  <span>{openContextSections.stats ? '▾' : '▸'}</span> Stats
                </button>
                <button
                  aria-label="Add stat definition"
                  type="button"
                  onClick={() => void addStatDefinition()}
                >
                  Add
                </button>
              </div>
              {!openContextSections.stats ? null : (story.statDefinitions?.length ?? 0) === 0 ? (
                <p className="hint">No stats yet.</p>
              ) : (
                <ul>
                  {(story.statDefinitions ?? []).map((definition) => (
                    <li key={definition.id}>
                      <button
                        type="button"
                        className={
                          definition.id === selectedStatDefinitionId ? 'selected' : 'ghost'
                        }
                        onClick={() => {
                          closeInspector();
                          setSelectedStatDefinitionId(definition.id);
                        }}
                      >
                        {definition.imageUrl ? (
                          <img className="context-picto" src={definition.imageUrl} alt="" />
                        ) : null}
                        {definition.name}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <div className="location-panel-header context-section">
                <button
                  className="ghost context-heading"
                  type="button"
                  aria-expanded={openContextSections.items}
                  onClick={() => toggleContextSection('items')}
                >
                  <span>{openContextSections.items ? '▾' : '▸'}</span> Items
                </button>
                <button
                  aria-label="Add item definition"
                  type="button"
                  onClick={() => void addItemDefinition()}
                >
                  Add
                </button>
              </div>
              {!openContextSections.items ? null : (story.itemDefinitions?.length ?? 0) === 0 ? (
                <p className="hint">No items yet.</p>
              ) : (
                <ul>
                  {(story.itemDefinitions ?? []).map((definition) => (
                    <li key={definition.id}>
                      <button
                        type="button"
                        className={
                          definition.id === selectedItemDefinitionId ? 'selected' : 'ghost'
                        }
                        onClick={() => {
                          closeInspector();
                          setSelectedItemDefinitionId(definition.id);
                        }}
                      >
                        {definition.imageUrl ? (
                          <img className="context-picto" src={definition.imageUrl} alt="" />
                        ) : null}
                        {definition.name}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ) : null}
        </nav>
        <section className="canvas">
          <button className="canvas-action" onClick={() => void createRoot()}>
            Add root
          </button>
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            onInit={(instance) => {
              flowInstance.current = instance;
            }}
            onNodesChange={onNodesChange}
            onConnect={requestConnection}
            onConnectStart={startCanvasConnection}
            onConnectEnd={endCanvasConnection}
            onNodeClick={select}
            onPaneClick={closeInspector}
            onNodeDragStop={(_, node) =>
              void patchInteraction(node.id, { position: node.position })
            }
            fitView
            fitViewOptions={fitViewOptions}
          >
            <Background />
            <Controls />
          </ReactFlow>
        </section>
        {hasInspectorSelection ? (
          <aside className="inspector" aria-label="Inspector">
            <div className="inspector-header">
              <button
                className="ghost inspector-close"
                type="button"
                aria-label="Close inspector"
                onClick={closeInspector}
              >
                x
              </button>
            </div>
            {selected ? (
              <InteractionInspector
                story={story}
                interaction={selected}
                onChange={(next) => setStory(next)}
                onPatch={patchInteraction}
                onDelete={remove}
                onSelectInteraction={(interactionId) => {
                  closeInspector();
                  setSelectedId(interactionId);
                }}
              />
            ) : selectedTriggerTarget ? (
              <TriggerInspector
                story={story}
                interaction={selectedTriggerTarget.interaction}
                trigger={selectedTriggerTarget.trigger}
                onSaveTrigger={saveTrigger}
                onCreateTriggerVariant={createSelectedTriggerVariant}
                onDeleteTrigger={deleteSelectedTrigger}
                onDeleteTriggerVariants={deleteSelectedTriggerVariants}
              />
            ) : selectedLocation ? (
              <LocationInspector
                location={selectedLocation}
                onLocalChange={updateLocalLocation}
                onPatch={updateLocation}
              />
            ) : selectedCharacter ? (
              <CharacterInspector
                character={selectedCharacter}
                statDefinitions={story.statDefinitions ?? []}
                itemDefinitions={story.itemDefinitions ?? []}
                onChange={updateLocalCharacter}
                onPatch={updateCharacter}
                onCreateStat={createCharacterStat}
                onPatchStat={updateCharacterStat}
                onDeleteStat={deleteCharacterStat}
                onCreateItem={createCharacterItem}
                onDeleteItem={deleteCharacterItem}
              />
            ) : selectedStatDefinition ? (
              <StatDefinitionInspector
                statDefinition={selectedStatDefinition}
                onChange={updateLocalStatDefinition}
                onPatch={updateStatDefinition}
              />
            ) : selectedItemDefinition ? (
              <ItemDefinitionInspector
                itemDefinition={selectedItemDefinition}
                statDefinitions={story.statDefinitions ?? []}
                onChange={updateLocalItemDefinition}
                onPatch={updateItemDefinition}
              />
            ) : null}
          </aside>
        ) : null}
      </div>
      {pending && existingTriggerChoices.length > 0 ? (
        <div className="connection-dialog-backdrop">
          <section
            className="connection-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="connection-dialog-title"
          >
            <h2 id="connection-dialog-title">Connect interactions</h2>
            <p>Should this route share an existing trigger’s conditions?</p>
            <div className="connection-dialog-actions">
              {existingTriggerChoices.map((trigger, index) => (
                <button
                  className="secondary"
                  type="button"
                  key={trigger.id}
                  onClick={() => extendPendingTrigger(trigger.id)}
                >
                  Add to condition group {index + 1}
                </button>
              ))}
              <button type="button" onClick={createPendingTrigger}>
                Create a new trigger
              </button>
              <button
                className="ghost"
                type="button"
                onClick={() => setPendingConnection(undefined)}
              >
                Cancel
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </main>
  );
}

function getTriggerDropTarget(event: MouseEvent | TouchEvent) {
  const target = event.target instanceof Element ? event.target : null;
  const marker = target?.closest<HTMLElement>('[data-trigger-drop-target="true"]');
  if (!marker) return undefined;
  return {
    interactionId: marker.dataset.interactionId,
    triggerId: marker.dataset.triggerId,
  };
}

function getDroppedInteractionPosition(
  pointer: Position | null,
  flow: ReactFlowInstance<StoryFlowNode, TriggerFlowEdge> | null,
): Position | undefined {
  if (!pointer || !flow) return undefined;
  const flowPosition = flow.screenToFlowPosition(pointer);
  return {
    x: Math.round(flowPosition.x - droppedNodeOffset.x),
    y: Math.round(flowPosition.y - droppedNodeOffset.y),
  };
}

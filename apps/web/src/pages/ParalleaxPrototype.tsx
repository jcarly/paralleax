import { useEffect, useState, type ReactNode } from 'react';
import {
  Background,
  Controls,
  Handle,
  MiniMap,
  Position,
  ReactFlow,
  useEdgesState,
  useNodesState,
  type Connection,
  type NodeProps,
} from '@xyflow/react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  PrototypeAuthPage,
  PrototypeDesignSystem,
  PrototypeStoryList,
} from './ParalleaxPrototypePages';
import { prototypeRoutes, type PrototypeRoute } from './ParalleaxPrototypeRoutes';
import './ParalleaxPrototype.css';

type InspectorKind = 'interaction' | 'trigger' | 'character' | 'location' | 'stat' | 'item';

const icons: Record<string, string> = {
  interaction: '◆',
  trigger: '◇',
  character: '◉',
  location: '⌖',
  stat: '↗',
  item: '▣',
};

const ownedItems = [
  {
    name: 'Leather satchel',
    qty: 1,
    children: [
      { name: 'Old brass key', qty: 1 },
      { name: 'Healing vial', qty: 2, children: [{ name: 'Cork stopper', qty: 2 }] },
    ],
  },
  { name: 'Weathered map', qty: 1 },
];

function ItemTree({ items, depth = 0 }: { items: typeof ownedItems; depth?: number }) {
  return (
    <div className="pp-tree">
      {items.map((item) => (
        <div key={item.name}>
          <button className="pp-tree-row" style={{ paddingLeft: 10 + depth * 18 }}>
            <span>{item.children ? '⌄' : '·'}</span>
            <span className="pp-item-icon">▣</span>
            <span>{item.name}</span>
            <small>×{item.qty}</small>
            <span className="pp-grip">⠿</span>
          </button>
          {item.children && (
            <ItemTree items={item.children as typeof ownedItems} depth={depth + 1} />
          )}
        </div>
      ))}
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="pp-field">
      <span>{label}</span>
      {children}
    </label>
  );
}

type ConditionKind =
  'character-stat' | 'item-stat' | 'has-item' | 'location' | 'visited' | 'story-time';
const conditionLabels: Record<ConditionKind, string> = {
  'character-stat': 'Character stat',
  'item-stat': 'Item stat',
  'has-item': 'Has item',
  location: 'Current location',
  visited: 'Interaction visited',
  'story-time': 'Story time',
};

function TriggerConditionRow({
  initialKind = 'character-stat',
  onRemove,
}: {
  initialKind?: ConditionKind;
  onRemove: () => void;
}) {
  const [conditionKind, setConditionKind] = useState<ConditionKind>(initialKind);
  return (
    <div className="pp-dynamic-condition">
      <div className="pp-condition-type">
        <select
          value={conditionKind}
          onChange={(event) => setConditionKind(event.target.value as ConditionKind)}
        >
          {Object.entries(conditionLabels).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        <button aria-label="Remove condition" onClick={onRemove}>
          ×
        </button>
      </div>
      {conditionKind === 'character-stat' && (
        <div className="pp-condition-fields four">
          <input list="condition-characters" defaultValue="Mara Venn" />
          <datalist id="condition-characters">
            <option value="Mara Venn" />
            <option value="Ivo Hale" />
            <option value="The Keeper" />
          </datalist>
          <select>
            <option>Trust</option>
            <option>Health</option>
            <option>Insight</option>
          </select>
          <select>
            <option>≥</option>
            <option>≤</option>
            <option>=</option>
            <option>≠</option>
          </select>
          <input type="number" defaultValue="4" />
        </div>
      )}
      {conditionKind === 'item-stat' && (
        <div className="pp-condition-fields four">
          <input list="condition-items" defaultValue="Mara Venn › Leather satchel" />
          <datalist id="condition-items">
            <option value="Mara Venn › Leather satchel" />
            <option value="Mara Venn › Healing vial" />
            <option value="Ivo Hale › Weathered map" />
          </datalist>
          <select>
            <option>Durability</option>
            <option>Charge</option>
          </select>
          <select>
            <option>≥</option>
            <option>≤</option>
            <option>=</option>
          </select>
          <input type="number" defaultValue="1" />
        </div>
      )}
      {conditionKind === 'has-item' && (
        <div className="pp-condition-fields three">
          <select>
            <option>Mara Venn</option>
            <option>Ivo Hale</option>
            <option>The Keeper</option>
          </select>
          <select>
            <option>Old brass key</option>
            <option>Healing vial</option>
            <option>Weathered map</option>
          </select>
          <select>
            <option>Has item</option>
            <option>Does not have</option>
          </select>
        </div>
      )}
      {conditionKind === 'location' && (
        <div className="pp-condition-fields two">
          <select>
            <option>Is</option>
            <option>Is not</option>
          </select>
          <select>
            <option>The Glasshouse</option>
            <option>Old quarter</option>
            <option>Lower archive</option>
            <option>Market square</option>
          </select>
        </div>
      )}
      {conditionKind === 'visited' && (
        <div className="pp-condition-fields two">
          <select>
            <option>Has visited</option>
            <option>Has not visited</option>
          </select>
          <select>
            <option>A room full of echoes</option>
            <option>The hidden passage</option>
            <option>A quiet warning</option>
          </select>
        </div>
      )}
      {conditionKind === 'story-time' && (
        <div className="pp-condition-fields three">
          <select>
            <option>Time is after</option>
            <option>Time is before</option>
            <option>Date is</option>
            <option>Weekday is</option>
          </select>
          <input type="time" defaultValue="23:30" />
          <select>
            <option>Story timezone</option>
            <option>UTC</option>
          </select>
        </div>
      )}
    </div>
  );
}

function TriggerConditionGroup({
  title,
  initialConditions = ['character-stat', 'location'],
  onRemove,
}: {
  title: string;
  initialConditions?: ConditionKind[];
  onRemove?: () => void;
}) {
  const [conditions, setConditions] = useState<{ id: number; kind: ConditionKind }[]>([
    ...initialConditions.map((kind, index) => ({ id: index + 1, kind })),
  ]);
  return (
    <div className="pp-condition-group">
      <div className="pp-condition-group-title">
        <b>{title}</b>
        {onRemove && <button onClick={onRemove}>Delete group</button>}
      </div>
      <div className="pp-condition-head fixed">
        <span>All conditions must match</span>
        <b>AND</b>
      </div>
      {conditions.map((condition) => (
        <TriggerConditionRow
          key={condition.id}
          initialKind={condition.kind}
          onRemove={() =>
            setConditions((current) => current.filter(({ id }) => id !== condition.id))
          }
        />
      ))}
      <button
        className="pp-inline-add"
        onClick={() =>
          setConditions((current) => [...current, { id: Date.now(), kind: 'character-stat' }])
        }
      >
        ＋ Add condition
      </button>
    </div>
  );
}

type EffectKind = 'stat' | 'item';
function EffectList({ kind, initialCount = 1 }: { kind: EffectKind; initialCount?: number }) {
  const [effects, setEffects] = useState(() =>
    Array.from({ length: initialCount }, (_, index) => ({ id: index + 1 })),
  );
  const move = (index: number, direction: -1 | 1) =>
    setEffects((current) => {
      const next = [...current];
      const target = index + direction;
      if (target < 0 || target >= next.length) return current;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  return (
    <>
      {effects.map((effect, index) => (
        <div className="pp-effect pp-unified-effect" key={effect.id}>
          <div className="pp-effect-toolbar">
            <b>
              {kind === 'stat' ? 'Stat change' : 'Inventory change'} {index + 1}
            </b>
            <span>
              <button
                disabled={index === 0}
                onClick={() => move(index, -1)}
                aria-label="Move effect up"
              >
                ↑
              </button>
              <button
                disabled={index === effects.length - 1}
                onClick={() => move(index, 1)}
                aria-label="Move effect down"
              >
                ↓
              </button>
              <button
                onClick={() =>
                  setEffects((current) => current.filter(({ id }) => id !== effect.id))
                }
                aria-label="Remove effect"
              >
                ×
              </button>
            </span>
          </div>
          <Field label="Target">
            <input
              list="effect-targets"
              defaultValue={
                kind === 'item' && index === 1 ? 'Mara Venn › Leather satchel' : 'Mara Venn'
              }
            />
            <datalist id="effect-targets">
              <option value="Mara Venn" />
              <option value="Ivo Hale" />
              <option value="The Keeper" />
              <option value="Mara Venn › Leather satchel" />
              <option value="Mara Venn › Healing vial" />
            </datalist>
          </Field>
          {kind === 'stat' ? (
            <>
              <Field label="Stat">
                <select>
                  <option>Trust</option>
                  <option>Health</option>
                  <option>Insight</option>
                  <option>Charge</option>
                  <option>Durability</option>
                </select>
              </Field>
              <div className="pp-split">
                <Field label="Operation">
                  <select>
                    <option>Increase by</option>
                    <option>Decrease by</option>
                    <option>Set to</option>
                  </select>
                </Field>
                <Field label="Value">
                  <input type="number" defaultValue="2" />
                </Field>
              </div>
            </>
          ) : (
            <>
              <Field label="Item">
                <select defaultValue={index === 1 ? 'vial' : 'key'}>
                  <option value="key">Old brass key</option>
                  <option value="vial">Healing vial</option>
                  <option value="map">Weathered map</option>
                  <option value="satchel">Leather satchel</option>
                </select>
              </Field>
              <div className="pp-split">
                <Field label="Operation">
                  <select defaultValue={index === 1 ? 'lose' : 'obtain'}>
                    <option value="obtain">Obtain</option>
                    <option value="lose">Lose</option>
                    <option value="move">Move into target</option>
                  </select>
                </Field>
                <Field label="Quantity">
                  <input type="number" min="1" defaultValue="1" />
                </Field>
              </div>
            </>
          )}
        </div>
      ))}
      <button
        className="pp-inline-add"
        onClick={() => setEffects((current) => [...current, { id: Date.now() }])}
      >
        ＋ Add {kind} effect
      </button>
      {effects.length === 0 && <div className="pp-empty-effect">No {kind} effects yet.</div>}
    </>
  );
}

const prototypeEntities = {
  'character-mara': {
    name: 'Mara Venn',
    subtitle: 'Playable character',
    initials: 'MV',
    description: 'An archivist following a trail of erased memories.',
  },
  'character-ivo': {
    name: 'Ivo Hale',
    subtitle: 'Ally',
    initials: 'IH',
    description: 'A cautious guide who knows more about the old quarter than he admits.',
  },
  'character-keeper': {
    name: 'The Keeper',
    subtitle: 'Unknown',
    initials: 'K',
    description: 'A presence heard in the archive, but never clearly seen.',
  },
  'location-glasshouse': {
    name: 'The Glasshouse',
    description: 'An abandoned winter garden overlooking the old quarter.',
  },
  'location-quarter': {
    name: 'Old quarter',
    description: 'A maze of rain-dark streets, shuttered shops and forgotten passages.',
  },
  'location-archive': {
    name: 'Lower archive',
    description: 'A sealed collection beneath the city, untouched for decades.',
  },
  'location-market': {
    name: 'Market square',
    description: 'The busiest crossing in the district during daylight hours.',
  },
  'stat-trust': { name: 'Trust', defaultValue: 3, maximum: 10 },
  'stat-health': { name: 'Health', defaultValue: 8, maximum: 10 },
  'stat-insight': { name: 'Insight', defaultValue: 4, maximum: 20 },
  'stat-charge': { name: 'Charge', defaultValue: 1, maximum: 5 },
  'item-satchel': {
    name: 'Leather satchel',
    description: 'A durable bag with several hidden pockets.',
  },
  'item-key': {
    name: 'Old brass key',
    description: 'A tarnished key marked with the archive seal.',
  },
  'item-vial': {
    name: 'Healing vial',
    description: 'A small glass vial containing a restorative mixture.',
  },
  'item-map': {
    name: 'Weathered map',
    description: 'A hand-drawn plan of passages below the old quarter.',
  },
} as const;

function Inspector({
  kind,
  entityId,
  onClose,
}: {
  kind: InspectorKind;
  entityId?: string;
  onClose: () => void;
}) {
  const entity = entityId
    ? prototypeEntities[entityId as keyof typeof prototypeEntities]
    : undefined;
  const statEntity = entity && 'defaultValue' in entity ? entity : undefined;
  const [statDefault, setStatDefault] = useState<number>(statEntity?.defaultValue ?? 3);
  const [durationMode, setDurationMode] = useState<'delay' | 'fixed'>('delay');
  const [triggerGroups, setTriggerGroups] = useState<number[]>([1, 2]);
  const names: Record<InspectorKind, string> = {
    interaction: 'The hidden passage',
    trigger: 'Trust is earned',
    character: 'Mara Venn',
    location: 'The Glasshouse',
    stat: 'Trust',
    item: 'Leather satchel',
  };
  return (
    <aside className="pp-inspector">
      <div className="pp-inspector-head">
        <div>
          <small>
            {icons[kind]} {kind}
          </small>
          <h2>{entity?.name ?? names[kind]}</h2>
        </div>
        <button onClick={onClose}>×</button>
      </div>
      {kind === 'interaction' && (
        <>
          <Field label="Card title">
            <input defaultValue="The hidden passage" />
          </Field>
          <Field label="Story text">
            <textarea
              rows={7}
              defaultValue="Mara runs her fingers along the cracked tiles. One of them gives way, revealing a narrow passage into the dark."
            />
          </Field>
          <div className="pp-media">
            <div className="pp-photo pp-passage" />
            <div>
              <b>passage.jpg</b>
              <small>1600 × 900 · 1.2 MB</small>
              <button>Replace image</button>
            </div>
          </div>
          <Field label="Location">
            <select defaultValue="glass">
              <option value="glass">The Glasshouse</option>
              <option>Market square</option>
            </select>
          </Field>
          <div className="pp-timing-block">
            <div className="pp-section-title">
              <b>Interaction duration</b>
            </div>
            <Field label="Advance story time">
              <select
                value={durationMode}
                onChange={(event) => setDurationMode(event.target.value as 'delay' | 'fixed')}
              >
                <option value="delay">By a duration</option>
                <option value="fixed">To a fixed date and time</option>
              </select>
            </Field>
            {durationMode === 'delay' ? (
              <div className="pp-split">
                <Field label="Duration">
                  <input type="number" min="0" defaultValue="15" />
                </Field>
                <Field label="Unit">
                  <select>
                    <option>Minutes</option>
                    <option>Hours</option>
                    <option>Days</option>
                  </select>
                </Field>
              </div>
            ) : (
              <Field label="Advance to">
                <input type="datetime-local" defaultValue="2026-10-14T23:40" />
              </Field>
            )}
          </div>
          <details className="pp-accordion" open>
            <summary>
              <span>◉ Characters present</span>
              <b>2</b>
            </summary>
            <div className="pp-chip-list">
              <button>
                <span className="pp-thumb pp-mara">MV</span>Mara Venn ×
              </button>
              <button>
                <span className="pp-thumb pp-ivo">IH</span>Ivo Hale ×
              </button>
              <button className="pp-add-chip">＋ Add character</button>
            </div>
          </details>
          <details className="pp-accordion" open>
            <summary>
              <span>↗ Stat effects</span>
              <b>1</b>
            </summary>
            <EffectList kind="stat" />
          </details>
          <details className="pp-accordion" open>
            <summary>
              <span>▣ Item effects</span>
              <b>2</b>
            </summary>
            <EffectList kind="item" initialCount={2} />
          </details>
          <div className="pp-section-title">
            <b>Options</b>
            <button>＋ Add option</button>
          </div>
          <div className="pp-option-row">
            <span>Open the hidden door</span>
            <small>→ Trust is earned</small>
          </div>
          <div className="pp-option-row">
            <span>Return upstairs</span>
            <small>→ A quiet warning</small>
          </div>
        </>
      )}
      {kind === 'trigger' && (
        <>
          <p className="pp-hint">
            This marker groups alternative routes between the same source and destination. Each
            condition group is a distinct trigger. Conditions inside one group are combined with
            AND; matching any group makes the route available.
          </p>
          <div className="pp-route-summary">
            <span>From</span>
            <b>The hidden passage</b>
            <span>To</span>
            <b>Enter the passage</b>
          </div>
          <div className="pp-section-title">
            <b>Alternative condition groups</b>
            <button onClick={() => setTriggerGroups((current) => [...current, Date.now()])}>
              ＋ Add OR group
            </button>
          </div>
          <div className="pp-or-stack">
            {triggerGroups.map((groupId, index) => (
              <div key={groupId}>
                {index > 0 && (
                  <div className="pp-or-separator">
                    <span>OR</span>
                  </div>
                )}
                <TriggerConditionGroup
                  title={`Condition group ${index + 1}`}
                  initialConditions={
                    index === 0
                      ? ['character-stat', 'location']
                      : index === 1
                        ? ['visited']
                        : ['character-stat']
                  }
                  onRemove={
                    triggerGroups.length > 1
                      ? () => setTriggerGroups((current) => current.filter((id) => id !== groupId))
                      : undefined
                  }
                />
              </div>
            ))}
          </div>
          <div className="pp-trigger-summary">
            <span>Destination</span>
            <b>Enter the passage</b>
            <small>Effects and duration are configured on that interaction.</small>
          </div>
        </>
      )}
      {kind === 'character' && (
        <>
          <div className="pp-profile">
            <div className="pp-avatar">
              {entity && 'initials' in entity ? entity.initials : 'MV'}
            </div>
            <div>
              <b>{entity?.name ?? 'Mara Venn'}</b>
              <small>
                {entity && 'subtitle' in entity ? entity.subtitle : 'Playable character'}
              </small>
              <button>Change portrait</button>
            </div>
          </div>
          <Field label="Name">
            <input defaultValue={entity?.name ?? 'Mara Venn'} />
          </Field>
          <Field label="Description">
            <textarea
              rows={4}
              defaultValue={entity && 'description' in entity ? entity.description : ''}
            />
          </Field>
          <div className="pp-section-title">
            <b>Stats</b>
            <button>＋ Add</button>
          </div>
          <div className="pp-stat-row">
            <span>Trust</span>
            <b>3</b>
            <span>/ 10</span>
          </div>
          <div className="pp-stat-row">
            <span>Health</span>
            <b>8</b>
            <span>/ 10</span>
          </div>
          <div className="pp-section-title">
            <b>Inventory</b>
            <button>＋ Add item</button>
          </div>
          <ItemTree items={ownedItems} />
        </>
      )}
      {kind === 'location' && (
        <>
          <div className="pp-media pp-large">
            <div className="pp-photo pp-glass" />
            <div>
              <b>glasshouse.jpg</b>
              <small>Image preview</small>
              <button>Replace</button>
            </div>
          </div>
          <Field label="Name">
            <input defaultValue={entity?.name ?? 'The Glasshouse'} />
          </Field>
          <Field label="Description">
            <textarea
              rows={5}
              defaultValue={entity && 'description' in entity ? entity.description : ''}
            />
          </Field>
          <div className="pp-callout">
            Locations can own item instances and nested item trees, such as household supplies or
            furniture.
          </div>
          <div className="pp-section-title">
            <b>Used in 3 interactions</b>
            <button>Show on graph</button>
          </div>
        </>
      )}
      {kind === 'stat' && (
        <>
          <Field label="Name">
            <input defaultValue={entity?.name ?? 'Trust'} />
          </Field>
          <Field label="Applies to">
            <select>
              <option>Characters and item instances</option>
            </select>
          </Field>
          <div className="pp-split">
            <Field label="Minimum">
              <input type="number" defaultValue="0" />
            </Field>
            <Field label="Maximum">
              <input type="number" defaultValue={statEntity?.maximum ?? 10} />
            </Field>
          </div>
          <Field label="Default value">
            <div className="pp-range-number">
              <input
                type="range"
                min="0"
                max={statEntity?.maximum ?? 10}
                value={statDefault}
                onChange={(event) => setStatDefault(Number(event.target.value))}
              />
              <input
                type="number"
                min="0"
                max={statEntity?.maximum ?? 10}
                value={statDefault}
                onChange={(event) =>
                  setStatDefault(
                    Math.min(statEntity?.maximum ?? 10, Math.max(0, Number(event.target.value))),
                  )
                }
              />
            </div>
          </Field>
        </>
      )}
      {kind === 'item' && (
        <>
          <div className="pp-media">
            <div className="pp-photo pp-satchel" />
            <div>
              <b>{entity?.name ?? 'Leather satchel'}</b>
              <small>Image preview</small>
              <button>Replace</button>
            </div>
          </div>
          <Field label="Definition name">
            <input defaultValue={entity?.name ?? 'Leather satchel'} />
          </Field>
          <Field label="Description">
            <textarea
              rows={4}
              defaultValue={entity && 'description' in entity ? entity.description : ''}
            />
          </Field>
          <div className="pp-section-title">
            <b>Contained items</b>
            <button>＋ Add item</button>
          </div>
          <ItemTree
            items={entityId === 'item-satchel' ? (ownedItems[0].children as typeof ownedItems) : []}
          />
          <div className="pp-section-title">
            <b>Instance stats</b>
            <button>＋ Add stat</button>
          </div>
          <div className="pp-stat-row">
            <span>Durability</span>
            <b>7</b>
            <span>/ 10</span>
          </div>
        </>
      )}
    </aside>
  );
}

type GraphData = {
  title: string;
  text?: string;
  location?: string;
  people?: string[];
  start?: boolean;
};

function GraphInteractionNode({ data }: NodeProps) {
  const value = data as GraphData;
  return (
    <div className="pp-flow-card">
      <Handle type="target" position={Position.Top} />
      {value.start && <small>● START</small>}
      <b>{value.title}</b>
      {value.text && <p>{value.text}</p>}
      <div className="pp-node-context">
        <span>⌖ {value.location}</span>
        <span className="pp-node-people">
          {value.people?.map((person) => (
            <em key={person}>{person}</em>
          ))}
        </span>
      </div>
      <Handle type="source" position={Position.Bottom} />
    </div>
  );
}

function GraphTriggerNode({ data }: NodeProps) {
  const value = data as GraphData;
  return (
    <div className="pp-flow-trigger" title={value.title} aria-label={value.title}>
      <Handle type="target" position={Position.Top} />
      <Handle type="source" position={Position.Bottom} />
    </div>
  );
}

const graphNodeTypes = { interaction: GraphInteractionNode, trigger: GraphTriggerNode };
const initialGraphNodes = [
  {
    id: 'i1',
    type: 'interaction',
    position: { x: 390, y: 25 },
    data: {
      title: 'A room full of echoes',
      text: 'The rain taps against a thousand broken panes…',
      location: 'The Glasshouse',
      people: ['MV', 'IH'],
      start: true,
    },
  },
  { id: 't1', type: 'trigger', position: { x: 472, y: 180 }, data: { title: 'Trust is earned' } },
  {
    id: 'i2',
    type: 'interaction',
    position: { x: 390, y: 250 },
    data: {
      title: 'The hidden passage',
      text: 'A loose tile reveals a stairway beneath the garden.',
      location: 'The Glasshouse',
      people: ['MV'],
    },
  },
  { id: 't2', type: 'trigger', position: { x: 165, y: 420 }, data: { title: 'Return upstairs' } },
  {
    id: 't3',
    type: 'trigger',
    position: { x: 472, y: 420 },
    data: { title: 'Open the hidden door' },
  },
  { id: 't4', type: 'trigger', position: { x: 775, y: 420 }, data: { title: 'Call out to Ivo' } },
  {
    id: 'i3',
    type: 'interaction',
    position: { x: 80, y: 510 },
    data: {
      title: 'A quiet warning',
      text: 'Ivo catches Mara before she crosses the threshold.',
      location: 'Old quarter',
      people: ['MV', 'IH'],
    },
  },
  {
    id: 'i4',
    type: 'interaction',
    position: { x: 390, y: 510 },
    data: {
      title: 'Enter the passage',
      text: 'The old mechanism turns with a low metallic sigh.',
      location: 'Lower archive',
      people: ['MV'],
    },
  },
  {
    id: 'i5',
    type: 'interaction',
    position: { x: 690, y: 510 },
    data: {
      title: 'A voice in the dark',
      text: 'Only the echo answers from below.',
      location: 'Lower archive',
      people: ['MV', 'K'],
    },
  },
];
const initialGraphEdges = [
  { id: 'e1', source: 'i1', target: 't1', selectable: false, type: 'smoothstep' },
  { id: 'e2', source: 't1', target: 'i2', selectable: false, type: 'smoothstep' },
  { id: 'e3', source: 'i2', target: 't2', selectable: false, type: 'smoothstep' },
  { id: 'e4', source: 't2', target: 'i3', selectable: false, type: 'smoothstep' },
  { id: 'e5', source: 'i2', target: 't3', selectable: false, type: 'smoothstep' },
  { id: 'e6', source: 't3', target: 'i4', selectable: false, type: 'smoothstep' },
  { id: 'e7', source: 'i2', target: 't4', selectable: false, type: 'smoothstep' },
  { id: 'e8', source: 't4', target: 'i5', selectable: false, type: 'smoothstep' },
];

function StoryGraph({ select }: { select: (kind: InspectorKind) => void }) {
  const [nodes, setNodes, onNodesChange] = useNodesState(initialGraphNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialGraphEdges);
  const addInteraction = () =>
    setNodes((current) => [
      ...current,
      {
        id: `i${Date.now()}`,
        type: 'interaction',
        position: { x: 420, y: 650 },
        data: {
          title: 'New interaction',
          text: 'Add story text…',
          location: 'The Glasshouse',
          people: ['MV'],
        },
      },
    ]);
  const connect = (connection: Connection) => {
    const source = nodes.find((node) => node.id === connection.source);
    const target = nodes.find((node) => node.id === connection.target);
    if (!source || !target || source.type !== 'interaction' || target.type !== 'interaction')
      return;
    const id = `t${Date.now()}`;
    setNodes((current) => [
      ...current,
      {
        id,
        type: 'trigger',
        position: {
          x: (source.position.x + target.position.x) / 2 + 82,
          y: (source.position.y + target.position.y) / 2 + 45,
        },
        data: { title: 'New trigger' },
      },
    ]);
    setEdges((current) => [
      ...current,
      { id: `${id}-in`, source: source.id, target: id, selectable: false, type: 'smoothstep' },
      { id: `${id}-out`, source: id, target: target.id, selectable: false, type: 'smoothstep' },
    ]);
  };
  return (
    <div className="pp-canvas">
      <div className="pp-graph-actions">
        <button onClick={addInteraction}>＋ Interaction</button>
        <span>Drag cards · connect handles · scroll to zoom</span>
      </div>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={graphNodeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={connect}
        onNodeClick={(_, node) => select(node.type === 'trigger' ? 'trigger' : 'interaction')}
        fitView
        minZoom={0.35}
        maxZoom={1.6}
        edgesFocusable={false}
      >
        <Background gap={20} size={1} />
        <Controls position="bottom-left" />
        <MiniMap position="bottom-right" pannable zoomable />
      </ReactFlow>
    </div>
  );
}

function Player({ onExit }: { onExit: () => void }) {
  const [forced, setForced] = useState(false);
  const [scene, setScene] = useState<'hidden' | 'passage' | 'warning' | 'archive' | 'ending'>(
    'hidden',
  );
  const [trust, setTrust] = useState(3);
  const [insight, setInsight] = useState(4);
  const [hasKey, setHasKey] = useState(false);
  const [keyCharge, setKeyCharge] = useState(2);
  const [storyTime, setStoryTime] = useState('23:40');
  const [history, setHistory] = useState(['23:40 · Simulation started']);
  const record = (entry: string) => setHistory((current) => [entry, ...current]);
  const restart = () => {
    setScene('hidden');
    setTrust(3);
    setInsight(4);
    setHasKey(false);
    setKeyCharge(2);
    setStoryTime('23:40');
    setForced(false);
    setHistory(['23:40 · Simulation restarted']);
  };
  const openDoor = () => {
    setScene('passage');
    setTrust((value) => value + 2);
    setHasKey(true);
    setStoryTime('23:55');
    record(
      `23:55 · Door opened${forced && trust < 4 ? ' (forced)' : ''} · Trust +2 · Key obtained`,
    );
  };
  return (
    <div className="pp-player">
      <header className="pp-player-top">
        <b>Paralleax Preview</b>
        <span>The Archive Below</span>
        <button onClick={restart}>↻ Restart</button>
        <button onClick={onExit}>Exit simulation</button>
      </header>
      <aside className="pp-player-stats">
        <div className="pp-avatar big">MV</div>
        <h2>Mara Venn</h2>
        <p>Archivist</p>
        <h3>Stats</h3>
        <div>
          <span>Trust</span>
          <b>{trust} / 10</b>
          <i style={{ width: `${trust * 10}%` }} />
        </div>
        <div>
          <span>Health</span>
          <b>8 / 10</b>
          <i style={{ width: '80%' }} />
        </div>
        <div>
          <span>Insight</span>
          <b>{insight} / 20</b>
          <i style={{ width: `${insight * 5}%` }} />
        </div>
        <h3>Inventory</h3>
        <ItemTree items={ownedItems} />
        {hasKey && (
          <div className="pp-gained-item">
            <span>▣ Old brass key</span>
            <b>Charge {keyCharge}/2</b>
          </div>
        )}
        <h3>Simulation log</h3>
        <ol className="pp-simulation-log">
          {history.map((entry, index) => (
            <li key={`${entry}-${index}`}>{entry}</li>
          ))}
        </ol>
      </aside>
      <main className="pp-scene">
        <div className={`pp-scene-image ${scene === 'warning' ? 'pp-glass' : 'pp-passage'}`} />
        <small>
          {scene === 'hidden' || scene === 'warning' ? 'THE GLASSHOUSE' : 'LOWER ARCHIVE'} ·{' '}
          {storyTime}
        </small>
        <h1>
          {scene === 'hidden'
            ? 'The hidden passage'
            : scene === 'passage'
              ? 'Enter the passage'
              : scene === 'warning'
                ? 'A quiet warning'
                : scene === 'archive'
                  ? 'The sealed catalogue'
                  : 'A name in the ledger'}
        </h1>
        <p>
          {scene === 'hidden'
            ? 'Mara runs her fingers along the cracked tiles. One of them gives way, revealing a narrow passage into the dark.'
            : scene === 'passage'
              ? 'The old mechanism turns with a low metallic sigh. A brass key waits on the first step, as if someone expected her.'
              : scene === 'warning'
                ? 'Ivo catches Mara before she crosses the threshold. “Not every locked door is asking to be opened.”'
                : scene === 'archive'
                  ? 'The key vibrates near a sealed catalogue. Its engraved lines flare once, then begin to fade.'
                  : 'The catalogue opens at midnight’s final entry. Mara recognizes a name that should not be there: her own.'}
        </p>
        {scene === 'hidden' && (
          <div className="pp-choices">
            <button
              onClick={() => {
                setScene('warning');
                setStoryTime('23:50');
                record('23:50 · Fallback selected · Time +10 min');
              }}
            >
              Return upstairs <span>→</span>
            </button>
            <button
              className={trust >= 4 ? '' : forced ? 'forced' : 'unavailable'}
              disabled={trust < 4 && !forced}
              onClick={openDoor}
            >
              Open the hidden door{' '}
              <small>
                {trust >= 4
                  ? 'Trust condition satisfied'
                  : `Requires Trust ≥ 4${forced ? ' · Forced' : ''}`}
              </small>
              <span>→</span>
            </button>
          </div>
        )}
        {scene === 'warning' && (
          <div className="pp-choices">
            <button
              onClick={() => {
                setTrust((value) => value + 1);
                setScene('hidden');
                setStoryTime('00:00');
                record('00:00 · Listened to Ivo · Trust +1 · Door option unlocked');
              }}
            >
              Listen to Ivo, then return <small>Trust +1</small>
              <span>→</span>
            </button>
            <button
              onClick={() => {
                setScene('hidden');
                setStoryTime('23:55');
                record('23:55 · Warning ignored · No effects');
              }}
            >
              Ignore the warning <span>→</span>
            </button>
          </div>
        )}
        {scene === 'passage' && (
          <div className="pp-choices">
            <button
              onClick={() => {
                setScene('archive');
                setKeyCharge(1);
                setStoryTime('00:10');
                record('00:10 · Key used · Charge −1 · Time +15 min');
              }}
            >
              Use the key on the sealed catalogue <small>Old brass key Charge −1</small>
              <span>→</span>
            </button>
          </div>
        )}
        {scene === 'archive' && (
          <div className="pp-choices">
            <button
              onClick={() => {
                setScene('ending');
                setInsight((value) => value + 2);
                setStoryTime('00:30');
                record('00:30 · Fixed story time applied · Insight +2');
              }}
            >
              Read the final entry <small>Advance to 00:30 · Insight +2</small>
              <span>→</span>
            </button>
          </div>
        )}
        {scene === 'ending' && (
          <div className="pp-outcome">
            <b>Prototype path complete</b>
            <span>Relative duration, fixed time, stat and item-instance effects were applied.</span>
            <button onClick={restart}>Return to start</button>
          </div>
        )}
        {scene === 'hidden' && (
          <label className="pp-force">
            <input
              type="checkbox"
              checked={forced}
              onChange={(event) => setForced(event.target.checked)}
            />{' '}
            Force unavailable options <small>Simulation only</small>
          </label>
        )}
      </main>
    </div>
  );
}

function PrototypeStoryEditor({ onNavigate }: { onNavigate: (route: PrototypeRoute) => void }) {
  const [collapsed, setCollapsed] = useState(
    () => localStorage.getItem('paralleax-prototype-sidebar') === 'collapsed',
  );
  const [selected, setSelected] = useState<InspectorKind | null>('interaction');
  const [selectedEntityId, setSelectedEntityId] = useState<string>();
  const [playing, setPlaying] = useState(false);
  const openEntity = (kind: InspectorKind, id?: string) => {
    setSelected(kind);
    setSelectedEntityId(id);
  };
  useEffect(
    () => localStorage.setItem('paralleax-prototype-sidebar', collapsed ? 'collapsed' : 'open'),
    [collapsed],
  );
  if (playing) return <Player onExit={() => setPlaying(false)} />;
  return (
    <div className={`pp-shell ${collapsed ? 'is-collapsed' : ''}`}>
      <header className="pp-topbar">
        <button
          className="pp-editor-brand"
          type="button"
          onClick={() => onNavigate(prototypeRoutes.stories)}
        >
          <span className="pp-logo">P</span>
          <b>Paralleax</b>
        </button>
        <span>/</span>
        <strong>The Archive Below</strong>
        <nav>
          <button className="active">Story</button>
          <button>Graph</button>
        </nav>
        <div className="pp-spacer" />
        <span className="pp-saved">● Saved</span>
        <button type="button" onClick={() => onNavigate(prototypeRoutes.designSystem)}>
          Design system
        </button>
        <button>Share</button>
        <button className="pp-play" onClick={() => setPlaying(true)}>
          ▶ Simulate
        </button>
      </header>
      <aside className="pp-sidebar">
        <button
          className="pp-collapse"
          onClick={() => setCollapsed(!collapsed)}
          title="Toggle sidebar"
        >
          {collapsed ? '›' : '‹'}
        </button>
        <div className="pp-side-content">
          <div className="pp-search">
            ⌕ <input placeholder="Search story…" />
            <kbd>⌘K</kbd>
          </div>
          <div className="pp-context-lists">
            <details className="pp-side-group" open>
              <summary>
                <span>Characters</span>
                <b>3</b>
              </summary>
              <button
                className={
                  selectedEntityId === 'character-mara'
                    ? 'selected pp-context-row'
                    : 'pp-context-row'
                }
                onClick={() => openEntity('character', 'character-mara')}
              >
                <span className="pp-thumb pp-mara">MV</span>
                <span>
                  Mara Venn<small>Playable character</small>
                </span>
                <i>›</i>
              </button>
              <button
                className={
                  selectedEntityId === 'character-ivo'
                    ? 'selected pp-context-row'
                    : 'pp-context-row'
                }
                onClick={() => openEntity('character', 'character-ivo')}
              >
                <span className="pp-thumb pp-ivo">IH</span>
                <span>
                  Ivo Hale<small>Ally</small>
                </span>
                <i>›</i>
              </button>
              <button
                className={
                  selectedEntityId === 'character-keeper'
                    ? 'selected pp-context-row'
                    : 'pp-context-row'
                }
                onClick={() => openEntity('character', 'character-keeper')}
              >
                <span className="pp-thumb pp-keeper">K</span>
                <span>
                  The Keeper<small>Unknown</small>
                </span>
                <i>›</i>
              </button>
              <button className="pp-side-add" onClick={() => openEntity('character')}>
                ＋ Add character
              </button>
            </details>
            <details className="pp-side-group" open>
              <summary>
                <span>Locations</span>
                <b>4</b>
              </summary>
              <button
                className={
                  selectedEntityId === 'location-glasshouse'
                    ? 'selected pp-context-row'
                    : 'pp-context-row'
                }
                onClick={() => openEntity('location', 'location-glasshouse')}
              >
                <span className="pp-thumb pp-glass">⌖</span>
                <span>
                  The Glasshouse<small>3 interactions</small>
                </span>
                <i>›</i>
              </button>
              <button
                className={
                  selectedEntityId === 'location-quarter'
                    ? 'selected pp-context-row'
                    : 'pp-context-row'
                }
                onClick={() => openEntity('location', 'location-quarter')}
              >
                <span className="pp-thumb pp-quarter">⌖</span>
                <span>
                  Old quarter<small>2 interactions</small>
                </span>
                <i>›</i>
              </button>
              <button
                className={
                  selectedEntityId === 'location-archive'
                    ? 'selected pp-context-row'
                    : 'pp-context-row'
                }
                onClick={() => openEntity('location', 'location-archive')}
              >
                <span className="pp-thumb pp-archive">⌖</span>
                <span>
                  Lower archive<small>1 interaction</small>
                </span>
                <i>›</i>
              </button>
              <button
                className={
                  selectedEntityId === 'location-market'
                    ? 'selected pp-context-row'
                    : 'pp-context-row'
                }
                onClick={() => openEntity('location', 'location-market')}
              >
                <span className="pp-thumb pp-market">⌖</span>
                <span>
                  Market square<small>2 interactions</small>
                </span>
                <i>›</i>
              </button>
              <button className="pp-side-add" onClick={() => openEntity('location')}>
                ＋ Add location
              </button>
            </details>
            <details className="pp-side-group" open>
              <summary>
                <span>Stats</span>
                <b>4</b>
              </summary>
              <button
                className={
                  selectedEntityId === 'stat-trust' ? 'selected pp-stat-context' : 'pp-stat-context'
                }
                onClick={() => openEntity('stat', 'stat-trust')}
              >
                <span className="pp-stat-symbol">↗</span>
                <span>Trust</span>
                <small>0–10</small>
              </button>
              <button
                className={
                  selectedEntityId === 'stat-health'
                    ? 'selected pp-stat-context'
                    : 'pp-stat-context'
                }
                onClick={() => openEntity('stat', 'stat-health')}
              >
                <span className="pp-stat-symbol health">♥</span>
                <span>Health</span>
                <small>0–10</small>
              </button>
              <button
                className={
                  selectedEntityId === 'stat-insight'
                    ? 'selected pp-stat-context'
                    : 'pp-stat-context'
                }
                onClick={() => openEntity('stat', 'stat-insight')}
              >
                <span className="pp-stat-symbol insight">✦</span>
                <span>Insight</span>
                <small>0–20</small>
              </button>
              <button
                className={
                  selectedEntityId === 'stat-charge'
                    ? 'selected pp-stat-context'
                    : 'pp-stat-context'
                }
                onClick={() => openEntity('stat', 'stat-charge')}
              >
                <span className="pp-stat-symbol charge">ϟ</span>
                <span>Charge</span>
                <small>Item stat</small>
              </button>
              <button className="pp-side-add" onClick={() => openEntity('stat')}>
                ＋ Add stat
              </button>
            </details>
            <details className="pp-side-group" open>
              <summary>
                <span>Items</span>
                <b>6</b>
              </summary>
              <button
                className={
                  selectedEntityId === 'item-satchel' ? 'selected pp-context-row' : 'pp-context-row'
                }
                onClick={() => openEntity('item', 'item-satchel')}
              >
                <span className="pp-thumb pp-satchel">▣</span>
                <span>
                  Leather satchel<small>Container</small>
                </span>
                <i>›</i>
              </button>
              <button
                className={
                  selectedEntityId === 'item-key' ? 'selected pp-context-row' : 'pp-context-row'
                }
                onClick={() => openEntity('item', 'item-key')}
              >
                <span className="pp-thumb pp-key">⌕</span>
                <span>
                  Old brass key<small>Quest item</small>
                </span>
                <i>›</i>
              </button>
              <button
                className={
                  selectedEntityId === 'item-vial' ? 'selected pp-context-row' : 'pp-context-row'
                }
                onClick={() => openEntity('item', 'item-vial')}
              >
                <span className="pp-thumb pp-vial">◒</span>
                <span>
                  Healing vial<small>Consumable</small>
                </span>
                <i>›</i>
              </button>
              <button
                className={
                  selectedEntityId === 'item-map' ? 'selected pp-context-row' : 'pp-context-row'
                }
                onClick={() => openEntity('item', 'item-map')}
              >
                <span className="pp-thumb pp-map">⌁</span>
                <span>
                  Weathered map<small>Document</small>
                </span>
                <i>›</i>
              </button>
              <button className="pp-side-add" onClick={() => openEntity('item')}>
                ＋ Add item
              </button>
            </details>
          </div>
          <section className="pp-story-map">
            <small>Story map</small>
            <button className="selected">
              <span>⌘</span>All interactions<b>8</b>
            </button>
            <button>
              <span>⚑</span>Starting point
            </button>
          </section>
          <div className="pp-side-footer">
            <button>
              ⚙ <span>Story settings</span>
            </button>
            <button>
              ⌨ <span>Shortcuts</span>
            </button>
          </div>
        </div>
      </aside>
      <main className="pp-workspace">
        <div className="pp-crumb">
          <span>Story</span>
          <b>Graph overview</b>
          <div />
          <button>Undo</button>
          <button>Redo</button>
          <button>•••</button>
        </div>
        <StoryGraph select={(kind) => openEntity(kind)} />
      </main>
      {selected && (
        <Inspector
          key={`${selected}-${selectedEntityId ?? 'new'}`}
          kind={selected}
          entityId={selectedEntityId}
          onClose={() => {
            setSelected(null);
            setSelectedEntityId(undefined);
          }}
        />
      )}
    </div>
  );
}

export function ParalleaxPrototype() {
  const location = useLocation();
  const navigate = useNavigate();
  const onNavigate = (route: PrototypeRoute) => void navigate(route);

  if (location.pathname === prototypeRoutes.login) {
    return <PrototypeAuthPage mode="login" onNavigate={onNavigate} />;
  }
  if (location.pathname === prototypeRoutes.register) {
    return <PrototypeAuthPage mode="register" onNavigate={onNavigate} />;
  }
  if (location.pathname === prototypeRoutes.stories) {
    return <PrototypeStoryList onNavigate={onNavigate} />;
  }
  if (location.pathname === prototypeRoutes.designSystem) {
    return <PrototypeDesignSystem onNavigate={onNavigate} />;
  }
  return <PrototypeStoryEditor onNavigate={onNavigate} />;
}

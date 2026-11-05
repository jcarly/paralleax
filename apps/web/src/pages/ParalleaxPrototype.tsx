import {
  Children,
  cloneElement,
  isValidElement,
  memo,
  useEffect,
  useMemo,
  useCallback,
  useRef,
  useState,
  type ReactNode,
  type MouseEvent as ReactMouseEvent,
} from 'react';
import {
  Background,
  Controls,
  Handle,
  MiniMap,
  Position,
  ReactFlow,
  SelectionMode,
  useEdgesState,
  useNodesState,
  type ReactFlowInstance,
  type Connection,
  type Node,
  type NodeProps,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  PrototypeAuthPage,
  PrototypeDesignSystem,
  PrototypeStoryList,
} from './ParalleaxPrototypePages';
import { prototypeRoutes, type PrototypeRoute } from './ParalleaxPrototypeRoutes';
import {
  getPrototypeScenario,
  type PrototypeGroupFixture,
  type PrototypeInteractionFixture,
  type PrototypeScenario,
  type PrototypeTriggerFixture,
} from './prototypeScenarios';
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

interface PrototypeItem {
  name: string;
  qty: number;
  children?: PrototypeItem[];
}

const ownedItems: PrototypeItem[] = [
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

function ItemTree({ items, depth = 0 }: { items: PrototypeItem[]; depth?: number }) {
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
          {item.children && <ItemTree items={item.children} depth={depth + 1} />}
        </div>
      ))}
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="form-field form-field--compact pp-field">
      <span>{label}</span>
      {withCompactControls(children)}
    </label>
  );
}

function withCompactControls(children: ReactNode): ReactNode {
  return Children.map(children, (child) => {
    if (
      !isValidElement<{
        className?: string;
        type?: string;
        children?: ReactNode;
      }>(child)
    ) {
      return child;
    }
    const element = child;
    const isControl =
      typeof element.type === 'string' && ['input', 'select', 'textarea'].includes(element.type);
    const isSpecialized = ['checkbox', 'color', 'radio', 'range'].includes(
      element.props.type ?? '',
    );
    if (isControl && !isSpecialized) {
      return cloneElement(element, {
        className: ['form-control', 'form-control--compact', element.props.className]
          .filter(Boolean)
          .join(' '),
      });
    }
    return cloneElement(element, {}, withCompactControls(element.props.children));
  });
}

type ConditionKind =
  'character-stat' | 'item-stat' | 'has-item' | 'location' | 'visited' | 'story-time';
function getConditionKind(value: string): ConditionKind {
  switch (value) {
    case 'item-stat':
    case 'has-item':
    case 'location':
    case 'visited':
    case 'story-time':
      return value;
    case 'character-stat':
    default:
      return 'character-stat';
  }
}
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
          onChange={(event) => setConditionKind(getConditionKind(event.target.value))}
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
      if (target < 0 || target >= next.length) {
        return current;
      }
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

function PrototypeContentEditor({
  initialContent,
  isEmpty,
}: {
  initialContent: string;
  isEmpty: boolean;
}) {
  const [content, setContent] = useState(initialContent);
  const [editing, setEditing] = useState(false);
  const [conditional, setConditional] = useState(false);
  const [reference, setReference] = useState(false);
  const [bold, setBold] = useState(false);
  if (isEmpty && !content.trim() && !editing) {
    return <EmptyContentPrompt onAdd={() => setEditing(true)} />;
  }
  if (!editing) {
    return <ContentPreview content={content} onEdit={() => setEditing(true)} />;
  }
  return (
    <ContentEditing
      bold={bold}
      conditional={conditional}
      content={content}
      reference={reference}
      setBold={setBold}
      setConditional={setConditional}
      setContent={setContent}
      setEditing={setEditing}
      setReference={setReference}
    />
  );
}

function EmptyContentPrompt({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="interaction-content-empty">
      <p className="interaction-content-empty-prompt">This Interaction has no content.</p>
      <button className="secondary" type="button" onClick={onAdd}>
        Add content
      </button>
    </div>
  );
}

function ContentPreview({ content, onEdit }: { content: string; onEdit: () => void }) {
  return (
    <div className="pp-content-preview">
      <p>{content}</p>
      <button className="ghost" type="button" onClick={onEdit}>
        Edit content
      </button>
    </div>
  );
}

function ContentEditing({
  bold,
  conditional,
  content,
  reference,
  setBold,
  setConditional,
  setContent,
  setEditing,
  setReference,
}: {
  bold: boolean;
  conditional: boolean;
  content: string;
  reference: boolean;
  setBold: (bold: (value: boolean) => boolean) => void;
  setConditional: (conditional: (value: boolean) => boolean) => void;
  setContent: (content: string) => void;
  setEditing: (editing: boolean) => void;
  setReference: (reference: (value: boolean) => boolean) => void;
}) {
  return (
    <div className="pp-content-editor">
      <ContentToolbar
        bold={bold}
        conditional={conditional}
        reference={reference}
        setBold={setBold}
        setConditional={setConditional}
        setReference={setReference}
      />
      <ContentFields
        bold={bold}
        conditional={conditional}
        content={content}
        reference={reference}
        setContent={setContent}
        setEditing={setEditing}
      />
      <button className="ghost" type="button" onClick={() => setEditing(false)}>
        Done
      </button>
    </div>
  );
}

function ContentToolbar({
  bold,
  conditional,
  reference,
  setBold,
  setConditional,
  setReference,
}: {
  bold: boolean;
  conditional: boolean;
  reference: boolean;
  setBold: (bold: (value: boolean) => boolean) => void;
  setConditional: (conditional: (value: boolean) => boolean) => void;
  setReference: (reference: (value: boolean) => boolean) => void;
}) {
  return (
    <div aria-label="Content formatting" className="pp-content-toolbar" role="toolbar">
      <button
        aria-pressed={bold}
        className={bold ? 'active' : ''}
        type="button"
        onClick={() => setBold((value) => !value)}
      >
        Bold
      </button>
      <button type="button" onClick={() => setConditional((value) => !value)}>
        {conditional ? 'Remove condition' : 'Add conditional block'}
      </button>
      <button type="button" onClick={() => setReference((value) => !value)}>
        {reference ? 'Remove reference' : 'Insert reference'}
      </button>
    </div>
  );
}

function ContentFields({
  bold,
  conditional,
  content,
  reference,
  setContent,
  setEditing,
}: {
  bold: boolean;
  conditional: boolean;
  content: string;
  reference: boolean;
  setContent: (content: string) => void;
  setEditing: (editing: boolean) => void;
}) {
  return (
    <>
      <textarea
        aria-label="Interaction content"
        autoFocus
        className={`form-control form-control--compact form-control--multiline ${bold ? 'is-bold' : ''}`}
        value={content}
        onChange={(event) => setContent(event.target.value)}
        onBlur={(event) => {
          if (!event.currentTarget.value.trim()) {
            setEditing(false);
          }
        }}
      />
      {conditional ? <ContentCondition /> : null}
      {reference ? <span className="pp-content-reference">Trust · Character statistic</span> : null}
    </>
  );
}

function ContentCondition() {
  return (
    <div className="pp-content-condition">
      <span aria-hidden="true">◇</span>
      <span>Conditional block</span>
      <b>Trust ≥ 4</b>
    </div>
  );
}

function Inspector({
  kind,
  entityId,
  entityLabel,
  scenario,
  sourceIds,
  onClose,
  onOpenComments,
}: {
  kind: InspectorKind;
  entityId?: string;
  entityLabel?: string;
  scenario: PrototypeScenario;
  sourceIds?: string[];
  onClose: () => void;
  onOpenComments: () => void;
}) {
  const interaction = scenario.interactions.find(({ id }) => id === entityId);
  const trigger = scenario.triggers.find(({ id }) => id === entityId);
  const triggerSourceIds = sourceIds ?? trigger?.sources ?? [];
  const entity = entityId
    ? Object.entries(prototypeEntities).find(([id]) => id === entityId)?.[1]
    : undefined;
  const statEntity = entity && 'defaultValue' in entity ? entity : undefined;
  const [statDefault, setStatDefault] = useState<number>(statEntity?.defaultValue ?? 3);
  const [durationMode, setDurationMode] = useState<'delay' | 'fixed'>('delay');
  const [triggerGroups, setTriggerGroups] = useState<number[]>(() =>
    (trigger?.conditions ?? [[], []]).map((_, index) => index + 1),
  );
  const names: Record<InspectorKind, string> = {
    interaction: interaction?.title || entityLabel || 'New interaction',
    trigger: trigger?.title ?? 'Trigger',
    character: entity?.name ?? entityLabel ?? 'Character',
    location: entity?.name ?? entityLabel ?? 'Location',
    stat: entity?.name ?? entityLabel ?? 'Stat',
    item: entity?.name ?? entityLabel ?? 'Item',
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
        <div className="pp-inspector-head-actions">
          <button
            aria-label="Open review comments"
            title="Open review comments"
            type="button"
            onClick={onOpenComments}
          >
            ▤
          </button>
          <button
            aria-label="Close inspector"
            title="Close inspector"
            type="button"
            onClick={onClose}
          >
            ×
          </button>
        </div>
      </div>
      {kind === 'interaction' && (
        <>
          <Field label="Card title">
            <input defaultValue={interaction?.title ?? 'New interaction'} />
          </Field>
          <div className="pp-content-field">
            <span className="pp-field-label">Story text</span>
            <PrototypeContentEditor
              initialContent={interaction?.excerpt ?? ''}
              isEmpty={Boolean(interaction?.empty || !interaction?.excerpt)}
            />
          </div>
          <details className="pp-accordion">
            <summary>
              <span>◉ Context and timing</span>
              <small>Location · duration</small>
            </summary>
            <Field label="Location">
              <select defaultValue={interaction?.location ?? 'glasshouse'}>
                {scenario.locations.map((locationName) => (
                  <option key={locationName}>{locationName}</option>
                ))}
              </select>
            </Field>
            <div className="pp-timing-block">
              <div className="pp-section-title">
                <b>Interaction duration</b>
              </div>
              <Field label="Advance story time">
                <select
                  value={durationMode}
                  onChange={(event) =>
                    setDurationMode(event.target.value === 'fixed' ? 'fixed' : 'delay')
                  }
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
            <div className="pp-chip-list">
              {interaction?.characters.map((person) => (
                <span className="pp-character-chip" key={person}>
                  {person}
                </span>
              ))}
              <button className="pp-add-chip" type="button">
                ＋ Add character
              </button>
            </div>
          </details>
          <details className="pp-accordion">
            <summary>
              <span>↗ Stat effects</span>
              <b className="pp-accordion-count">{scenario.id === 'archive-below' ? '2' : '0'}</b>
            </summary>
            {scenario.id === 'archive-below' ? <EffectList kind="stat" /> : null}
          </details>
          <details className="pp-accordion">
            <summary>
              <span>▣ Item effects</span>
              <b className="pp-accordion-count">{scenario.id === 'archive-below' ? '1' : '0'}</b>
            </summary>
            {scenario.id === 'archive-below' ? <EffectList kind="item" /> : null}
          </details>
          <p className="pp-inspector-hint">
            Routes and their Trigger markers stay visible on the graph.
          </p>
        </>
      )}
      {kind === 'trigger' && (
        <>
          <p className="pp-hint">
            One Trigger can have several source Interactions. Inputs are alternatives; conditions
            inside a group combine with AND, and groups on this Trigger combine with OR.
          </p>
          <div className="pp-route-summary">
            <span>From</span>
            <b>
              {triggerSourceIds.length
                ? triggerSourceIds
                    .map(
                      (sourceId) => scenario.interactions.find(({ id }) => id === sourceId)?.title,
                    )
                    .map((sourceTitle, index) => sourceTitle ?? `New interaction ${index + 1}`)
                    .join(' · ')
                : 'Beginning'}
            </b>
            <span>To</span>
            <b>
              {scenario.interactions.find(({ id }) => id === trigger?.target)?.title ??
                'Interaction'}
            </b>
          </div>
          {trigger ? (
            <div className="pp-trigger-settings">
              <Field label="Appearance probability">
                <input type="number" min="0" max="100" defaultValue={trigger.probability} />
              </Field>
              <Field label="Choice timer (seconds)">
                <input type="number" min="0" defaultValue={trigger.timerSeconds ?? ''} />
              </Field>
            </div>
          ) : null}
          <div className="pp-section-title">
            <b>Condition groups</b>
            <button
              type="button"
              onClick={() => setTriggerGroups((current) => [...current, Date.now()])}
            >
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
                    trigger?.conditions[index]?.length === 0
                      ? []
                      : index === 0
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
            <span>Input count</span>
            <b>{triggerSourceIds.length}</b>
            <small>Each source is an alternative route into this Trigger.</small>
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
              <b>{entity?.name ?? entityLabel ?? 'Mara Venn'}</b>
              <small>
                {entity && 'subtitle' in entity ? entity.subtitle : 'Playable character'}
              </small>
              <button type="button">Change portrait</button>
            </div>
          </div>
          <Field label="Name">
            <input defaultValue={entity?.name ?? entityLabel ?? 'Mara Venn'} />
          </Field>
          <Field label="Description">
            <textarea
              rows={4}
              defaultValue={entity && 'description' in entity ? entity.description : ''}
            />
          </Field>
          <div className="pp-section-title">
            <b>Stats</b>
            <button type="button">＋ Add</button>
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
          <Field label="Name">
            <input defaultValue={entity?.name ?? entityLabel ?? 'The Glasshouse'} />
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
            <input defaultValue={entity?.name ?? entityLabel ?? 'Trust'} />
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
          <Field label="Definition name">
            <input defaultValue={entity?.name ?? entityLabel ?? 'Leather satchel'} />
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
          <ItemTree items={entityId === 'item-satchel' ? (ownedItems[0].children ?? []) : []} />
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
  root?: boolean;
  conditions?: string;
  probability?: number;
  timerSeconds?: number;
};

function GraphInteractionNode({ data }: NodeProps<Node<GraphData>>) {
  const value = data;
  return (
    <div className="pp-flow-card">
      <Handle type="target" position={Position.Top} />
      <b>{value.title || 'Untitled interaction'}</b>
      {value.text ? <p>{value.text}</p> : <p className="pp-empty-node">Add content</p>}
      <div className="pp-node-context">
        {value.location ? <span>⌖ {value.location}</span> : null}
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

function GraphTriggerNode({ data }: NodeProps<Node<GraphData>>) {
  const value = data;
  return (
    <div
      className={`pp-flow-trigger ${value.root ? 'is-root' : ''}`}
      title={`${value.title}${value.conditions ? ` · ${value.conditions}` : ''}`}
      aria-label={`${value.root ? 'Root trigger' : 'Trigger'}: ${value.title}`}
    >
      <Handle type="target" position={Position.Top} />
      <span aria-hidden="true" className="pp-flow-trigger-diamond">
        ◇
      </span>
      {value.probability !== undefined && (value.probability < 100 || value.timerSeconds) ? (
        <small className="pp-trigger-indicator">
          {value.probability < 100 ? `${value.probability}%` : ''}
          {value.timerSeconds ? ` · ${value.timerSeconds}s` : ''}
        </small>
      ) : null}
      <Handle type="source" position={Position.Bottom} />
    </div>
  );
}

const graphNodeTypes = { interaction: GraphInteractionNode, trigger: GraphTriggerNode };
function createScenarioGraph(scenario: PrototypeScenario) {
  const interactions = scenario.interactions.map((interaction) => ({
    id: interaction.id,
    type: 'interaction',
    position: interaction.position,
    data: {
      title: interaction.title,
      text: interaction.excerpt,
      location: interaction.location,
      people: interaction.characters,
    },
  }));
  const triggers = scenario.triggers.map((trigger) => {
    const target = scenario.interactions.find(({ id }) => id === trigger.target);
    return {
      id: trigger.id,
      type: 'trigger',
      position: {
        x: (target?.position.x ?? 310) + 82,
        y: (target?.position.y ?? 250) - 42,
      },
      data: {
        title: trigger.title,
        root: trigger.sources.length === 0,
        conditions: trigger.conditions
          .map((group) => group.join(' AND '))
          .filter(Boolean)
          .join(' OR '),
        probability: trigger.probability,
        timerSeconds: trigger.timerSeconds,
      },
    };
  });
  return { nodes: [...interactions, ...triggers], edges: createScenarioEdges(scenario) };
}

function createScenarioEdges(scenario: PrototypeScenario) {
  return scenario.triggers.flatMap((trigger) => [
    ...trigger.sources.map((source) => ({
      id: `${trigger.id}-${source}`,
      source,
      target: trigger.id,
      selectable: false,
      type: 'smoothstep',
    })),
    {
      id: `${trigger.id}-output`,
      source: trigger.id,
      target: trigger.target,
      selectable: false,
      type: 'smoothstep',
    },
  ]);
}

type GraphConnectionPlan =
  | { kind: 'add-source'; triggerId: string; sourceId: string; sourceIds: string[] }
  | { kind: 'new-trigger'; node: Node<GraphData>; edges: StoryGraphEdge[] };

type StoryGraphEdge = {
  id: string;
  source: string;
  target: string;
  selectable: boolean;
  type: string;
};

function hasEquivalentRoute(
  route: { sourceId: string; targetId: string; excludedTriggerId?: string },
  nodes: Node<GraphData>[],
  edges: StoryGraphEdge[],
) {
  return nodes.some(
    (node) =>
      node.type === 'trigger' &&
      node.id !== route.excludedTriggerId &&
      edges.some((edge) => edge.source === route.sourceId && edge.target === node.id) &&
      edges.some((edge) => edge.source === node.id && edge.target === route.targetId),
  );
}

function getGraphConnectionPlan(
  connection: Connection,
  nodes: Node<GraphData>[],
  edges: StoryGraphEdge[],
): GraphConnectionPlan | null {
  const source = nodes.find((node) => node.id === connection.source);
  const target = nodes.find((node) => node.id === connection.target);
  if (!source || !target || source.type !== 'interaction') {
    return null;
  }
  if (target.type === 'trigger') {
    return getTriggerSourcePlan(source, target, nodes, edges);
  }
  if (target.type !== 'interaction') {
    return null;
  }
  return getNewTriggerPlan(source, target, nodes, edges);
}

function getTriggerSourcePlan(
  source: Node<GraphData>,
  target: Node<GraphData>,
  nodes: Node<GraphData>[],
  edges: StoryGraphEdge[],
): GraphConnectionPlan | null {
  const output = edges.find((edge) => edge.source === target.id);
  const connectedSources = edges.filter((edge) => edge.target === target.id);
  if (
    !output ||
    connectedSources.some((edge) => edge.source === source.id) ||
    hasEquivalentRoute(
      { sourceId: source.id, targetId: output.target, excludedTriggerId: target.id },
      nodes,
      edges,
    )
  ) {
    return null;
  }
  return {
    kind: 'add-source',
    triggerId: target.id,
    sourceId: source.id,
    sourceIds: [...connectedSources.map((edge) => edge.source), source.id],
  };
}

function getNewTriggerPlan(
  source: Node<GraphData>,
  target: Node<GraphData>,
  nodes: Node<GraphData>[],
  edges: StoryGraphEdge[],
): GraphConnectionPlan | null {
  if (hasEquivalentRoute({ sourceId: source.id, targetId: target.id }, nodes, edges)) {
    return null;
  }
  const triggerId = `trigger-${Date.now()}`;
  return {
    kind: 'new-trigger',
    node: {
      id: triggerId,
      type: 'trigger',
      position: { x: target.position.x + 82, y: target.position.y - 42 },
      data: { title: 'New trigger', root: false, conditions: '', probability: 100 },
    },
    edges: [
      {
        id: `${triggerId}-${source.id}`,
        source: source.id,
        target: triggerId,
        selectable: false,
        type: 'smoothstep',
      },
      {
        id: `${triggerId}-output`,
        source: triggerId,
        target: target.id,
        selectable: false,
        type: 'smoothstep',
      },
    ],
  };
}

function createInteractionGraph(source?: Node<GraphData>) {
  const id = `interaction-${Date.now()}`;
  const triggerId = `trigger-${Date.now()}`;
  const position = { x: source?.position.x ?? 310, y: (source?.position.y ?? 100) + 260 };
  const nodes: Node<GraphData>[] = [
    {
      id,
      type: 'interaction',
      position,
      data: { title: 'New interaction', text: '', location: '', people: [] },
    },
    {
      id: triggerId,
      type: 'trigger',
      position: { x: position.x + 82, y: position.y - 42 },
      data: {
        title: source ? 'New route' : 'Beginning',
        root: !source,
        conditions: '',
        probability: 100,
      },
    },
  ];
  return { id, nodes, edges: createInteractionEdges(source?.id, triggerId, id) };
}

function createInteractionEdges(
  sourceId: string | undefined,
  triggerId: string,
  interactionId: string,
): StoryGraphEdge[] {
  const edges: StoryGraphEdge[] = [
    {
      id: `${triggerId}-output`,
      source: triggerId,
      target: interactionId,
      selectable: false,
      type: 'smoothstep',
    },
  ];
  if (sourceId) {
    edges.push({
      id: `${triggerId}-${sourceId}`,
      source: sourceId,
      target: triggerId,
      selectable: false,
      type: 'smoothstep',
    });
  }
  return edges;
}

type GroupItemProps = {
  group: PrototypeGroupFixture;
  groups: PrototypeGroupFixture[];
  scenario: PrototypeScenario;
  selectedGroupId?: string;
  onSelectGroup: (group: PrototypeGroupFixture) => void;
  onSelectInteraction: (interactionId: string) => void;
  onAddGroup: (parentId?: string) => void;
  depth: number;
};

function PrototypeGroupItem({
  group,
  groups,
  scenario,
  selectedGroupId,
  onSelectGroup,
  onSelectInteraction,
  onAddGroup,
  depth,
}: GroupItemProps) {
  const children = groups.filter(({ parentId }) => parentId === group.id);
  return (
    <div className="pp-group-tree-node">
      <PrototypeGroupHeader
        depth={depth}
        group={group}
        onAddGroup={onAddGroup}
        onSelectGroup={onSelectGroup}
        selected={selectedGroupId === group.id}
      />
      <GroupInteractionList
        depth={depth}
        interactionIds={group.interactionIds}
        interactions={scenario.interactions}
        onSelectInteraction={onSelectInteraction}
      />
      {children.map((child) => (
        <PrototypeGroupItem
          depth={depth + 1}
          group={child}
          groups={groups}
          key={child.id}
          onAddGroup={onAddGroup}
          onSelectGroup={onSelectGroup}
          onSelectInteraction={onSelectInteraction}
          scenario={scenario}
          selectedGroupId={selectedGroupId}
        />
      ))}
    </div>
  );
}

function PrototypeGroupHeader({
  depth,
  group,
  onAddGroup,
  onSelectGroup,
  selected,
}: {
  depth: number;
  group: PrototypeGroupFixture;
  onAddGroup: (parentId?: string) => void;
  onSelectGroup: (group: PrototypeGroupFixture) => void;
  selected: boolean;
}) {
  return (
    <div className="pp-group-tree-row" style={{ paddingLeft: 8 + depth * 14 }}>
      <button
        aria-pressed={selected}
        className={selected ? 'selected' : ''}
        type="button"
        onClick={() => onSelectGroup(group)}
      >
        <span aria-hidden="true">▱</span>
        <span>{group.title}</span>
        <small>{group.interactionIds.length}</small>
      </button>
      <button
        aria-label={`Add subgroup to ${group.title}`}
        className="pp-group-add-child"
        title={`Add subgroup to ${group.title}`}
        type="button"
        onClick={() => onAddGroup(group.id)}
      >
        +
      </button>
    </div>
  );
}

function GroupInteractionList({
  depth,
  interactionIds,
  interactions,
  onSelectInteraction,
}: {
  depth: number;
  interactionIds: string[];
  interactions: PrototypeScenario['interactions'];
  onSelectInteraction: (interactionId: string) => void;
}) {
  return interactionIds.map((interactionId) => {
    const interaction = interactions.find(({ id }) => id === interactionId);
    return interaction ? (
      <button
        className="pp-group-interaction"
        key={interactionId}
        style={{ paddingLeft: 23 + depth * 14 }}
        type="button"
        onClick={() => onSelectInteraction(interactionId)}
      >
        <span aria-hidden="true">◇</span> {interaction.title || 'Untitled interaction'}
      </button>
    ) : null;
  });
}

function PrototypeGroupTree({
  groups,
  scenario,
  selectedGroupId,
  onSelectGroup,
  onSelectInteraction,
  onAddGroup,
}: {
  groups: PrototypeGroupFixture[];
  scenario: PrototypeScenario;
  selectedGroupId?: string;
  onSelectGroup: (group: PrototypeGroupFixture) => void;
  onSelectInteraction: (interactionId: string) => void;
  onAddGroup: (parentId?: string) => void;
}) {
  return (
    <section className="pp-story-map pp-group-section">
      <div className="pp-section-title">
        <small>Groups</small>
        <button type="button" onClick={() => onAddGroup()}>
          Add
        </button>
      </div>
      {groups
        .filter(({ parentId }) => !parentId)
        .map((group) => (
          <PrototypeGroupItem
            depth={0}
            group={group}
            groups={groups}
            key={group.id}
            onAddGroup={onAddGroup}
            onSelectGroup={onSelectGroup}
            onSelectInteraction={onSelectInteraction}
            scenario={scenario}
            selectedGroupId={selectedGroupId}
          />
        ))}
      {groups.length === 0 ? <p className="pp-groups-empty">No Groups yet.</p> : null}
    </section>
  );
}

function StoryGraph({
  scenario,
  select,
  onGroupSelection,
  onTriggerSourcesChange,
  focusInteractionIds,
  searchQuery,
}: {
  scenario: PrototypeScenario;
  select: (kind: InspectorKind, entityId?: string) => void;
  onGroupSelection: (interactionIds: string[]) => void;
  onTriggerSourcesChange: (triggerId: string, sourceIds: string[]) => void;
  focusInteractionIds: string[];
  searchQuery: string;
}) {
  const canvasRef = useRef<HTMLDivElement>(null);
  const flowInstance = useRef<ReactFlowInstance<Node<GraphData>, StoryGraphEdge> | null>(null);
  const initialGraph = createScenarioGraph(scenario);
  const [nodes, setNodes, onNodesChange] = useNodesState<Node<GraphData>>(initialGraph.nodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialGraph.edges);
  const [selectedInteractionIds, setSelectedInteractionIds] = useState<string[]>([]);
  const [selectionMessage, setSelectionMessage] = useState('');
  const focusedNodeKey = focusInteractionIds.join('|');
  const query = searchQuery.trim().toLocaleLowerCase();
  useEffect(() => {
    const container = canvasRef.current;
    if (!container) {
      return;
    }
    let frame = 0;
    const observer = new ResizeObserver(() => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        void flowInstance.current?.fitView({ padding: 0.16, duration: 0 });
      });
    });
    observer.observe(container);
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
    };
  }, []);
  useEffect(() => {
    const focusedIds = new Set(focusedNodeKey ? focusedNodeKey.split('|') : []);
    setNodes((current) => {
      let changed = false;
      const next = current.map((node) => {
        const data = node.data;
        const matches =
          !query ||
          `${data.title} ${data.text ?? ''} ${data.location ?? ''}`
            .toLocaleLowerCase()
            .includes(query);
        const selected =
          focusedIds.size > 0
            ? node.type === 'interaction' && focusedIds.has(node.id)
            : node.selected;
        const className = query ? (matches ? 'pp-search-match' : 'pp-search-dim') : undefined;
        if (node.selected === selected && node.className === className) {
          return node;
        }
        changed = true;
        return { ...node, selected, className };
      });
      return changed ? next : current;
    });
  }, [focusedNodeKey, query, setNodes]);
  const displayNodes = nodes;
  const addInteraction = useCallback(() => {
    const source = nodes.find((node) => node.selected && node.type === 'interaction');
    const graph = createInteractionGraph(source);
    setNodes((current) => [...current, ...graph.nodes]);
    setEdges((current) => [...current, ...graph.edges]);
    select('interaction', graph.id);
  }, [nodes, select, setEdges, setNodes]);
  const connect = useCallback(
    (connection: Connection) => {
      const plan = getGraphConnectionPlan(connection, nodes, edges);
      if (!plan) {
        return;
      }
      if (plan.kind === 'add-source') {
        setEdges((current) => [
          ...current,
          {
            id: `${plan.triggerId}-${plan.sourceId}`,
            source: plan.sourceId,
            target: plan.triggerId,
            selectable: false,
            type: 'smoothstep',
          },
        ]);
        onTriggerSourcesChange(plan.triggerId, plan.sourceIds);
        return;
      }
      setNodes((current) => [...current, plan.node]);
      setEdges((current) => [...current, ...plan.edges]);
    },
    [edges, nodes, onTriggerSourcesChange, setEdges, setNodes],
  );
  const handleNodeClick = useCallback(
    (_event: ReactMouseEvent, node: Node<GraphData>) =>
      select(node.type === 'trigger' ? 'trigger' : 'interaction', node.id),
    [select],
  );
  const handleSelectionChange = useCallback(({ nodes: selectedNodes }: { nodes: Node[] }) => {
    setSelectedInteractionIds(
      selectedNodes.filter(({ type }) => type === 'interaction').map(({ id }) => id),
    );
  }, []);
  return (
    <div className="pp-canvas" ref={canvasRef}>
      <div className="pp-graph-actions">
        <button className="secondary" type="button" onClick={addInteraction}>
          ＋ Interaction
        </button>
        <span>Drag to select · connect an Interaction to a Trigger to add a source</span>
      </div>
      <ReactFlow
        onInit={(instance) => {
          flowInstance.current = instance;
        }}
        nodes={displayNodes}
        edges={edges}
        nodeTypes={graphNodeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={connect}
        onNodeClick={handleNodeClick}
        onSelectionChange={handleSelectionChange}
        selectionOnDrag
        selectionMode={SelectionMode.Partial}
        multiSelectionKeyCode="Shift"
        fitView
        minZoom={0.35}
        maxZoom={1.6}
        edgesFocusable={false}
      >
        <Background gap={20} size={1} />
        <Controls position="bottom-left" />
        <MiniMap position="bottom-right" pannable zoomable />
      </ReactFlow>
      {selectedInteractionIds.length > 1 ? (
        <div className="pp-selection-actions" role="group" aria-label="Selection actions">
          <span>{selectedInteractionIds.length} Interactions selected</span>
          <button
            className="secondary"
            type="button"
            onClick={() => {
              onGroupSelection(selectedInteractionIds);
              setSelectionMessage('Added to a new Group.');
            }}
          >
            Add to Group
          </button>
          {selectionMessage ? <small role="status">{selectionMessage}</small> : null}
        </div>
      ) : null}
    </div>
  );
}

const MemoizedStoryGraph = memo(StoryGraph);

function Player({
  scenario,
  initialMode,
  onExit,
}: {
  scenario: PrototypeScenario;
  initialMode: 'reader' | 'simulation';
  onExit: () => void;
}) {
  const firstInteractionId = scenario.interactions[0]?.id ?? '';
  const [mode, setMode] = useState<'reader' | 'simulation'>(initialMode);
  const [journey, setJourney] = useState([firstInteractionId]);
  const [trust, setTrust] = useState(3);
  const [insight, setInsight] = useState(4);
  const [hasKey, setHasKey] = useState(false);
  const [keyCharge, setKeyCharge] = useState(2);
  const [forced, setForced] = useState(false);
  const [storyTime, setStoryTime] = useState('23:40');
  const [history, setHistory] = useState(['23:40 · Simulation started']);
  const currentInteractionId = journey[journey.length - 1] ?? firstInteractionId;
  const currentInteraction = scenario.interactions.find(({ id }) => id === currentInteractionId);

  function conditionMatches(condition: string) {
    const trustCheck = condition.match(/trust\s*(≥|>)\s*(\d+)/i);
    if (trustCheck) {
      return trustCheck[1] === '≥' ? trust >= Number(trustCheck[2]) : trust > Number(trustCheck[2]);
    }
    const checks: Array<[RegExp, boolean]> = [
      [/key charge > 0/i, hasKey && keyCharge > 0],
      [/old brass key is carried|medicine is carried/i, hasKey],
      [/log was checked/i, journey.includes('hs-2')],
      [/southern beacon answered/i, journey.includes('hs-3')],
      [/visited the archive/i, journey.includes('ab-5')],
      [/bridge report is clear/i, journey.includes('af-4')],
      [/ivo is present/i, scenario.interactions.some((item) => item.id === 'af-4')],
    ];
    return checks.find(([pattern]) => pattern.test(condition))?.[1] ?? true;
  }

  const choices = scenario.triggers
    .filter(({ sources }) => sources.includes(currentInteractionId))
    .map((trigger) => {
      const target = scenario.interactions.find(({ id }) => id === trigger.target);
      const conditionsAvailable = trigger.conditions.some((group) => group.every(conditionMatches));
      const rollAvailable = trigger.probability >= 72;
      return {
        trigger,
        target,
        available: conditionsAvailable && rollAvailable,
        summary: trigger.conditions
          .map((group) => group.join(' AND '))
          .filter(Boolean)
          .join(' OR '),
      };
    })
    .filter((choice): choice is typeof choice & { target: PrototypeInteractionFixture } =>
      Boolean(choice.target),
    );
  const visibleChoices =
    mode === 'simulation' ? choices : choices.filter(({ available }) => available);

  function restart() {
    setJourney([firstInteractionId]);
    setTrust(3);
    setInsight(4);
    setHasKey(false);
    setKeyCharge(2);
    setForced(false);
    setStoryTime('23:40');
    setHistory(['23:40 · Simulation restarted']);
  }

  function choose(targetId: string, available: boolean) {
    if (!available && !forced) {
      return;
    }
    const target = scenario.interactions.find(({ id }) => id === targetId);
    if (!target) {
      return;
    }
    const nextJourney = [...journey, targetId];
    setJourney(nextJourney);
    const nextTime = `${String((23 + nextJourney.length) % 24).padStart(2, '0')}:40`;
    setStoryTime(nextTime);
    const effect = applyScenarioEffects(targetId);
    const forcedNote = available ? '' : ' · Forced while unavailable';
    setHistory((current) => [
      `${nextTime} · ${target.title || 'Interaction selected'}${forcedNote}${effect}`,
      ...current,
    ]);
  }

  function applyScenarioEffects(targetId: string) {
    if (scenario.id !== 'archive-below') {
      return '';
    }
    if (targetId === 'ab-3') {
      setTrust((value) => value + 1);
      return ' · Trust +1';
    }
    if (targetId === 'ab-4') {
      setTrust((value) => value + 2);
      setHasKey(true);
      return ' · Trust +2 · Key obtained';
    }
    if (targetId === 'ab-5') {
      setInsight((value) => value + 2);
      setKeyCharge((value) => Math.max(0, value - 1));
      return ' · Insight +2 · Key charge −1';
    }
    return '';
  }

  return (
    <div className={`pp-player ${mode === 'reader' ? 'reader-mode' : 'simulation-mode'}`}>
      <header className="pp-player-top">
        <b>Paralleax</b>
        <span>{scenario.title}</span>
        <div aria-label="Player mode" className="pp-player-mode" role="group">
          <button
            aria-pressed={mode === 'reader'}
            className={mode === 'reader' ? 'active' : ''}
            type="button"
            onClick={() => setMode('reader')}
          >
            Reader
          </button>
          <button
            aria-pressed={mode === 'simulation'}
            className={mode === 'simulation' ? 'active' : ''}
            type="button"
            onClick={() => setMode('simulation')}
          >
            Simulation
          </button>
        </div>
        <button className="secondary" type="button" onClick={restart}>
          ↻ Restart
        </button>
        <button className="ghost" type="button" onClick={onExit}>
          Back to editor
        </button>
      </header>
      {mode === 'simulation' ? (
        <aside className="pp-player-stats">
          <div className="pp-avatar big">MV</div>
          <h2>Mara Venn</h2>
          <p>Current simulation state</p>
          <h3>Stats</h3>
          <div className="pp-player-stat">
            <span>Trust</span>
            <b>{trust} / 10</b>
            <i style={{ width: `${trust * 10}%` }} />
          </div>
          <div className="pp-player-stat">
            <span>Health</span>
            <b>8 / 10</b>
            <i style={{ width: '80%' }} />
          </div>
          <div className="pp-player-stat">
            <span>Insight</span>
            <b>{insight} / 20</b>
            <i style={{ width: `${insight * 5}%` }} />
          </div>
          <h3>Inventory</h3>
          <ItemTree items={ownedItems} />
          {hasKey ? (
            <div className="pp-gained-item">
              <span>▣ Old brass key</span>
              <b>Charge {keyCharge}/2</b>
            </div>
          ) : null}
          <h3>Simulation log</h3>
          <ol className="pp-simulation-log">
            {history.map((entry, index) => (
              <li key={`${entry}-${index}`}>{entry}</li>
            ))}
          </ol>
        </aside>
      ) : null}
      <main className="pp-scene">
        <div className="pp-scene-meta">
          <span>{currentInteraction?.location || 'No location assigned'}</span>
          <time>{storyTime}</time>
          {currentInteraction?.characters.map((person) => (
            <span className="pp-scene-character" key={person}>
              {person}
            </span>
          ))}
        </div>
        {mode === 'simulation' ? (
          <p className="pp-simulation-interaction-title">
            Interaction: {currentInteraction?.title || 'Untitled interaction'}
          </p>
        ) : null}
        <article className="pp-reader-card">
          <p className="pp-narrative-copy">
            {currentInteraction?.excerpt || 'This Interaction has no content yet.'}
          </p>
        </article>
        {visibleChoices.length ? (
          <div aria-label="Available choices" className="pp-choices">
            {visibleChoices.map((choice) => (
              <PlayerChoice
                choice={choice}
                forced={forced}
                key={choice.trigger.id}
                mode={mode}
                onChoose={choose}
              />
            ))}
          </div>
        ) : (
          <div className="pp-player-ending">
            <b>Branch end</b>
            <p>There are no currently available Interactions from this point.</p>
            {journey.length > 1 ? (
              <button
                className="secondary"
                type="button"
                onClick={() => setJourney(journey.slice(0, -1))}
              >
                Go back one step
              </button>
            ) : null}
          </div>
        )}
        {mode === 'simulation' ? (
          <label className="pp-force">
            <input
              type="checkbox"
              checked={forced}
              onChange={(event) => setForced(event.target.checked)}
            />{' '}
            Force unavailable options <small>Simulation only</small>
          </label>
        ) : null}
      </main>
    </div>
  );
}

function PlayerChoice({
  choice,
  forced,
  mode,
  onChoose,
}: {
  choice: {
    trigger: PrototypeTriggerFixture;
    target: PrototypeInteractionFixture;
    available: boolean;
    summary: string;
  };
  forced: boolean;
  mode: 'reader' | 'simulation';
  onChoose: (targetId: string, available: boolean) => void;
}) {
  const { trigger, target, available, summary } = choice;
  return (
    <button
      className={!available ? 'unavailable' : ''}
      disabled={mode === 'simulation' && !available && !forced}
      type="button"
      onClick={() => onChoose(target.id, available)}
    >
      <span className="pp-choice-copy">
        <strong>{target?.title || 'Untitled interaction'}</strong>
        {mode === 'simulation' ? (
          <PlayerChoiceStatus
            available={available}
            probability={trigger.probability}
            summary={summary}
            timerSeconds={trigger.timerSeconds}
          />
        ) : null}
      </span>
      <span aria-hidden="true">→</span>
    </button>
  );
}

function PlayerChoiceStatus({
  available,
  probability,
  summary,
  timerSeconds,
}: {
  available: boolean;
  probability: number;
  summary: string;
  timerSeconds?: number;
}) {
  return (
    <small>
      {available ? 'Available' : 'Unavailable'}
      {summary ? ` · ${summary}` : ''}
      {probability < 100 ? ` · ${probability}% probability` : ''}
      {timerSeconds ? ` · ${timerSeconds}s timer` : ''}
    </small>
  );
}

function PrototypeCommentsPanel({
  scenario,
  replies,
  onClose,
  onReply,
}: {
  scenario: PrototypeScenario;
  replies: string[];
  onClose: () => void;
  onReply: (reply: string) => void;
}) {
  return (
    <aside className="pp-inspector pp-comments-panel">
      <div className="pp-inspector-head">
        <div>
          <small>Review discussion</small>
          <h2>Comments</h2>
        </div>
        <button aria-label="Close comments" type="button" onClick={onClose}>
          ×
        </button>
      </div>
      <PrototypeReviewThread scenario={scenario} />
      {replies.map((reply, index) => (
        <article className="pp-review-reply" key={`${reply}-${index}`}>
          <b>You</b>
          <p>{reply}</p>
        </article>
      ))}
      <PrototypeReplyForm onReply={onReply} />
      <p className="pp-prototype-note">Comment threads are local sample data.</p>
    </aside>
  );
}

function PrototypeReviewThread({ scenario }: { scenario: PrototypeScenario }) {
  return (
    <article className="pp-review-thread">
      <span className="pp-review-anchor">
        Anchored to {scenario.interactions[0]?.title || 'the starting Interaction'}
      </span>
      <p>Could this opening clue connect more clearly to the next scene?</p>
      <small>Alex · 10 minutes ago · Open</small>
    </article>
  );
}

function PrototypeReplyForm({ onReply }: { onReply: (reply: string) => void }) {
  const [draft, setDraft] = useState('');
  return (
    <form
      className="pp-review-reply-form"
      onSubmit={(event) => {
        event.preventDefault();
        if (!draft.trim()) {
          return;
        }
        onReply(draft.trim());
        setDraft('');
      }}
    >
      <label className="form-field form-field--compact">
        Reply
        <textarea
          aria-label="Reply to comment"
          className="form-control form-control--compact form-control--multiline"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
        />
      </label>
      <button className="secondary" type="submit" disabled={!draft.trim()}>
        Reply
      </button>
    </form>
  );
}

function PrototypeStoryEditor({
  onNavigate,
  onReset,
  scenario,
}: {
  onNavigate: (route: PrototypeRoute) => void;
  onReset: () => void;
  scenario: PrototypeScenario;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const [selected, setSelected] = useState<InspectorKind | null>('interaction');
  const [selectedEntityId, setSelectedEntityId] = useState<string | undefined>(
    scenario.interactions[0]?.id,
  );
  const [selectedEntityLabel, setSelectedEntityLabel] = useState<string>();
  const [playing, setPlaying] = useState(false);
  const [playingMode, setPlayingMode] = useState<'reader' | 'simulation'>('reader');
  const [rightPanel, setRightPanel] = useState<'inspector' | 'comments'>('inspector');
  const [groups, setGroups] = useState(scenario.groups);
  const [triggerSources, setTriggerSources] = useState<Record<string, string[]>>({});
  const [selectedGroupId, setSelectedGroupId] = useState<string>();
  const [searchQuery, setSearchQuery] = useState('');
  const [commentReplies, setCommentReplies] = useState<string[]>([]);
  const openEntity = useCallback((kind: InspectorKind, id?: string, label?: string) => {
    setSelected(kind);
    setSelectedEntityId(id);
    setSelectedEntityLabel(label);
    setRightPanel('inspector');
  }, []);
  const addGroup = useCallback((parentId?: string) => {
    const id = `group-${Date.now()}`;
    setGroups((current) => [
      ...current,
      { id, title: parentId ? 'New subgroup' : 'New group', parentId, interactionIds: [] },
    ]);
    setSelectedGroupId(id);
  }, []);
  const collectGroupInteractions = useCallback(
    (groupId: string): string[] => {
      const interactionIds: string[] = [];
      const pendingGroupIds = [groupId];
      while (pendingGroupIds.length > 0) {
        const currentId = pendingGroupIds.pop();
        if (!currentId) {
          continue;
        }
        const group = groups.find(({ id }) => id === currentId);
        if (!group) {
          continue;
        }
        interactionIds.push(...group.interactionIds);
        pendingGroupIds.push(
          ...groups.filter(({ parentId }) => parentId === currentId).map(({ id }) => id),
        );
      }
      return interactionIds;
    },
    [groups],
  );
  const focusInteractionIds = useMemo(
    () => (selectedGroupId ? collectGroupInteractions(selectedGroupId) : []),
    [collectGroupInteractions, selectedGroupId],
  );
  const groupSelection = useCallback((interactionIds: string[]) => {
    const id = `group-${Date.now()}`;
    setGroups((current) => [
      ...current.map((group) => ({
        ...group,
        interactionIds: group.interactionIds.filter(
          (interactionId) => !interactionIds.includes(interactionId),
        ),
      })),
      { id, title: 'Selected Interactions', interactionIds },
    ]);
    setSelectedGroupId(id);
  }, []);
  const selectGraphEntity = useCallback(
    (kind: InspectorKind, entityId?: string) => openEntity(kind, entityId),
    [openEntity],
  );
  const onTriggerSourcesChange = useCallback((triggerId: string, sourceIds: string[]) => {
    setTriggerSources((current) => ({ ...current, [triggerId]: sourceIds }));
  }, []);
  if (playing) {
    return (
      <Player initialMode={playingMode} scenario={scenario} onExit={() => setPlaying(false)} />
    );
  }
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
        <strong>{scenario.title}</strong>
        <span className="pp-editor-view">Graph</span>
        <div className="pp-spacer" />
        <span className="pp-prototype-status">Local demo</span>
        <button className="secondary" type="button" onClick={() => setRightPanel('comments')}>
          Comments
        </button>
        <button className="secondary" type="button" onClick={onReset}>
          Reset demo
        </button>
        <button type="button" onClick={() => onNavigate(prototypeRoutes.designSystem)}>
          Design system
        </button>
        <button
          className="secondary"
          type="button"
          onClick={() => {
            setPlayingMode('reader');
            setPlaying(true);
          }}
        >
          Read
        </button>
        <button
          className="pp-play"
          type="button"
          onClick={() => {
            setPlayingMode('simulation');
            setPlaying(true);
          }}
        >
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
            <span aria-hidden="true">⌕</span>
            <input
              aria-label="Search Interactions"
              className="form-control form-control--compact"
              placeholder="Search story…"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
            />
          </div>
          <PrototypeGroupTree
            groups={groups}
            scenario={scenario}
            selectedGroupId={selectedGroupId}
            onSelectGroup={(group) => {
              setSelectedGroupId(group.id);
              setSelected(null);
              setSelectedEntityId(undefined);
              setSelectedEntityLabel(undefined);
            }}
            onSelectInteraction={(interactionId) => openEntity('interaction', interactionId)}
            onAddGroup={addGroup}
          />
          <div className="pp-context-lists">
            <details className="pp-side-group">
              <summary>
                <span>Characters</span>
                <b>{scenario.characters.length}</b>
              </summary>
              {scenario.characters.map((character, index) => {
                const id =
                  character === 'Mara Venn'
                    ? 'character-mara'
                    : character === 'Ivo Hale'
                      ? 'character-ivo'
                      : character === 'The Keeper'
                        ? 'character-keeper'
                        : `character-${index}`;
                return (
                  <button
                    className={
                      selectedEntityId === id ? 'selected pp-context-row' : 'pp-context-row'
                    }
                    key={character}
                    type="button"
                    onClick={() => openEntity('character', id, character)}
                  >
                    <span className="pp-thumb">{character.slice(0, 2).toUpperCase()}</span>
                    <span>
                      {character}
                      <small>{index === 0 ? 'Playable character' : 'In this story'}</small>
                    </span>
                    <i>›</i>
                  </button>
                );
              })}
              <button className="pp-side-add" type="button" onClick={() => openEntity('character')}>
                ＋ Add character
              </button>
            </details>
            <details className="pp-side-group">
              <summary>
                <span>Locations</span>
                <b>{scenario.locations.length}</b>
              </summary>
              {scenario.locations.map((locationName, index) => {
                const id =
                  locationName === 'The Glasshouse'
                    ? 'location-glasshouse'
                    : locationName === 'Old Quarter' || locationName === 'Old quarter'
                      ? 'location-quarter'
                      : locationName === 'Lower Archive' || locationName === 'Lower archive'
                        ? 'location-archive'
                        : `location-${index}`;
                return (
                  <button
                    className={
                      selectedEntityId === id ? 'selected pp-context-row' : 'pp-context-row'
                    }
                    key={locationName}
                    type="button"
                    onClick={() => openEntity('location', id, locationName)}
                  >
                    <span className="pp-thumb">⌖</span>
                    <span>
                      {locationName}
                      <small>Story location</small>
                    </span>
                    <i>›</i>
                  </button>
                );
              })}
              <button className="pp-side-add" type="button" onClick={() => openEntity('location')}>
                ＋ Add location
              </button>
            </details>
            <details className="pp-side-group">
              <summary>
                <span>Stats</span>
                <b>4</b>
              </summary>
              <button
                className={
                  selectedEntityId === 'stat-trust' ? 'selected pp-stat-context' : 'pp-stat-context'
                }
                type="button"
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
                type="button"
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
                type="button"
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
                type="button"
                onClick={() => openEntity('stat', 'stat-charge')}
              >
                <span className="pp-stat-symbol charge">ϟ</span>
                <span>Charge</span>
                <small>Item stat</small>
              </button>
              <button className="pp-side-add" type="button" onClick={() => openEntity('stat')}>
                ＋ Add stat
              </button>
            </details>
            <details className="pp-side-group">
              <summary>
                <span>Items</span>
                <b>6</b>
              </summary>
              <button
                className={
                  selectedEntityId === 'item-satchel' ? 'selected pp-context-row' : 'pp-context-row'
                }
                type="button"
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
                type="button"
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
                type="button"
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
                type="button"
                onClick={() => openEntity('item', 'item-map')}
              >
                <span className="pp-thumb pp-map">⌁</span>
                <span>
                  Weathered map<small>Document</small>
                </span>
                <i>›</i>
              </button>
              <button className="pp-side-add" type="button" onClick={() => openEntity('item')}>
                ＋ Add item
              </button>
            </details>
          </div>
        </div>
      </aside>
      <main className="pp-workspace">
        <div className="pp-crumb">
          <span>Story</span>
          <b>Graph overview · {scenario.interactions.length} Interactions</b>
          <div />
          <button
            className="secondary"
            type="button"
            onClick={() => openEntity('interaction', scenario.interactions[0]?.id)}
          >
            Select beginning
          </button>
        </div>
        <MemoizedStoryGraph
          scenario={scenario}
          searchQuery={searchQuery}
          focusInteractionIds={focusInteractionIds}
          select={selectGraphEntity}
          onGroupSelection={groupSelection}
          onTriggerSourcesChange={onTriggerSourcesChange}
        />
      </main>
      {rightPanel === 'comments' ? (
        <PrototypeCommentsPanel
          scenario={scenario}
          replies={commentReplies}
          onClose={() => setRightPanel('inspector')}
          onReply={(reply) => setCommentReplies((current) => [...current, reply])}
        />
      ) : selected ? (
        <Inspector
          key={`${scenario.id}-${selected}-${selectedEntityId ?? 'new'}`}
          kind={selected}
          entityId={selectedEntityId}
          entityLabel={selectedEntityLabel}
          scenario={scenario}
          sourceIds={selected === 'trigger' ? triggerSources[selectedEntityId ?? ''] : undefined}
          onOpenComments={() => setRightPanel('comments')}
          onClose={() => {
            setSelected(null);
            setSelectedEntityId(undefined);
            setSelectedEntityLabel(undefined);
          }}
        />
      ) : null}
    </div>
  );
}

export function ParalleaxPrototype() {
  const location = useLocation();
  const navigate = useNavigate();
  const [resetVersion, setResetVersion] = useState(0);
  const scenario = getPrototypeScenario(new URLSearchParams(location.search).get('story'));
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
  return (
    <PrototypeStoryEditor
      key={`${scenario.id}-${resetVersion}`}
      onNavigate={onNavigate}
      onReset={() => setResetVersion((version) => version + 1)}
      scenario={scenario}
    />
  );
}

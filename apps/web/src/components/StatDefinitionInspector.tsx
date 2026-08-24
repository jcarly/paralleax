import {
  getStatValueType,
  type CreateStatDefinitionInput,
  type StatAssignment,
  type StatDefinition,
  type StatValue,
  type Story,
} from '@paralleax/shared';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../api';
import { getStatAssignmentOwners, type StatAssignmentOwner } from '../storyStats';
import { CategoryField } from './CategoryField';
import { ImageUrlField } from './ImageUrlField';
import { StatValueField } from './StatValueField';

function defaultValue(definition: StatDefinition): StatValue {
  const valueType = getStatValueType(definition);
  if (valueType === 'number') return 0;
  if (valueType === 'boolean') return false;
  return '';
}

function ownerLabel(owner: StatAssignmentOwner, t: (key: string) => string) {
  const typeLabel = t(`attributes.owner.${owner.ownerType}`);
  return owner.ownerName ? `${typeLabel} — ${owner.ownerName}` : typeLabel;
}

function AssignmentRow({
  assignment,
  definition,
  label,
  storyId,
  onStory,
  onError,
}: {
  assignment: StatAssignment;
  definition: StatDefinition;
  label: string;
  storyId: string;
  onStory: (story: Story) => void;
  onError: (message: string) => void;
}) {
  const { t } = useTranslation();
  const [value, setValue] = useState<StatValue>(assignment.initialValue);

  return (
    <li className="attribute-assignment-row">
      <span>{label}</span>
      <StatValueField
        ariaLabel={t('attributes.initialValueFor', { owner: label })}
        valueType={getStatValueType(definition)}
        value={value}
        onChange={setValue}
        onBlur={(initialValue) =>
          void api
            .updateStatAssignment(storyId, assignment.id, { initialValue })
            .then(onStory)
            .catch((next: Error) => onError(next.message))
        }
      />
      <button
        aria-label={t('attributes.removeFrom', { owner: label })}
        className="ghost danger"
        type="button"
        onClick={() =>
          void api
            .deleteStatAssignment(storyId, assignment.id)
            .then(onStory)
            .catch((next: Error) => onError(next.message))
        }
      >
        x
      </button>
    </li>
  );
}

function CreateDefinitionForm({
  onCreate,
  onCancel,
  onError,
}: {
  onCreate: (input: CreateStatDefinitionInput) => Promise<string | undefined>;
  onCancel: () => void;
  onError: (message: string) => void;
}) {
  const { t } = useTranslation();
  const [name, setName] = useState('');
  const [valueType, setValueType] = useState<'number' | 'boolean' | 'string'>('number');
  return (
    <form
      className="attribute-definition-create"
      onSubmit={(event) => {
        event.preventDefault();
        void onCreate({ name, valueType }).catch((error: Error) => onError(error.message));
      }}
    >
      <label>
        {t('attributes.name')}
        <input required value={name} onChange={(event) => setName(event.target.value)} />
      </label>
      <label>
        {t('attributes.valueType')}
        <select
          value={valueType}
          onChange={(event) => setValueType(event.target.value as typeof valueType)}
        >
          <option value="number">{t('attributes.type.number')}</option>
          <option value="boolean">{t('attributes.type.boolean')}</option>
          <option value="string">{t('attributes.type.string')}</option>
        </select>
      </label>
      <div className="attribute-definition-create-actions">
        <button type="submit">{t('attributes.create')}</button>
        <button className="ghost" type="button" onClick={onCancel}>
          {t('attributes.cancel')}
        </button>
      </div>
    </form>
  );
}

export function StatDefinitionInspector({
  story,
  statDefinition,
  creating = false,
  categorySuggestions = [],
  onChange,
  onPatch,
  onCreate,
  onStory,
  onClose,
}: {
  story: Story;
  statDefinition?: StatDefinition;
  creating?: boolean;
  categorySuggestions?: string[];
  onChange: (next: StatDefinition) => void;
  onPatch: (
    id: string,
    patch: { name?: string; category?: string; imageUrl?: string; changePerHour?: number },
  ) => Promise<void>;
  onCreate: (input: CreateStatDefinitionInput) => Promise<string | undefined>;
  onStory: (story: Story) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [error, setError] = useState('');
  if (creating) {
    return (
      <div>
        <h3>{t('attributes.addDefinition')}</h3>
        {error ? <p className="error">{error}</p> : null}
        <CreateDefinitionForm onCancel={onClose} onCreate={onCreate} onError={setError} />
      </div>
    );
  }
  if (!statDefinition) return null;

  const owners = getStatAssignmentOwners(story);
  const assignedOwners = owners.flatMap((owner) =>
    owner.assignments
      .filter(({ statDefinitionId }) => statDefinitionId === statDefinition.id)
      .map((assignment) => ({ owner, assignment })),
  );
  const availableOwners = owners.filter(
    (owner) =>
      !owner.assignments.some(({ statDefinitionId }) => statDefinitionId === statDefinition.id),
  );

  return (
    <StatDefinitionEditor
      assignedOwners={assignedOwners}
      availableOwners={availableOwners}
      categorySuggestions={categorySuggestions}
      definition={statDefinition}
      error={error}
      onChange={onChange}
      onClose={onClose}
      onError={setError}
      onPatch={onPatch}
      onStory={onStory}
      story={story}
    />
  );
}

function StatDefinitionEditor({
  story,
  definition,
  assignedOwners,
  availableOwners,
  categorySuggestions,
  error,
  onChange,
  onPatch,
  onStory,
  onError,
  onClose,
}: {
  story: Story;
  definition: StatDefinition;
  assignedOwners: Array<{ owner: StatAssignmentOwner; assignment: StatAssignment }>;
  availableOwners: StatAssignmentOwner[];
  categorySuggestions: string[];
  error: string;
  onChange: (definition: StatDefinition) => void;
  onPatch: (id: string, patch: Partial<StatDefinition>) => Promise<void>;
  onStory: (story: Story) => void;
  onError: (message: string) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [ownerKey, setOwnerKey] = useState(
    availableOwners[0] ? `${availableOwners[0].ownerType}:${availableOwners[0].ownerId ?? ''}` : '',
  );
  const [initialValue, setInitialValue] = useState<StatValue>(defaultValue(definition));
  const selectedOwner =
    availableOwners.find((owner) => `${owner.ownerType}:${owner.ownerId ?? ''}` === ownerKey) ??
    availableOwners[0];
  const valueType = getStatValueType(definition);

  return (
    <div>
      <h3>{t('attributes.inspectorTitle')}</h3>
      {error ? <p className="error">{error}</p> : null}
      <label>
        {t('attributes.definitionName')}
        <input
          value={definition.name}
          onChange={(event) => onChange({ ...definition, name: event.target.value })}
          onBlur={(event) => void onPatch(definition.id, { name: event.target.value })}
        />
      </label>
      <CategoryField
        category={definition.category}
        suggestions={categorySuggestions}
        onChange={(category) => onChange({ ...definition, category })}
        onBlur={(category) => void onPatch(definition.id, { category })}
      />
      <ImageUrlField
        imageUrl={definition.imageUrl}
        onChange={(imageUrl) => onChange({ ...definition, imageUrl })}
        onBlur={(imageUrl) => void onPatch(definition.id, { imageUrl })}
      />
      <label>
        {t('attributes.valueType')}
        <input readOnly value={t(`attributes.type.${valueType}`)} />
      </label>
      {valueType === 'number' ? (
        <label>
          {t('attributes.changePerHour')}
          <input
            step="any"
            type="number"
            value={definition.changePerHour ?? 0}
            onChange={(event) =>
              onChange({ ...definition, changePerHour: Number(event.target.value) })
            }
            onBlur={(event) =>
              void onPatch(definition.id, { changePerHour: Number(event.target.value) })
            }
          />
        </label>
      ) : null}

      <div className="inspector-section-header">
        <h3>{t('attributes.assignmentsTitle')}</h3>
      </div>
      {assignedOwners.length === 0 ? (
        <p className="hint">{t('attributes.noAssignments')}</p>
      ) : (
        <ul className="attribute-assignment-list">
          {assignedOwners.map(({ owner, assignment }) => (
            <AssignmentRow
              assignment={assignment}
              definition={definition}
              key={assignment.id}
              label={ownerLabel(owner, t)}
              onError={onError}
              onStory={onStory}
              storyId={story.id}
            />
          ))}
        </ul>
      )}
      {selectedOwner ? (
        <div className="attribute-assignment-create">
          <label>
            {t('attributes.ownerLabel')}
            <select value={ownerKey} onChange={(event) => setOwnerKey(event.target.value)}>
              {availableOwners.map((owner) => {
                const key = `${owner.ownerType}:${owner.ownerId ?? ''}`;
                return (
                  <option key={key} value={key}>
                    {ownerLabel(owner, t)}
                  </option>
                );
              })}
            </select>
          </label>
          <label>
            {t('attributes.initialValue')}
            <StatValueField
              ariaLabel={t('attributes.initialValue')}
              valueType={getStatValueType(definition)}
              value={initialValue}
              onChange={setInitialValue}
            />
          </label>
          <button
            className="secondary"
            type="button"
            onClick={() =>
              void api
                .createStatAssignment(story.id, {
                  statDefinitionId: definition.id,
                  ownerType: selectedOwner.ownerType,
                  ...(selectedOwner.ownerId ? { ownerId: selectedOwner.ownerId } : {}),
                  initialValue,
                })
                .then(onStory)
                .catch((next: Error) => onError(next.message))
            }
          >
            {t('attributes.assign')}
          </button>
        </div>
      ) : null}
      <button
        className="ghost danger"
        type="button"
        onClick={() => {
          if (!window.confirm(t('attributes.deleteConfirm', { name: definition.name }))) return;
          void api
            .deleteStatDefinition(story.id, definition.id)
            .then((next) => {
              onStory(next);
              onClose();
            })
            .catch((next: Error) => onError(next.message));
        }}
      >
        {t('attributes.deleteDefinition')}
      </button>
    </div>
  );
}

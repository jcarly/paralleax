import type { StatTarget, Story } from '@paralleax/shared';
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type Dispatch,
  type SetStateAction,
} from 'react';
import { useTranslation } from 'react-i18next';
import {
  buildVariableTree,
  findVariablePath,
  getVisibleLevels,
  type VariablePickerLevel,
  type VariablePickerNode,
} from './variablePickerTree';

export type { VariablePickerNode } from './variablePickerTree';

export interface VariablePickerSelection {
  target: StatTarget;
  reference: string;
  label: string;
}

interface VariablePickerProps {
  story: Story;
  selectedTarget?: StatTarget;
  onSelect: (selection: VariablePickerSelection) => void;
  onSelectionClear?: () => void;
  autoFocus?: boolean;
  filter?: (target: StatTarget) => boolean;
  density?: 'standard' | 'compact';
}

interface VariablePickerNavigation {
  sourceKey: string;
  path: string[];
}

interface VariablePickerChangeOptions {
  nodes: VariablePickerNode[];
  depth: number;
  selectedPath: string[];
  sourceKey: string;
  setNavigation: Dispatch<SetStateAction<VariablePickerNavigation>>;
  onSelect: (selection: VariablePickerSelection) => void;
  onSelectionClear?: () => void;
}

function useVariablePickerModel(
  story: Story,
  selectedTarget: StatTarget | undefined,
  filter: ((target: StatTarget) => boolean) | undefined,
) {
  const { t } = useTranslation();
  const roots = useMemo(
    () =>
      buildVariableTree(
        story,
        {
          character: (name) => t('richText.characterVariableOwner', { name }),
          item: (name) => t('richText.itemVariableOwner', { name }),
          location: (name) => t('richText.locationVariableOwner', { name }),
          story: (name) => t('richText.storyVariableOwner', { name }),
          storyPath: t('attributes.owner.story'),
          variable: (name) => t('richText.variableOption', { name }),
        },
        filter,
      ),
    [story, t, filter],
  );
  const sourceKey = `${selectedTarget?.assignment.id ?? ''}:${selectedTarget?.itemId ?? ''}`;
  const [navigation, setNavigation] = useState<VariablePickerNavigation>(() => ({
    sourceKey,
    path: findVariablePath(roots, selectedTarget) ?? [],
  }));
  const selectedPath =
    navigation.sourceKey === sourceKey
      ? navigation.path
      : (findVariablePath(roots, selectedTarget) ?? []);
  return {
    t,
    sourceKey,
    selectedPath,
    levels: getVisibleLevels(roots, selectedPath),
    setNavigation,
  };
}

export function VariablePicker({
  story,
  selectedTarget,
  onSelect,
  onSelectionClear,
  autoFocus = false,
  filter,
  density = 'compact',
}: VariablePickerProps) {
  const { t, sourceKey, selectedPath, levels, setNavigation } = useVariablePickerModel(
    story,
    selectedTarget,
    filter,
  );

  return (
    <div
      aria-label={t('richText.variablePicker')}
      className="rich-text-variable-picker"
      role="group"
    >
      {levels.map((level, depth) => (
        <VariablePickerLevelSelect
          key={level.parent?.id ?? 'owner'}
          level={level}
          depth={depth}
          selectedPath={selectedPath}
          sourceKey={sourceKey}
          density={density}
          focusWhenOpened={autoFocus}
          onSelect={onSelect}
          onSelectionClear={onSelectionClear}
          setNavigation={setNavigation}
        />
      ))}
    </div>
  );
}

function VariablePickerLevelSelect({
  level,
  depth,
  selectedPath,
  sourceKey,
  density,
  focusWhenOpened,
  onSelect,
  onSelectionClear,
  setNavigation,
}: {
  level: VariablePickerLevel;
  depth: number;
  selectedPath: string[];
  sourceKey: string;
  density: 'standard' | 'compact';
  focusWhenOpened: boolean;
  onSelect: (selection: VariablePickerSelection) => void;
  onSelectionClear?: () => void;
  setNavigation: Dispatch<SetStateAction<VariablePickerNavigation>>;
}) {
  const { t } = useTranslation();
  const selectRef = useRef<HTMLSelectElement>(null);
  const selectedId = selectedPath[depth] ?? '';
  const label = level.parent
    ? t('richText.variableOrItemFor', { name: level.parent.name })
    : t('richText.variableOwner');
  useEffect(() => {
    if (focusWhenOpened && depth === 0) {
      selectRef.current?.focus();
    }
  }, [focusWhenOpened, depth]);
  return (
    <label
      className={`form-field form-field--${density} rich-text-variable-field`}
      key={level.parent?.id ?? 'owner'}
    >
      <select
        ref={selectRef}
        className={`form-control form-control--${density}`}
        aria-label={label}
        data-modal-autofocus={focusWhenOpened && depth === 0 ? '' : undefined}
        value={selectedId}
        onChange={(event) => {
          handleVariablePickerChange(event, {
            nodes: level.nodes,
            depth,
            selectedPath,
            sourceKey,
            setNavigation,
            onSelect,
            onSelectionClear,
          });
        }}
      >
        <option value="" disabled>
          {level.parent ? t('richText.chooseVariableOrItem') : t('richText.chooseVariableOwner')}
        </option>
        {level.nodes.map((node) => (
          <option key={node.id} value={node.id}>
            {node.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function handleVariablePickerChange(
  event: ChangeEvent<HTMLSelectElement>,
  options: VariablePickerChangeOptions,
) {
  const { nodes, depth, selectedPath, sourceKey, setNavigation, onSelect, onSelectionClear } =
    options;
  const selected = nodes.find(({ id }) => id === event.target.value);
  if (!selected) {
    return;
  }
  const path = [...selectedPath.slice(0, depth), selected.id];
  setNavigation({ sourceKey, path });
  if (selected.kind === 'variable') {
    onSelect({
      target: selected.target,
      reference: selected.reference,
      label: selected.displayLabel,
    });
    return;
  }
  onSelectionClear?.();
}

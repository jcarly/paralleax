import type { StatTarget, Story } from '@paralleax/shared';
import { VariablePicker, type VariablePickerSelection } from './VariablePicker';

export type RichTextVariableSelection = VariablePickerSelection;

export function RichTextVariablePicker({
  story,
  selectedTarget,
  onSelect,
  onSelectionClear,
  autoFocus = false,
  filter,
}: {
  story: Story;
  selectedTarget?: StatTarget;
  onSelect: (selection: RichTextVariableSelection) => void;
  onSelectionClear?: () => void;
  autoFocus?: boolean;
  filter?: (target: StatTarget) => boolean;
}) {
  return (
    <VariablePicker
      story={story}
      selectedTarget={selectedTarget}
      autoFocus={autoFocus}
      filter={filter}
      onSelect={onSelect}
      onSelectionClear={onSelectionClear}
    />
  );
}

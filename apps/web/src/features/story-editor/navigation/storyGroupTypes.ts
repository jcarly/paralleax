import type { Story, UpdateGroupInput } from '@paralleax/shared';

export interface StoryGroupsPanelProps {
  story: Story;
  searchQuery: string;
  matchingInteractionIds: string[];
  open: boolean;
  onToggle: () => void;
  onAdd: () => void;
  selectedGroupId?: string;
  selectedInteractionId?: string;
  editingGroupId?: string;
  selectionIds: string[];
  readOnly: boolean;
  onSelect: (groupId: string) => void;
  onSelectInteraction: (interactionId: string) => void;
  onFocus: (interactionIds: string[]) => void;
  onSelectInteractions: (interactionIds: string[]) => void;
  onEditingChange: (groupId?: string) => void;
  onCreate: (
    title: string,
    interactionIds: string[],
    parentGroupId?: string,
  ) => Promise<string | false>;
  onUpdate: (groupId: string, input: UpdateGroupInput) => Promise<boolean>;
  onDelete: (groupId: string) => Promise<boolean>;
}

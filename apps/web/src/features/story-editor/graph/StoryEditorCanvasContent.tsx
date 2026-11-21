import { Background, Controls, ReactFlow, type ReactFlowProps } from '@xyflow/react';
import { useTranslation } from 'react-i18next';
import type { Dispatch, SetStateAction } from 'react';
import type { Story } from '@paralleax/shared';
import { StoryCanvasContextMenu } from '../../../components/StoryCanvasContextMenu';
import { StoryCanvasToolbar } from '../../../components/StoryCanvasToolbar';
import type { useStoryEditorPersistence } from '../../../hooks/useStoryEditorPersistence';
import type { StoryFlowNode, TriggerFlowEdge } from '../../../storyGraph';
import type { StoryGraphLayoutTarget } from '../../../storyGraphLayout';
import { StoryHistoryPanel } from '../history/StoryHistoryPanel';
import type { CanvasContextMenuState } from './storyEditorPointerActions';
import type { StoryEditorCanvasMenuActionProps } from './storyEditorCanvasActions';

type StoryCanvasHistoryProps = {
  open: boolean;
  history: ReturnType<typeof useStoryEditorPersistence>['history'];
  busy: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onClose: () => void;
};

function StoryCanvasConnectionAlert({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  return open ? (
    <div
      className="save-error graph-connection-alert"
      role="alert"
      data-testid="trigger-connection-conflict"
    >
      <span>{t('editor.triggerConnectionExists')}</span>
      <button
        className="secondary"
        type="button"
        aria-label={t('editor.dismissConnectionConflict')}
        onClick={onClose}
      >
        ×
      </button>
    </div>
  ) : null;
}

function StoryCanvasHistoryLayer(props: StoryCanvasHistoryProps) {
  return props.open ? (
    <StoryHistoryPanel
      history={props.history}
      busy={props.busy}
      onUndo={props.onUndo}
      onRedo={props.onRedo}
      onClose={props.onClose}
    />
  ) : null;
}

export type StoryEditorCanvasViewModel = {
  isOrganizing: boolean;
  connectionConflict: boolean;
  setConnectionConflict: Dispatch<SetStateAction<boolean>>;
  story: Story;
  reviewOnly: boolean;
  toolbarProps: React.ComponentProps<typeof StoryCanvasToolbar>;
  historyProps: React.ComponentProps<typeof StoryCanvasHistoryLayer>;
  contextMenu?: {
    state: CanvasContextMenuState;
    actions: StoryEditorCanvasMenuActionProps;
  };
  flowProps: ReactFlowProps<StoryFlowNode, TriggerFlowEdge>;
  selectedLayoutTargets: StoryGraphLayoutTarget[];
};

function StoryEditorCanvasToolbar({
  toolbarProps,
  historyProps,
}: Pick<StoryEditorCanvasViewModel, 'toolbarProps' | 'historyProps'>) {
  return (
    <>
      <StoryCanvasToolbar {...toolbarProps} />
      <StoryCanvasHistoryLayer {...historyProps} />
    </>
  );
}

function StoryEditorCanvasMenu({
  contextMenu: menu,
  story,
  reviewOnly,
  isOrganizing,
  selectedLayoutTargets,
}: Pick<
  StoryEditorCanvasViewModel,
  'contextMenu' | 'story' | 'reviewOnly' | 'isOrganizing' | 'selectedLayoutTargets'
>) {
  if (!menu) {
    return null;
  }
  return (
    <StoryCanvasContextMenu
      position={menu.state.screenPosition}
      targetKind={menu.state.target.kind}
      canEdit={!reviewOnly}
      canComment={story.capabilities?.canComment === true}
      canOrganize={story.interactions.length > 0 && !isOrganizing}
      organizeSelectionCount={selectedLayoutTargets.length}
      {...menu.actions}
    />
  );
}

function StoryEditorFlow({
  flowProps,
  onInit,
}: {
  flowProps: ReactFlowProps<StoryFlowNode, TriggerFlowEdge>;
  onInit: NonNullable<ReactFlowProps<StoryFlowNode, TriggerFlowEdge>['onInit']>;
}) {
  return (
    <ReactFlow {...flowProps} onInit={onInit}>
      <Background />
      <Controls orientation="horizontal" />
    </ReactFlow>
  );
}

export function StoryEditorCanvasContent({
  model,
  onInit,
}: {
  model: StoryEditorCanvasViewModel;
  onInit: NonNullable<ReactFlowProps<StoryFlowNode, TriggerFlowEdge>['onInit']>;
}) {
  return (
    <>
      <StoryCanvasConnectionAlert
        open={model.connectionConflict}
        onClose={() => {
          model.setConnectionConflict(false);
        }}
      />
      <StoryEditorCanvasToolbar
        toolbarProps={model.toolbarProps}
        historyProps={model.historyProps}
      />
      <StoryEditorCanvasMenu
        contextMenu={model.contextMenu}
        story={model.story}
        reviewOnly={model.reviewOnly}
        isOrganizing={model.isOrganizing}
        selectedLayoutTargets={model.selectedLayoutTargets}
      />
      <StoryEditorFlow flowProps={model.flowProps} onInit={onInit} />
    </>
  );
}

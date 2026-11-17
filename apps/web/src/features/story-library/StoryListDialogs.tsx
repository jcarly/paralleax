import { lazy, Suspense, type FormEvent, type KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';
import type { StorySummary } from '@paralleax/shared';
import { handleModalDialogKeyDown } from '../../components/modalDialogKeyboard';
import { ModalPortal } from '../../components/ModalPortal';

const StoryImportDialogComponent = lazy(() =>
  import('../story-import/StoryImportDialog').then(({ StoryImportDialog: Dialog }) => ({
    default: Dialog,
  })),
);

type PendingAction = 'story' | 'demo' | '';

export function StoryListDialogs({
  creating,
  importing,
  isAuthenticated,
  isAdministrator,
  pending,
  newTitle,
  setNewTitle,
  createStory,
  closeCreationDialog,
  closeImportDialog,
  onImported,
}: {
  creating: boolean;
  importing: boolean;
  isAuthenticated: boolean;
  isAdministrator: boolean;
  pending: PendingAction;
  newTitle: string;
  setNewTitle: (title: string) => void;
  createStory: (event: FormEvent) => void;
  closeCreationDialog: () => void;
  closeImportDialog: () => void;
  onImported: (story: StorySummary) => void;
}) {
  return (
    <>
      {creating && isAuthenticated ? (
        <StoryCreationDialog
          pending={pending}
          newTitle={newTitle}
          setNewTitle={setNewTitle}
          createStory={createStory}
          closeCreationDialog={closeCreationDialog}
        />
      ) : null}
      {importing && isAuthenticated ? (
        <Suspense fallback={null}>
          <StoryImportDialogComponent
            isAdministrator={isAdministrator}
            onClose={closeImportDialog}
            onImported={onImported}
          />
        </Suspense>
      ) : null}
    </>
  );
}

function StoryCreationDialog({
  pending,
  newTitle,
  setNewTitle,
  createStory,
  closeCreationDialog,
}: {
  pending: PendingAction;
  newTitle: string;
  setNewTitle: (title: string) => void;
  createStory: (event: FormEvent) => void;
  closeCreationDialog: () => void;
}) {
  const { t } = useTranslation();
  return (
    <ModalPortal>
      <div className="modal-backdrop product-page" role="presentation">
        <dialog
          open
          className="new-story-dialog"
          aria-modal="true"
          aria-label={t('library.dialog.title')}
          onKeyDown={(event) => {
            handleCreationDialogKeyDown(event, pending, closeCreationDialog);
          }}
        >
          <StoryCreationForm
            pending={pending}
            newTitle={newTitle}
            setNewTitle={setNewTitle}
            createStory={createStory}
            closeCreationDialog={closeCreationDialog}
          />
        </dialog>
      </div>
    </ModalPortal>
  );
}

function handleCreationDialogKeyDown(
  event: KeyboardEvent<HTMLElement>,
  pending: PendingAction,
  close: () => void,
) {
  handleModalDialogKeyDown(event, () => {
    if (pending !== 'story') {
      close();
    }
  });
}

function StoryCreationForm({
  pending,
  newTitle,
  setNewTitle,
  createStory,
  closeCreationDialog,
}: {
  pending: PendingAction;
  newTitle: string;
  setNewTitle: (title: string) => void;
  createStory: (event: FormEvent) => void;
  closeCreationDialog: () => void;
}) {
  const { t } = useTranslation();
  return (
    <form onSubmit={createStory}>
      <label className="form-field form-field--standard">
        <span>{t('library.dialog.storyTitle')}</span>
        <input
          className="form-control form-control--standard"
          data-modal-autofocus
          placeholder={t('library.dialog.placeholder')}
          value={newTitle}
          onChange={(event) => {
            setNewTitle(event.target.value);
          }}
        />
      </label>
      <div className="dialog-actions">
        <button
          className="product-secondary"
          type="button"
          disabled={pending === 'story'}
          onClick={closeCreationDialog}
        >
          {t('library.dialog.cancel')}
        </button>
        <button
          className="product-primary"
          type="submit"
          disabled={newTitle.trim() === '' || pending === 'story'}
        >
          {t(pending === 'story' ? 'library.dialog.creating' : 'library.dialog.submit')}
        </button>
      </div>
    </form>
  );
}

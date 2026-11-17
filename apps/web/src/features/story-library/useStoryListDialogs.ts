import { useRef, useState } from 'react';

export function useStoryListDialogs(setError: (error: string) => void) {
  const [creating, setCreating] = useState(false);
  const [importing, setImporting] = useState(false);
  const creationDialogTrigger = useRef<HTMLElement | null>(null);
  const importDialogTrigger = useRef<HTMLElement | null>(null);

  function openCreationDialog(trigger: HTMLElement) {
    creationDialogTrigger.current = trigger;
    setError('');
    setCreating(true);
  }

  function closeCreationDialog() {
    setCreating(false);
    window.requestAnimationFrame(() => creationDialogTrigger.current?.focus());
  }

  function openImportDialog(trigger: HTMLElement) {
    importDialogTrigger.current = trigger;
    setError('');
    setImporting(true);
  }

  function closeImportDialog() {
    setImporting(false);
    window.requestAnimationFrame(() => importDialogTrigger.current?.focus());
  }

  return {
    creating,
    importing,
    openCreationDialog,
    closeCreationDialog,
    openImportDialog,
    closeImportDialog,
  };
}

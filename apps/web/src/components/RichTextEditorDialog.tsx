import type { ReactNode } from 'react';
import { ModalDialog } from './ModalDialog';

/** Rich-text editing dialog: the shared modal shell plus the field styles scoped to `rich-text-editor-dialog`. */
export function RichTextEditorDialog({
  className,
  ...props
}: {
  title: string;
  description: string;
  closeLabel: string;
  className?: string;
  children: ReactNode;
  onCancel: () => void;
}) {
  return (
    <ModalDialog
      {...props}
      className={`rich-text-editor-dialog${className ? ` ${className}` : ''}`}
    />
  );
}

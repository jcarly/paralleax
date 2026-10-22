import { useLayoutEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { isolateModalDialog } from './modalDialogIsolation';
import { ModalPortalContext } from './modalPortalContext';

/** Owns modal layering and background isolation, leaving cancellation to the dialog. */
export function ModalPortal({ children }: { children: ReactNode }) {
  const portalRef = useRef<HTMLDivElement>(null);
  const openerRef = useRef(document.activeElement);

  useLayoutEffect(() => {
    const portal = portalRef.current;
    if (portal) return isolateModalDialog(portal, openerRef.current);
  }, []);

  return createPortal(
    <div
      className="modal-portal"
      ref={portalRef}
      tabIndex={-1}
      onKeyDown={(event) => event.stopPropagation()}
      onKeyUp={(event) => event.stopPropagation()}
      onMouseDown={(event) => event.stopPropagation()}
      onClick={(event) => event.stopPropagation()}
    >
      <ModalPortalContext.Provider value={portalRef}>{children}</ModalPortalContext.Provider>
    </div>,
    document.body,
  );
}

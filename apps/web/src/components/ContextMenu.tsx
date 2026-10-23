import { useEffect, useLayoutEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

/** Shared canvas/context-list menu surface and keyboard navigation. */
export function ContextMenu({
  position,
  label,
  onClose,
  children,
  scrollable = false,
}: {
  position: { x: number; y: number };
  label: string;
  onClose: () => void;
  children: ReactNode;
  scrollable?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  useLayoutEffect(() => {
    close.current = onClose;
  });
  useLayoutEffect(() => {
    const menu = ref.current!;
    const bounds = menu.getBoundingClientRect();
    menu.style.left = `${Math.max(8, Math.min(position.x, window.innerWidth - bounds.width - 8))}px`;
    menu.style.top = `${Math.max(8, Math.min(position.y, window.innerHeight - bounds.height - 8))}px`;
  }, [position]);
  useEffect(() => {
    const menu = ref.current;
    const previous = document.activeElement as HTMLElement | null;
    ref.current?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus();
    const outside = (event: PointerEvent) => {
      if (!ref.current?.contains(event.target as Node)) close.current();
    };
    const dismiss = () => close.current();
    const escape = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') close.current();
    };
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', escape);
    window.addEventListener('blur', dismiss);
    window.addEventListener('resize', dismiss);
    return () => {
      document.removeEventListener('pointerdown', outside);
      document.removeEventListener('keydown', escape);
      window.removeEventListener('blur', dismiss);
      window.removeEventListener('resize', dismiss);
      if (document.activeElement === document.body || menu?.contains(document.activeElement))
        previous?.focus();
    };
  }, []);
  return createPortal(
    <div
      ref={ref}
      role="menu"
      aria-label={label}
      className={`canvas-context-menu${scrollable ? ' scrollable' : ''}`}
      style={{
        left: position.x,
        top: position.y,
        maxHeight: scrollable ? 'calc(100vh - 16px)' : undefined,
        overflowY: scrollable ? 'auto' : undefined,
      }}
      onContextMenu={(event) => event.preventDefault()}
      onKeyDown={(event) => {
        if (event.key === 'Escape' || event.key === 'Tab') {
          event.stopPropagation();
          close.current();
          return;
        }
        if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
        event.preventDefault();
        event.stopPropagation();
        const buttons = [
          ...ref.current!.querySelectorAll<HTMLButtonElement>('button:not(:disabled)'),
        ];
        const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
        const next =
          event.key === 'Home'
            ? 0
            : event.key === 'End'
              ? buttons.length - 1
              : (index + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length;
        buttons[next]?.focus();
      }}
    >
      {children}
    </div>,
    document.body,
  );
}

export function ContextMenuAction({
  icon,
  label,
  disabled = false,
  suffix,
  ariaExpanded,
  ariaHasPopup,
  danger = false,
  onClick,
  onKeyDown,
}: {
  icon?: ReactNode;
  label: string;
  disabled?: boolean;
  suffix?: ReactNode;
  ariaExpanded?: boolean;
  ariaHasPopup?: 'menu';
  danger?: boolean;
  onClick: () => void;
  onKeyDown?: (event: React.KeyboardEvent<HTMLButtonElement>) => void;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      className={danger ? 'danger' : undefined}
      disabled={disabled}
      aria-expanded={ariaExpanded}
      aria-haspopup={ariaHasPopup}
      onClick={onClick}
      onKeyDown={onKeyDown}
    >
      {icon ?? <span className="canvas-context-icon-spacer" />}
      <span>{label}</span>
      {suffix}
    </button>
  );
}

import { createPortal } from 'react-dom';
import type { KeyboardEvent as ReactKeyboardEvent, ReactElement, ReactNode } from 'react';
import { useContext, useEffect, useId, useRef, useState } from 'react';
import { ModalPortalContext } from './modalPortalContext';

export type FieldHelpTooltipTriggerProps = {
  ref: (element: HTMLElement | null) => void;
  'aria-describedby': string;
  'aria-label': string;
  className: string;
  onBlur: () => void;
  onFocus: () => void;
  onKeyDown: (event: ReactKeyboardEvent<HTMLElement>) => void;
  onPointerEnter: () => void;
  onPointerLeave: () => void;
};

type FieldHelpTooltipTriggerElement = ReactElement<{
  href?: string;
  to?: string;
  download?: boolean;
  disabled?: boolean;
  type?: 'button' | 'submit' | 'reset';
}>;

type FieldHelpTooltipTriggerRenderer = (children: ReactNode) => FieldHelpTooltipTriggerElement;

function resolveTriggerRenderer(
  renderTrigger: FieldHelpTooltipTriggerRenderer | undefined,
  disabled: boolean | undefined,
  onClick: (() => void) | undefined,
): FieldHelpTooltipTriggerRenderer {
  if (renderTrigger) {
    return renderTrigger;
  }
  return (children) => (
    <button disabled={disabled} type="button" onClick={onClick}>
      {children ?? '?'}
    </button>
  );
}

export function FieldHelpTooltip({
  label,
  help,
  children,
  className,
  disabled,
  onClick,
  onTriggerFocus = () => undefined,
  onTriggerPointerEnter = () => undefined,
  renderTrigger,
}: {
  label: string;
  help: string;
  children?: ReactNode;
  className?: string;
  disabled?: boolean;
  onClick?: () => void;
  onTriggerFocus?: () => void;
  onTriggerPointerEnter?: () => void;
  renderTrigger?: (children: ReactNode) => FieldHelpTooltipTriggerElement;
}) {
  const modalPortal = useContext(ModalPortalContext);
  const tooltipId = useId();
  const triggerRef = useRef<HTMLElement | null>(null);
  const tooltipRef = useRef<HTMLSpanElement>(null);
  const closeTimerRef = useRef<number | undefined>(undefined);
  const triggerHoveredRef = useRef(false);
  const tooltipHoveredRef = useRef(false);
  const triggerFocusedRef = useRef(false);
  const dismissedByEscapeRef = useRef(false);
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState({ left: 0, top: 0 });

  function updatePosition() {
    const trigger = triggerRef.current;
    if (!trigger) {
      return;
    }
    const bounds = trigger.getBoundingClientRect();
    const gutter = 12;
    const tooltipWidth = tooltipRef.current?.offsetWidth ?? 288;
    const tooltipHeight = tooltipRef.current?.offsetHeight ?? 96;
    const maxLeft = Math.max(gutter, window.innerWidth - tooltipWidth - gutter);
    const maxTop = Math.max(gutter, window.innerHeight - tooltipHeight - gutter);
    setPosition({
      left: Math.min(Math.max(gutter, bounds.left), maxLeft),
      top: Math.min(Math.max(gutter, bounds.bottom + 6), maxTop),
    });
  }

  function showTooltip() {
    if (closeTimerRef.current !== undefined) {
      window.clearTimeout(closeTimerRef.current);
      closeTimerRef.current = undefined;
    }
    dismissedByEscapeRef.current = false;
    updatePosition();
    setOpen(true);
  }

  function scheduleTooltipClose() {
    if (closeTimerRef.current !== undefined) {
      window.clearTimeout(closeTimerRef.current);
    }
    closeTimerRef.current = window.setTimeout(() => {
      closeTimerRef.current = undefined;
      const shouldStayOpen =
        !dismissedByEscapeRef.current &&
        (triggerFocusedRef.current || triggerHoveredRef.current || tooltipHoveredRef.current);
      setOpen(shouldStayOpen);
    }, 160);
  }

  function dismissTooltip(event: ReactKeyboardEvent<HTMLElement>) {
    if (event.key !== 'Escape' || !open) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    if (closeTimerRef.current !== undefined) {
      window.clearTimeout(closeTimerRef.current);
      closeTimerRef.current = undefined;
    }
    dismissedByEscapeRef.current = true;
    setOpen(false);
  }

  useEffect(
    () => () => {
      if (closeTimerRef.current !== undefined) {
        window.clearTimeout(closeTimerRef.current);
      }
    },
    [],
  );

  useEffect(() => {
    if (!open) {
      return;
    }
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [open]);

  const triggerProps: FieldHelpTooltipTriggerProps = {
    ref: (element: HTMLElement | null) => {
      triggerRef.current = element;
    },
    'aria-describedby': tooltipId,
    'aria-label': children === undefined ? `? — ${label}` : label,
    className: `field-help-tooltip-trigger${className ? ` ${className}` : ''}`,
    onBlur: () => {
      triggerFocusedRef.current = false;
      scheduleTooltipClose();
    },
    onFocus: () => {
      triggerFocusedRef.current = true;
      showTooltip();
      onTriggerFocus();
    },
    onKeyDown: dismissTooltip,
    onPointerEnter: () => {
      triggerHoveredRef.current = true;
      showTooltip();
      onTriggerPointerEnter();
    },
    onPointerLeave: () => {
      triggerHoveredRef.current = false;
      scheduleTooltipClose();
    },
  };

  const triggerElement = resolveTriggerRenderer(renderTrigger, disabled, onClick)(children);
  const Trigger = triggerElement.type;
  const trigger = (
    <Trigger key={triggerElement.key ?? undefined} {...triggerElement.props} {...triggerProps} />
  );

  return (
    <>
      {trigger}
      {createPortal(
        <span
          className={`field-help-tooltip-content${open ? ' is-visible' : ''}`}
          id={tooltipId}
          role="tooltip"
          ref={tooltipRef}
          style={{ left: position.left, top: position.top }}
          onPointerEnter={() => {
            tooltipHoveredRef.current = true;
            showTooltip();
          }}
          onPointerLeave={() => {
            tooltipHoveredRef.current = false;
            scheduleTooltipClose();
          }}
        >
          {help}
        </span>,
        modalPortal?.current ?? document.body,
      )}
    </>
  );
}

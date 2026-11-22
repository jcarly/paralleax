import { createPortal } from 'react-dom';
import type { KeyboardEvent as ReactKeyboardEvent, ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useContext, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { ModalPortalContext } from './modalPortalContext';

export function FieldHelpTooltip({
  label,
  help,
  children,
  className,
  disabled,
  onClick,
  to,
  href,
  onPreload,
}: {
  label: string;
  help: string;
  children?: ReactNode;
  className?: string;
  disabled?: boolean;
  onClick?: () => void;
  /** Renders the trigger as a router link (`to`) or a download link (`href`) instead of a button. */
  to?: string;
  href?: string;
  /** Called when a link trigger is hovered or focused, to preload its route. */
  onPreload?: () => void;
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
    const reposition = () => {
      updatePosition();
    };
    window.addEventListener('resize', reposition);
    window.addEventListener('scroll', reposition, true);
    return () => {
      window.removeEventListener('resize', reposition);
      window.removeEventListener('scroll', reposition, true);
    };
  }, [open]);

  useLayoutEffect(() => {
    if (open) {
      updatePosition();
    }
  }, [open]);

  const triggerProps = {
    ref: (element: HTMLElement | null) => {
      triggerRef.current = element;
    },
    'aria-describedby': tooltipId,
    'aria-label':
      children === undefined && to === undefined && href === undefined ? `? — ${label}` : label,
    className: `field-help-tooltip-trigger${className ? ` ${className}` : ''}`,
    onBlur: () => {
      triggerFocusedRef.current = false;
      scheduleTooltipClose();
    },
    onFocus: () => {
      triggerFocusedRef.current = true;
      onPreload?.();
      showTooltip();
    },
    onKeyDown: dismissTooltip,
    onPointerEnter: () => {
      triggerHoveredRef.current = true;
      onPreload?.();
      showTooltip();
    },
    onPointerLeave: () => {
      triggerHoveredRef.current = false;
      scheduleTooltipClose();
    },
  };

  return (
    <>
      <FieldHelpTrigger
        triggerProps={triggerProps}
        to={to}
        href={href}
        disabled={disabled}
        onClick={onClick}
      >
        {children}
      </FieldHelpTrigger>
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

function FieldHelpTrigger({
  triggerProps,
  to,
  href,
  disabled,
  onClick,
  children,
}: {
  triggerProps: Record<string, unknown>;
  to?: string;
  href?: string;
  disabled?: boolean;
  onClick?: () => void;
  children?: ReactNode;
}) {
  if (to !== undefined) {
    return (
      <Link {...triggerProps} to={to}>
        {children}
      </Link>
    );
  }
  if (href !== undefined) {
    return (
      <a {...triggerProps} href={href} download>
        {children}
      </a>
    );
  }
  return (
    <button {...triggerProps} disabled={disabled} type="button" onClick={onClick}>
      {children ?? '?'}
    </button>
  );
}

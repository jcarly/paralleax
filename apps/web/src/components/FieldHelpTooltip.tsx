import { createPortal } from 'react-dom';
import type { KeyboardEvent as ReactKeyboardEvent } from 'react';
import { useContext, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { ModalPortalContext } from './modalPortalContext';

export function FieldHelpTooltip({ label, help }: { label: string; help: string }) {
  const modalPortal = useContext(ModalPortalContext);
  const tooltipId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
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
    if (!trigger) return;
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
    if (closeTimerRef.current !== undefined) window.clearTimeout(closeTimerRef.current);
    closeTimerRef.current = window.setTimeout(() => {
      closeTimerRef.current = undefined;
      const shouldStayOpen =
        !dismissedByEscapeRef.current &&
        (triggerFocusedRef.current || triggerHoveredRef.current || tooltipHoveredRef.current);
      setOpen(shouldStayOpen);
    }, 160);
  }

  function dismissTooltip(event: ReactKeyboardEvent<HTMLButtonElement>) {
    if (event.key !== 'Escape' || !open) return;
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
      if (closeTimerRef.current !== undefined) window.clearTimeout(closeTimerRef.current);
    },
    [],
  );

  useEffect(() => {
    if (!open) return;
    const reposition = () => updatePosition();
    window.addEventListener('resize', reposition);
    window.addEventListener('scroll', reposition, true);
    return () => {
      window.removeEventListener('resize', reposition);
      window.removeEventListener('scroll', reposition, true);
    };
  }, [open]);

  useLayoutEffect(() => {
    if (open) updatePosition();
  }, [open]);

  return (
    <>
      <button
        aria-describedby={tooltipId}
        aria-label={`? — ${label}`}
        className="field-help-tooltip-trigger"
        ref={triggerRef}
        type="button"
        onBlur={() => {
          triggerFocusedRef.current = false;
          scheduleTooltipClose();
        }}
        onFocus={() => {
          triggerFocusedRef.current = true;
          showTooltip();
        }}
        onKeyDown={dismissTooltip}
        onPointerEnter={() => {
          triggerHoveredRef.current = true;
          showTooltip();
        }}
        onPointerLeave={() => {
          triggerHoveredRef.current = false;
          scheduleTooltipClose();
        }}
      >
        ?
      </button>
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

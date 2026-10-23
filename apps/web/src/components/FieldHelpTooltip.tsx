import { createPortal } from 'react-dom';
import { useContext, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { ModalPortalContext } from './modalPortalContext';

export function FieldHelpTooltip({ label, help }: { label: string; help: string }) {
  const modalPortal = useContext(ModalPortalContext);
  const tooltipId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const tooltipRef = useRef<HTMLSpanElement>(null);
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
    updatePosition();
    setOpen(true);
  }

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
        onBlur={() => setOpen(false)}
        onFocus={showTooltip}
        onMouseEnter={showTooltip}
        onMouseLeave={() => setOpen(false)}
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
        >
          {help}
        </span>,
        modalPortal?.current ?? document.body,
      )}
    </>
  );
}

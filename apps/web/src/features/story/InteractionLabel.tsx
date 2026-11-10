import type { InputHTMLAttributes, ReactNode } from 'react';

export function InteractionLabel({
  label,
  className = '',
  heading = false,
  leadingIcon,
  suffix,
  editable,
  onActivate,
  dataCommentField,
  ariaLabel,
}: {
  label: string;
  className?: string;
  heading?: boolean;
  leadingIcon?: string;
  suffix?: ReactNode;
  editable?: InputHTMLAttributes<HTMLInputElement>;
  onActivate?: () => void;
  dataCommentField?: string;
  ariaLabel?: string;
}) {
  const classes = `interaction-label-bubble ${className}`.trim();
  if (onActivate) {
    return (
      <div
        className={classes}
        aria-label={editable ? undefined : ariaLabel}
        data-comment-field={dataCommentField}
        onClick={onActivate}
        onKeyDown={(event) => {
          if (editable || (event.key !== 'Enter' && event.key !== ' ')) return;
          event.preventDefault();
          onActivate();
        }}
        role={editable ? undefined : 'button'}
        tabIndex={editable ? undefined : 0}
      >
        {leadingIcon ? (
          <span aria-hidden="true" className="interaction-label-leading">
            {leadingIcon}
          </span>
        ) : null}
        {editable ? (
          <input
            {...editable}
            className={`form-control form-control--compact interaction-label-bubble-editable ${
              editable.className ?? ''
            }`.trim()}
          />
        ) : (
          <span>{label}</span>
        )}
        {suffix}
      </div>
    );
  }

  if (editable) {
    return (
      <input
        {...editable}
        className={`form-control form-control--compact ${classes} interaction-label-bubble-editable`}
      />
    );
  }

  if (heading) {
    return (
      <h1 className={classes}>
        {leadingIcon ? (
          <span aria-hidden="true" className="interaction-label-leading">
            {leadingIcon}
          </span>
        ) : null}
        <span>{label}</span>
        {suffix}
      </h1>
    );
  }

  return (
    <span className={classes}>
      {leadingIcon ? (
        <span aria-hidden="true" className="interaction-label-leading">
          {leadingIcon}
        </span>
      ) : null}
      <span>{label}</span>
      {suffix}
    </span>
  );
}

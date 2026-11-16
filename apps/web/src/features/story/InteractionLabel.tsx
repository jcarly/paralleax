import type { InputHTMLAttributes, KeyboardEvent, ReactNode } from 'react';

interface InteractionLabelProps {
  label: string;
  className?: string;
  heading?: boolean;
  leadingIcon?: string;
  suffix?: ReactNode;
  editable?: InputHTMLAttributes<HTMLInputElement>;
  onActivate?: () => void;
  dataCommentField?: string;
  ariaLabel?: string;
}

interface InteractiveInteractionLabelProps extends InteractionLabelProps {
  classes: string;
  onActivate: () => void;
}

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
}: InteractionLabelProps) {
  const classes = `interaction-label-bubble ${className}`.trim();
  if (onActivate) {
    return (
      <InteractiveInteractionLabel
        label={label}
        classes={classes}
        leadingIcon={leadingIcon}
        suffix={suffix}
        editable={editable}
        onActivate={onActivate}
        dataCommentField={dataCommentField}
        ariaLabel={ariaLabel}
      />
    );
  }

  if (editable) {
    return <EditableInteractionLabel editable={editable} classes={classes} />;
  }

  const contents = (
    <InteractionLabelContents label={label} leadingIcon={leadingIcon} suffix={suffix} />
  );
  return heading ? (
    <h1 className={classes}>{contents}</h1>
  ) : (
    <span className={classes}>{contents}</span>
  );
}

function InteractiveInteractionLabel({
  label,
  classes,
  leadingIcon,
  suffix,
  editable,
  onActivate,
  dataCommentField,
  ariaLabel,
}: InteractiveInteractionLabelProps) {
  return (
    <div
      className={classes}
      aria-label={editable ? undefined : ariaLabel}
      data-comment-field={dataCommentField}
      onClick={onActivate}
      onKeyDown={(event) => handleInteractionLabelKeyDown(event, onActivate, editable)}
      role={editable ? undefined : 'button'}
      tabIndex={editable ? undefined : 0}
    >
      <InteractionLabelLeadingIcon leadingIcon={leadingIcon} />
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

function handleInteractionLabelKeyDown(
  event: KeyboardEvent<HTMLDivElement>,
  onActivate: () => void,
  editable: InputHTMLAttributes<HTMLInputElement> | undefined,
) {
  if (editable || (event.key !== 'Enter' && event.key !== ' ')) {
    return;
  }
  event.preventDefault();
  onActivate();
}

function EditableInteractionLabel({
  editable,
  classes,
}: {
  editable: InputHTMLAttributes<HTMLInputElement>;
  classes: string;
}) {
  return (
    <input
      {...editable}
      className={`form-control form-control--compact ${classes} interaction-label-bubble-editable`}
    />
  );
}

function InteractionLabelContents({
  label,
  leadingIcon,
  suffix,
}: Pick<InteractionLabelProps, 'label' | 'leadingIcon' | 'suffix'>) {
  return (
    <>
      <InteractionLabelLeadingIcon leadingIcon={leadingIcon} />
      <span>{label}</span>
      {suffix}
    </>
  );
}

function InteractionLabelLeadingIcon({ leadingIcon }: { leadingIcon?: string }) {
  if (!leadingIcon) {
    return null;
  }
  return (
    <span aria-hidden="true" className="interaction-label-leading">
      {leadingIcon}
    </span>
  );
}

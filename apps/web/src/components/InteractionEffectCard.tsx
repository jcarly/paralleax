import type { ReactNode } from 'react';

export function InteractionEffectCard({
  title,
  removeAction,
  children,
}: {
  title: ReactNode;
  removeAction: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="interaction-effect-card">
      <strong className="interaction-effect-title">{title}</strong>
      {removeAction}
      <div className="interaction-effect-fields">{children}</div>
    </div>
  );
}

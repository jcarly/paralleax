const sectionLinks = [
  { id: 'principles', label: 'Principles' },
  { id: 'foundations', label: 'Foundations' },
  { id: 'actions', label: 'Actions' },
  { id: 'forms', label: 'Forms' },
  { id: 'navigation', label: 'Navigation' },
  { id: 'narrative', label: 'Narrative UI' },
  { id: 'feedback', label: 'Feedback' },
] as const;

export function DesignSystemSectionLinks() {
  return (
    <nav aria-label="Design system sections">
      {sectionLinks.map(({ id, label }) => (
        <a href={`#${id}`} key={id}>
          {label}
        </a>
      ))}
    </nav>
  );
}

export function DesignPrinciplesGrid({ className }: { className: string }) {
  return (
    <div className={className}>
      <article>
        <span>01</span>
        <h3>Story first</h3>
        <p>The graph is a view of the narrative model, never the model itself.</p>
      </article>
      <article>
        <span>02</span>
        <h3>Reveal relationships</h3>
        <p>Targets, effects, conditions, and ownership stay visible and explicit.</p>
      </article>
      <article>
        <span>03</span>
        <h3>Quiet by default</h3>
        <p>Neutral surfaces carry the work. Color communicates state and meaning.</p>
      </article>
    </div>
  );
}

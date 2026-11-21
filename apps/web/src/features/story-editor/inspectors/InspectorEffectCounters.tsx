import { useTranslation } from 'react-i18next';

/**
 * Compact effect counts for the Inspector, with the graph's icons: Δ for
 * variable effects and ◇ for item effects. They replace the `Effects` heading.
 */
export function InspectorEffectCounters({
  statCount,
  itemCount,
}: {
  statCount: number;
  itemCount: number;
}) {
  const { t } = useTranslation();
  const counters = [
    { key: 'stat', icon: 'Δ', count: statCount, label: t('interactionInspector.statEffects') },
    { key: 'item', icon: '◇', count: itemCount, label: t('interactionInspector.itemEffects') },
  ].filter(({ count }) => count > 0);
  return (
    <span className="interaction-effect-counters">
      {counters.map(({ key, icon, count, label }) => (
        <span
          className="interaction-effect-counter"
          key={key}
          role="img"
          aria-label={`${label}: ${String(count)}`}
          title={label}
        >
          <i aria-hidden="true">{icon}</i>
          {count}
        </span>
      ))}
    </span>
  );
}

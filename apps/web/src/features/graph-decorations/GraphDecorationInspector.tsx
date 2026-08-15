import { useTranslation } from 'react-i18next';
import type { GraphDecoration, UpdateGraphDecorationInput } from '@paralleax/shared';

interface GraphDecorationInspectorProps {
  decoration: GraphDecoration;
  onPatch: (patch: UpdateGraphDecorationInput) => void;
  onDelete: () => void;
}

export function GraphDecorationInspector({
  decoration,
  onPatch,
  onDelete,
}: GraphDecorationInspectorProps) {
  const { t } = useTranslation();

  return (
    <div className="graph-decoration-inspector">
      <h2>{t(decoration.kind === 'frame' ? 'decoration.frame' : 'decoration.text')}</h2>
      <label>
        {t('decoration.color')}
        <input
          aria-label={t('decoration.color')}
          type="color"
          value={decoration.color}
          onChange={(event) => onPatch({ color: event.target.value })}
        />
      </label>
      {decoration.kind === 'frame' ? (
        <div className="graph-decoration-size-fields">
          <label>
            {t('decoration.width')}
            <DecorationNumberInput
              label={t('decoration.width')}
              value={Math.round(decoration.width)}
              min={120}
              onCommit={(width) => onPatch({ width })}
            />
          </label>
          <label>
            {t('decoration.height')}
            <DecorationNumberInput
              label={t('decoration.height')}
              value={Math.round(decoration.height)}
              min={80}
              onCommit={(height) => onPatch({ height })}
            />
          </label>
        </div>
      ) : (
        <>
          <label>
            {t('decoration.content')}
            <textarea
              aria-label={t('decoration.content')}
              key={`${decoration.id}:${decoration.text}`}
              maxLength={2000}
              rows={5}
              defaultValue={decoration.text}
              onBlur={(event) => {
                if (event.target.value !== decoration.text) onPatch({ text: event.target.value });
              }}
            />
          </label>
          <label>
            {t('decoration.fontSize')}
            <DecorationNumberInput
              label={t('decoration.fontSize')}
              value={decoration.fontSize}
              min={10}
              max={96}
              onCommit={(fontSize) => onPatch({ fontSize })}
            />
          </label>
          <label>
            {t('decoration.fontFamily')}
            <select
              value={decoration.fontFamily}
              onChange={(event) =>
                onPatch({
                  fontFamily: event.target.value as 'sans' | 'serif' | 'monospace' | 'display',
                })
              }
            >
              <option value="sans">{t('decoration.font.sans')}</option>
              <option value="serif">{t('decoration.font.serif')}</option>
              <option value="monospace">{t('decoration.font.monospace')}</option>
              <option value="display">{t('decoration.font.display')}</option>
            </select>
          </label>
          <div className="graph-decoration-style-fields">
            <label>
              <input
                type="checkbox"
                checked={decoration.fontWeight === 'bold'}
                onChange={(event) =>
                  onPatch({ fontWeight: event.target.checked ? 'bold' : 'normal' })
                }
              />
              {t('decoration.bold')}
            </label>
            <label>
              <input
                type="checkbox"
                checked={decoration.fontStyle === 'italic'}
                onChange={(event) =>
                  onPatch({ fontStyle: event.target.checked ? 'italic' : 'normal' })
                }
              />
              {t('decoration.italic')}
            </label>
          </div>
        </>
      )}
      <button className="danger" type="button" onClick={onDelete}>
        {t('decoration.delete')}
      </button>
    </div>
  );
}

function DecorationNumberInput({
  label,
  value,
  min,
  max,
  onCommit,
}: {
  label: string;
  value: number;
  min: number;
  max?: number;
  onCommit: (value: number) => void;
}) {
  function commit(input: HTMLInputElement) {
    const parsed = Number(input.value);
    const next = Number.isFinite(parsed) ? Math.min(max ?? Infinity, Math.max(min, parsed)) : value;
    input.value = String(next);
    if (next !== value) onCommit(next);
  }

  return (
    <input
      aria-label={label}
      key={`${label}:${value}`}
      type="number"
      min={min}
      {...(max === undefined ? {} : { max })}
      defaultValue={value}
      onBlur={(event) => commit(event.currentTarget)}
      onKeyDown={(event) => {
        if (event.key === 'Enter') event.currentTarget.blur();
      }}
    />
  );
}

import type { CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';
import type { TriggerTimerResult } from '@paralleax/shared';

type TimerStyle = CSSProperties & {
  '--choice-timer-duration': string;
  '--choice-timer-ratio': number;
};

export function ChoiceTimerBar({ timer }: { timer: TriggerTimerResult }) {
  const { t } = useTranslation();
  const style: TimerStyle = {
    '--choice-timer-duration': `${timer.remainingTimeMs}ms`,
    '--choice-timer-ratio': timer.remainingRatio,
  };

  return (
    <div
      aria-label={t('player.optionTimer')}
      aria-valuemax={timer.timerSeconds}
      aria-valuemin={0}
      aria-valuenow={timer.remainingTimeMs / 1_000}
      className={`choice-timer${timer.expired ? ' expired' : ''}`}
      role="progressbar"
    >
      <span className="choice-timer-fill" style={style} />
    </div>
  );
}

import type { Survey } from 'posthog-js';

/** A launched widget survey shaped like the PostHog `/api/surveys/` payload. */
export function feedbackSurveyFixture(id: string, overrides: Partial<Survey> = {}): Survey {
  return {
    id,
    name: 'Paralleax feedback',
    type: 'widget',
    feature_flag_keys: null,
    linked_flag_key: null,
    targeting_flag_key: null,
    internal_targeting_flag_key: null,
    appearance: { widgetType: 'tab', displayThankYouMessage: true },
    conditions: null,
    start_date: '2026-11-01T00:00:00Z',
    end_date: null,
    current_iteration: null,
    current_iteration_start_date: null,
    questions: [
      {
        id: 'question-type',
        type: 'single_choice',
        question: 'What kind of feedback?',
        choices: ['Bug', 'Usability difficulty', 'Suggestion', 'Other'],
        translations: {
          fr: {
            question: 'Quel type de retour ?',
            choices: ['Bug', "Difficulté d'utilisation", 'Suggestion', 'Autre'],
          },
          it: {
            question: 'Che tipo di feedback?',
            choices: ['Bug', 'Difficoltà di utilizzo', 'Suggerimento', 'Altro'],
          },
        },
      },
    ],
    ...overrides,
  };
}

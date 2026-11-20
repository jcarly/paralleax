import type { Survey } from 'posthog-js';

const feedbackQuestions: Survey['questions'] = [
  {
    id: 'feedback-type',
    type: 'single_choice',
    question: 'Quel type de retour ?',
    choices: ['Bug', "Difficulté d'utilisation", 'Suggestion', 'Autre'],
    translations: {
      en: {
        question: 'What kind of feedback?',
        choices: ['Bug', 'Usability difficulty', 'Suggestion', 'Other'],
      },
      it: {
        question: 'Che tipo di feedback?',
        choices: ['Bug', 'Difficoltà di utilizzo', 'Suggerimento', 'Altro'],
      },
    },
  },
  {
    id: 'feedback-description',
    type: 'open',
    question: 'Décrivez votre retour',
    optional: true,
    translations: {
      en: { question: 'Describe your feedback' },
      it: { question: 'Descrivi il tuo feedback' },
    },
  },
  {
    id: 'author-profile',
    type: 'single_choice',
    question: 'Quel est votre profil ?',
    optional: true,
    choices: ['Auteur amateur', 'Auteur professionnel', 'Studio de jeu', 'Autre'],
    translations: {
      en: {
        question: 'What is your profile?',
        choices: ['Hobby writer', 'Professional writer', 'Game studio', 'Other'],
      },
      it: {
        question: 'Qual è il tuo profilo?',
        choices: ['Autore amatoriale', 'Autore professionista', 'Studio di giochi', 'Altro'],
      },
    },
  },
];

/**
 * Mirrors the structure of the Paralleax PostHog feedback survey, as returned
 * by `/api/surveys/`: a button-selector widget, French base text with English
 * and Italian translations, partial responses, and three questions (feedback
 * type, optional description, optional profile). The wording is illustrative;
 * the structure is the contract the tests exercise.
 */
export function feedbackSurveyFixture(id: string, overrides: Partial<Survey> = {}): Survey {
  return {
    id,
    name: 'Paralleax feedback',
    type: 'widget',
    feature_flag_keys: null,
    linked_flag_key: null,
    targeting_flag_key: null,
    internal_targeting_flag_key: null,
    appearance: {
      widgetType: 'selector',
      widgetSelector: '#paralleax-feedback-button',
      displayThankYouMessage: true,
      thankYouMessageHeader: 'Merci !',
    },
    conditions: null,
    start_date: '2026-11-01T00:00:00Z',
    end_date: null,
    current_iteration: null,
    current_iteration_start_date: null,
    enable_partial_responses: true,
    translations: {
      en: { thankYouMessageHeader: 'Thank you!' },
      it: { thankYouMessageHeader: 'Grazie!' },
    },
    questions: feedbackQuestions,
    ...overrides,
  };
}

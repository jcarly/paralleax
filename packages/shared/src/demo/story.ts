import type { Story } from '../model/index.js';
import { DEFAULT_STORY_DATE_TIME } from '../time/index.js';

export function createDemoStory(storyId: string, timestamp: string): Story {
  return {
    id: storyId,
    title: 'Demo: branching investigation',
    startDateTime: DEFAULT_STORY_DATE_TIME,
    locations: [],
    characters: [],
    createdAt: timestamp,
    updatedAt: timestamp,
    interactions: [
      {
        id: 'demo-root-museum',
        title: 'Enter the museum',
        body: 'The museum opens for a private evening visit. Two wings are lit, but the staff has vanished.',
        position: { x: 80, y: 120 },
        triggers: [{ id: 'demo-trigger-root-museum', inputInteractionIds: [], conditions: [] }],
      },
      {
        id: 'demo-root-archive',
        title: 'Start in the archive',
        body: 'You begin in the basement archive, surrounded by catalog cards and old security logs.',
        position: { x: 80, y: 420 },
        triggers: [{ id: 'demo-trigger-root-archive', inputInteractionIds: [], conditions: [] }],
      },
      {
        id: 'demo-signal',
        title: 'Follow the radio signal',
        body: 'A handheld radio crackles with a repeating code coming from the east wing.',
        position: { x: 420, y: 60 },
        triggers: [
          {
            id: 'demo-trigger-signal',
            inputInteractionIds: ['demo-root-museum'],
            conditions: [],
          },
        ],
      },
      {
        id: 'demo-door',
        title: 'Inspect the sealed door',
        body: 'A service door is sealed with a new electronic lock. Fresh scratches mark the frame.',
        position: { x: 420, y: 250 },
        triggers: [
          { id: 'demo-trigger-door', inputInteractionIds: ['demo-root-museum'], conditions: [] },
        ],
      },
      {
        id: 'demo-ledger',
        title: 'Read the missing ledger',
        body: 'The archive ledger lists one exhibit that should not exist: Gallery Zero.',
        position: { x: 420, y: 470 },
        triggers: [
          {
            id: 'demo-trigger-ledger',
            inputInteractionIds: ['demo-root-archive'],
            conditions: [],
          },
        ],
      },
      {
        id: 'demo-courtyard',
        title: 'Reach the inner courtyard',
        body: 'Both paths lead to a glass courtyard. Rain taps against the roof while the lights flicker.',
        position: { x: 760, y: 160 },
        triggers: [
          {
            id: 'demo-trigger-courtyard',
            inputInteractionIds: ['demo-signal', 'demo-door'],
            conditions: [],
          },
        ],
      },
      {
        id: 'demo-vault',
        title: 'Open Gallery Zero',
        body: 'The ledger code unlocks a hidden gallery. Inside, the missing exhibit waits under a dust cover.',
        position: { x: 1100, y: 80 },
        triggers: [
          {
            id: 'demo-trigger-vault',
            inputInteractionIds: ['demo-courtyard'],
            conditions: [{ interactionId: 'demo-ledger', hasBeenVisited: true }],
          },
        ],
      },
      {
        id: 'demo-guard',
        title: 'Call the night guard',
        body: 'Without the archive code, you call the night guard and describe the courtyard clue.',
        position: { x: 1100, y: 300 },
        triggers: [
          {
            id: 'demo-trigger-guard',
            inputInteractionIds: ['demo-courtyard'],
            conditions: [{ interactionId: 'demo-ledger', hasBeenVisited: false }],
          },
        ],
      },
      {
        id: 'demo-report',
        title: 'Write the incident report',
        body: 'Your notes connect the radio code, the sealed door, and the archive ledger into one report.',
        position: { x: 1440, y: 190 },
        triggers: [
          {
            id: 'demo-trigger-report',
            inputInteractionIds: ['demo-vault', 'demo-guard'],
            conditions: [],
          },
        ],
      },
    ],
  };
}

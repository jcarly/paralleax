export type PrototypeScenarioId =
  'quiet-line' | 'harbor-signals' | 'archive-below' | 'ashfall' | 'blank';

export interface PrototypeInteractionFixture {
  id: string;
  title: string;
  excerpt: string;
  location: string;
  characters: string[];
  position: { x: number; y: number };
  groupId?: string;
  empty?: boolean;
}

export interface PrototypeTriggerFixture {
  id: string;
  title: string;
  sources: string[];
  target: string;
  conditions: string[][];
  probability: number;
  timerSeconds?: number;
}

export interface PrototypeGroupFixture {
  id: string;
  title: string;
  parentId?: string;
  interactionIds: string[];
}

export interface PrototypeScenario {
  id: PrototypeScenarioId;
  title: string;
  description: string;
  focus: string;
  interactions: PrototypeInteractionFixture[];
  triggers: PrototypeTriggerFixture[];
  groups: PrototypeGroupFixture[];
  characters: string[];
  locations: string[];
}

export const prototypeScenarios: Record<PrototypeScenarioId, PrototypeScenario> = {
  blank: {
    id: 'blank',
    title: 'Untitled story',
    description: 'A new story waiting for its first Interaction.',
    focus: 'Empty story',
    interactions: [
      {
        id: 'blank-1',
        title: '',
        excerpt: '',
        location: '',
        characters: [],
        position: { x: 310, y: 200 },
        empty: true,
      },
    ],
    triggers: [
      {
        id: 'blank-root',
        title: 'Beginning',
        sources: [],
        target: 'blank-1',
        conditions: [[]],
        probability: 100,
      },
    ],
    groups: [],
    characters: [],
    locations: [],
  },
  'quiet-line': {
    id: 'quiet-line',
    title: 'A Quiet Line',
    description: 'A courier crosses the city before the last train leaves.',
    focus: 'Mostly linear',
    interactions: [
      {
        id: 'ql-1',
        title: 'The last platform',
        excerpt: 'The station clock has stopped two minutes before midnight.',
        location: 'North Station',
        characters: ['MV'],
        position: { x: 310, y: 70 },
        groupId: 'ql-act',
      },
      {
        id: 'ql-2',
        title: 'A sealed envelope',
        excerpt: 'A porter presses a letter into Mara’s hand.',
        location: 'North Station',
        characters: ['MV', 'IH'],
        position: { x: 310, y: 330 },
        groupId: 'ql-act',
      },
      {
        id: 'ql-3',
        title: 'Across the bridge',
        excerpt: 'The river carries the city lights downstream.',
        location: 'Old Bridge',
        characters: ['MV'],
        position: { x: 310, y: 590 },
        groupId: 'ql-act',
      },
      {
        id: 'ql-4',
        title: 'Delivered in time',
        excerpt: 'The address belongs to someone Mara thought had left.',
        location: 'East Quarter',
        characters: ['MV', 'IH'],
        position: { x: 310, y: 850 },
        groupId: 'ql-act',
      },
    ],
    triggers: [
      {
        id: 'ql-root',
        title: 'Beginning',
        sources: [],
        target: 'ql-1',
        conditions: [[]],
        probability: 100,
      },
      {
        id: 'ql-t1',
        title: 'Take the letter',
        sources: ['ql-1'],
        target: 'ql-2',
        conditions: [[]],
        probability: 100,
      },
      {
        id: 'ql-t2',
        title: 'Cross the bridge',
        sources: ['ql-2'],
        target: 'ql-3',
        conditions: [[]],
        probability: 100,
      },
      {
        id: 'ql-t3',
        title: 'Make the delivery',
        sources: ['ql-3'],
        target: 'ql-4',
        conditions: [[]],
        probability: 100,
      },
    ],
    groups: [
      { id: 'ql-act', title: 'The route', interactionIds: ['ql-1', 'ql-2', 'ql-3', 'ql-4'] },
    ],
    characters: ['Mara Venn', 'Ivo Hale'],
    locations: ['North Station', 'Old Bridge', 'East Quarter'],
  },
  'harbor-signals': {
    id: 'harbor-signals',
    title: 'Harbor Signals',
    description: 'Three lighthouse keepers decode a message that arrives with every storm.',
    focus: 'Several branches',
    interactions: [
      {
        id: 'hs-1',
        title: 'A light in the storm',
        excerpt: 'The northern lamp flashes twice.',
        location: 'North Lighthouse',
        characters: ['MV', 'IH'],
        position: { x: 350, y: 70 },
        groupId: 'hs-night',
      },
      {
        id: 'hs-2',
        title: 'Check the ledger',
        excerpt: 'A matching signal appears in last winter’s log.',
        location: 'North Lighthouse',
        characters: ['MV'],
        position: { x: 90, y: 350 },
        groupId: 'hs-night',
      },
      {
        id: 'hs-3',
        title: 'Answer the light',
        excerpt: 'Ivo turns the southern mirror toward the sea.',
        location: 'South Beacon',
        characters: ['IH', 'KP'],
        position: { x: 350, y: 350 },
        groupId: 'hs-beacons',
      },
      {
        id: 'hs-4',
        title: 'Wait for dawn',
        excerpt: 'The storm breaks over an empty horizon.',
        location: 'Harbor Wall',
        characters: ['MV'],
        position: { x: 610, y: 350 },
        groupId: 'hs-beacons',
      },
      {
        id: 'hs-5',
        title: 'The keepers meet',
        excerpt: 'All three signals form a name.',
        location: 'Harbor Wall',
        characters: ['MV', 'IH', 'KP'],
        position: { x: 350, y: 700 },
        groupId: 'hs-morning',
      },
    ],
    triggers: [
      {
        id: 'hs-root',
        title: 'Beginning',
        sources: [],
        target: 'hs-1',
        conditions: [[]],
        probability: 100,
      },
      {
        id: 'hs-t1',
        title: 'Search the record',
        sources: ['hs-1'],
        target: 'hs-2',
        conditions: [[]],
        probability: 100,
      },
      {
        id: 'hs-t2',
        title: 'Signal back',
        sources: ['hs-1'],
        target: 'hs-3',
        conditions: [[]],
        probability: 100,
      },
      {
        id: 'hs-t3',
        title: 'Wait',
        sources: ['hs-1'],
        target: 'hs-4',
        conditions: [[]],
        probability: 100,
      },
      {
        id: 'hs-shared',
        title: 'Bring the message together',
        sources: ['hs-2', 'hs-3', 'hs-4'],
        target: 'hs-5',
        conditions: [['The log was checked'], ['The southern beacon answered']],
        probability: 100,
      },
    ],
    groups: [
      { id: 'hs-night', title: 'Night watch', interactionIds: ['hs-1', 'hs-2'] },
      { id: 'hs-beacons', title: 'The beacons', interactionIds: ['hs-3', 'hs-4'] },
      {
        id: 'hs-morning',
        title: 'At first light',
        parentId: 'hs-beacons',
        interactionIds: ['hs-5'],
      },
    ],
    characters: ['Mara Venn', 'Ivo Hale', 'Keeper Pell'],
    locations: ['North Lighthouse', 'South Beacon', 'Harbor Wall'],
  },
  'archive-below': {
    id: 'archive-below',
    title: 'The Archive Below',
    description: 'An archivist follows a trail of erased memories beneath the old quarter.',
    focus: 'Conditions and effects',
    interactions: [
      {
        id: 'ab-1',
        title: 'A room full of echoes',
        excerpt: 'Rain taps against a thousand broken panes.',
        location: 'The Glasshouse',
        characters: ['MV', 'IH'],
        position: { x: 350, y: 60 },
        groupId: 'ab-upper',
      },
      {
        id: 'ab-2',
        title: 'The hidden passage',
        excerpt: 'A loose tile reveals a stairway beneath the garden.',
        location: 'The Glasshouse',
        characters: ['MV'],
        position: { x: 350, y: 330 },
        groupId: 'ab-upper',
      },
      {
        id: 'ab-3',
        title: 'A quiet warning',
        excerpt: 'Ivo catches Mara before she crosses the threshold.',
        location: 'Old Quarter',
        characters: ['MV', 'IH'],
        position: { x: 80, y: 650 },
        groupId: 'ab-choice',
      },
      {
        id: 'ab-4',
        title: 'Enter the passage',
        excerpt: 'The old mechanism turns with a low metallic sigh.',
        location: 'Lower Archive',
        characters: ['MV'],
        position: { x: 350, y: 650 },
        groupId: 'ab-choice',
      },
      {
        id: 'ab-5',
        title: 'The sealed catalogue',
        excerpt: 'The key vibrates near a name Mara recognizes.',
        location: 'Lower Archive',
        characters: ['MV', 'K'],
        position: { x: 350, y: 950 },
        groupId: 'ab-below',
      },
    ],
    triggers: [
      {
        id: 'ab-root',
        title: 'Beginning',
        sources: [],
        target: 'ab-1',
        conditions: [[]],
        probability: 100,
      },
      {
        id: 'ab-t1',
        title: 'Find the passage',
        sources: ['ab-1'],
        target: 'ab-2',
        conditions: [[]],
        probability: 100,
      },
      {
        id: 'ab-t2',
        title: 'Listen to Ivo',
        sources: ['ab-2'],
        target: 'ab-3',
        conditions: [['Trust ≥ 2']],
        probability: 100,
      },
      {
        id: 'ab-t3',
        title: 'Open the hidden door',
        sources: ['ab-2'],
        target: 'ab-4',
        conditions: [['Trust ≥ 4', 'Old brass key is carried'], ['Mara has visited the archive']],
        probability: 75,
        timerSeconds: 20,
      },
      {
        id: 'ab-t4',
        title: 'Use the key',
        sources: ['ab-4'],
        target: 'ab-5',
        conditions: [['Key charge > 0']],
        probability: 100,
      },
    ],
    groups: [
      { id: 'ab-upper', title: 'Above ground', interactionIds: ['ab-1', 'ab-2'] },
      {
        id: 'ab-choice',
        title: 'A decision',
        parentId: 'ab-upper',
        interactionIds: ['ab-3', 'ab-4'],
      },
      { id: 'ab-below', title: 'Beneath the city', interactionIds: ['ab-5'] },
    ],
    characters: ['Mara Venn', 'Ivo Hale', 'The Keeper'],
    locations: ['The Glasshouse', 'Old Quarter', 'Lower Archive'],
  },
  ashfall: {
    id: 'ashfall',
    title: 'Ashfall',
    description: 'A city evacuation told through conflicting accounts and difficult choices.',
    focus: 'Nested Groups and cast',
    interactions: [
      {
        id: 'af-1',
        title: 'The first siren',
        excerpt: 'A grey cloud gathers above the eastern roofs.',
        location: 'East Gate',
        characters: ['MV', 'IH'],
        position: { x: 370, y: 50 },
        groupId: 'af-evacuation',
      },
      {
        id: 'af-2',
        title: 'The crowded square',
        excerpt: 'Families wait beside an overloaded cart.',
        location: 'Market Square',
        characters: ['MV', 'IH', 'KP'],
        position: { x: 100, y: 350 },
        groupId: 'af-evacuation',
      },
      {
        id: 'af-3',
        title: 'The clinic is open',
        excerpt: 'A nurse asks for help carrying medicine.',
        location: 'Old Clinic',
        characters: ['MV', 'AL'],
        position: { x: 370, y: 350 },
        groupId: 'af-shelter',
      },
      {
        id: 'af-4',
        title: 'The west road',
        excerpt: 'The bridge is clear, for now.',
        location: 'West Bridge',
        characters: ['IH', 'KP'],
        position: { x: 640, y: 350 },
        groupId: 'af-evacuation',
      },
      {
        id: 'af-5',
        title: 'A place to shelter',
        excerpt: 'The clinic basement can hold the group overnight.',
        location: 'Old Clinic',
        characters: ['MV', 'AL', 'KP'],
        position: { x: 100, y: 680 },
        groupId: 'af-shelter',
      },
      {
        id: 'af-6',
        title: 'The supply depot',
        excerpt: 'A locked depot stands beside the western road.',
        location: 'West Bridge',
        characters: ['MV', 'IH'],
        position: { x: 640, y: 680 },
        groupId: 'af-travel',
      },
      {
        id: 'af-7',
        title: 'Morning census',
        excerpt: 'Everyone answers when Mara calls their name.',
        location: 'North Camp',
        characters: ['MV', 'IH', 'KP', 'AL'],
        position: { x: 370, y: 1010 },
        groupId: 'af-resolution',
      },
    ],
    triggers: [
      {
        id: 'af-root',
        title: 'Beginning',
        sources: [],
        target: 'af-1',
        conditions: [[]],
        probability: 100,
      },
      {
        id: 'af-t1',
        title: 'Find a route',
        sources: ['af-1'],
        target: 'af-2',
        conditions: [[]],
        probability: 100,
      },
      {
        id: 'af-t2',
        title: 'Find medicine',
        sources: ['af-1'],
        target: 'af-3',
        conditions: [['Health > 0']],
        probability: 100,
      },
      {
        id: 'af-t3',
        title: 'Cross west',
        sources: ['af-1'],
        target: 'af-4',
        conditions: [['Bridge report is clear']],
        probability: 100,
      },
      {
        id: 'af-t4',
        title: 'Stay at the clinic',
        sources: ['af-2', 'af-3'],
        target: 'af-5',
        conditions: [['Medicine is carried']],
        probability: 100,
      },
      {
        id: 'af-t5',
        title: 'Search for supplies',
        sources: ['af-4'],
        target: 'af-6',
        conditions: [['Ivo is present']],
        probability: 60,
        timerSeconds: 30,
      },
      {
        id: 'af-t6',
        title: 'Reach camp',
        sources: ['af-5', 'af-6'],
        target: 'af-7',
        conditions: [['The group is together']],
        probability: 100,
      },
    ],
    groups: [
      { id: 'af-evacuation', title: 'Evacuation', interactionIds: ['af-1', 'af-2', 'af-4'] },
      {
        id: 'af-shelter',
        title: 'Shelter',
        parentId: 'af-evacuation',
        interactionIds: ['af-3', 'af-5'],
      },
      {
        id: 'af-travel',
        title: 'On the road',
        parentId: 'af-evacuation',
        interactionIds: ['af-6'],
      },
      { id: 'af-resolution', title: 'The next morning', interactionIds: ['af-7'] },
    ],
    characters: ['Mara Venn', 'Ivo Hale', 'Keeper Pell', 'Ari Lane'],
    locations: ['East Gate', 'Market Square', 'Old Clinic', 'West Bridge', 'North Camp'],
  },
};

export function getPrototypeScenario(id: string | null | undefined): PrototypeScenario {
  return (
    Object.values(prototypeScenarios).find((scenario) => scenario.id === id) ??
    prototypeScenarios['archive-below']
  );
}

import type { Story } from '../../model/index.js';
import { buildDemoStory, buildDemoTrigger, demoEntityId } from '../builders.js';

export function createWorldVariablesDemoStory(storyId: string, timestamp: string): Story {
  const id = (localId: string) => demoEntityId(storyId, localId);
  const alert = id('alert-level');
  const power = id('power-restored');
  const weather = id('weather');

  return buildDemoStory(storyId, timestamp, {
    title: 'Demo 3: world variables',
    statDefinitions: [
      { id: id('alert-level-definition'), name: 'Alert level', valueType: 'number' },
      { id: id('power-restored-definition'), name: 'Power restored', valueType: 'boolean' },
      { id: id('weather-definition'), name: 'Weather', valueType: 'string' },
    ],
    stats: [
      { id: alert, statDefinitionId: id('alert-level-definition'), initialValue: 0 },
      { id: power, statDefinitionId: id('power-restored-definition'), initialValue: false },
      { id: weather, statDefinitionId: id('weather-definition'), initialValue: 'storm' },
    ],
    interactions: [
      {
        id: id('control-room'),
        title: 'Reach the floodgate control room',
        body: 'A storm is raising the river while the control room runs on emergency power.',
        position: { x: 600, y: 20 },
        triggers: [buildDemoTrigger(storyId, 'control-room', [])],
      },
      {
        id: id('restore-power'),
        title: 'Restore the main power',
        body: 'You restart the old turbine carefully, attracting little attention.',
        position: { x: 300, y: 270 },
        statEffects: [
          { statId: power, operation: 'set', value: true },
          { statId: alert, operation: 'add', value: 1 },
        ],
        triggers: [buildDemoTrigger(storyId, 'restore-power', [id('control-room')])],
      },
      {
        id: id('force-gate'),
        title: 'Force the manual controls',
        body: 'The gate moves, but the noise activates the emergency alarms.',
        position: { x: 900, y: 270 },
        statEffects: [{ statId: alert, operation: 'add', value: 3 }],
        triggers: [buildDemoTrigger(storyId, 'force-gate', [id('control-room')])],
      },
      {
        id: id('assessment'),
        title: 'Assess the river level',
        body: 'The control panel calculates the remaining safe operating window.',
        position: { x: 600, y: 510 },
        triggers: [
          buildDemoTrigger(storyId, 'assessment', [id('restore-power'), id('force-gate')]),
        ],
      },
      {
        id: id('safe-release'),
        title: 'Open the floodgate safely',
        body: 'Stable power and a low alert level allow a controlled release.',
        position: { x: 260, y: 760 },
        triggers: [
          buildDemoTrigger(
            storyId,
            'safe-release',
            [id('assessment')],
            [
              { statId: power, operator: 'eq', value: true },
              { statId: alert, operator: 'lte', value: 2 },
            ],
          ),
        ],
      },
      {
        id: id('evacuate'),
        title: 'Order an emergency evacuation',
        body: 'With alarms active, the downstream district must evacuate immediately.',
        position: { x: 600, y: 760 },
        triggers: [
          buildDemoTrigger(
            storyId,
            'evacuate',
            [id('assessment')],
            [{ statId: alert, operator: 'gte', value: 3 }],
          ),
        ],
      },
      {
        id: id('shelter'),
        title: 'Wait for the storm to pass',
        body: 'The storm remains active, so the control crew shelters in place.',
        position: { x: 940, y: 760 },
        triggers: [
          buildDemoTrigger(
            storyId,
            'shelter',
            [id('assessment')],
            [{ statId: weather, operator: 'eq', value: 'storm' }],
          ),
        ],
      },
    ],
  });
}

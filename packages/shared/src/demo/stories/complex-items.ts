import type { Story } from '../../model/index.js';
import { buildDemoStory, buildDemoTrigger, demoEntityId } from '../builders.js';

export function createComplexItemsDemoStory(storyId: string, timestamp: string): Story {
  const id = (localId: string) => demoEntityId(storyId, localId);
  const ari = id('ari');
  const armor = id('armor-instance');
  const gauntlet = id('gauntlet-instance');
  const battery = id('battery-instance');
  const armorIntegrity = id('armor-integrity');
  const gauntletIntegrity = id('gauntlet-integrity');
  const batteryCharge = id('battery-charge');

  return buildDemoStory(storyId, timestamp, {
    title: 'Demo 5: body, equipment, and item stats',
    statDefinitions: [
      { id: id('integrity-definition'), name: 'Integrity', valueType: 'number' },
      { id: id('protection-definition'), name: 'Protection', valueType: 'number' },
      { id: id('charge-definition'), name: 'Charge', valueType: 'number' },
    ],
    itemDefinitions: [
      {
        id: id('body-definition'),
        name: 'Synthetic body',
        description: 'The root of Ari’s body structure.',
        stats: [
          {
            id: id('body-integrity'),
            statDefinitionId: id('integrity-definition'),
            initialValue: 100,
          },
        ],
      },
      {
        id: id('torso-definition'),
        name: 'Torso assembly',
        description: 'A structural body part attached to the synthetic body.',
        stats: [
          {
            id: id('torso-integrity'),
            statDefinitionId: id('integrity-definition'),
            initialValue: 100,
          },
        ],
      },
      {
        id: id('arm-definition'),
        name: 'Right arm assembly',
        description: 'A replaceable articulated arm.',
        stats: [
          {
            id: id('arm-integrity'),
            statDefinitionId: id('integrity-definition'),
            initialValue: 90,
          },
        ],
      },
      {
        id: id('armor-definition'),
        name: 'Chest armor',
        description: 'A plate equipped over the torso assembly.',
        stats: [
          {
            id: armorIntegrity,
            statDefinitionId: id('integrity-definition'),
            initialValue: 90,
          },
          {
            id: id('armor-protection'),
            statDefinitionId: id('protection-definition'),
            initialValue: 60,
          },
        ],
      },
      {
        id: id('gauntlet-definition'),
        name: 'Tool gauntlet',
        description: 'A powered gauntlet equipped on the right arm.',
        stats: [
          {
            id: gauntletIntegrity,
            statDefinitionId: id('integrity-definition'),
            initialValue: 80,
          },
        ],
      },
      {
        id: id('battery-definition'),
        name: 'Gauntlet battery',
        description: 'A removable power cell installed in the tool gauntlet.',
        stats: [
          {
            id: batteryCharge,
            statDefinitionId: id('charge-definition'),
            initialValue: 70,
          },
        ],
      },
    ],
    characters: [
      {
        id: ari,
        name: 'Ari',
        description: 'A synthetic field engineer whose body and equipment share one item tree.',
        isPlayable: true,
        items: [
          { id: id('body-instance'), itemDefinitionId: id('body-definition') },
          {
            id: id('torso-instance'),
            itemDefinitionId: id('torso-definition'),
            parentItemId: id('body-instance'),
            relationshipType: 'part_of',
            slotKey: 'torso',
          },
          {
            id: id('arm-instance'),
            itemDefinitionId: id('arm-definition'),
            parentItemId: id('body-instance'),
            relationshipType: 'part_of',
            slotKey: 'right-arm',
          },
          {
            id: armor,
            itemDefinitionId: id('armor-definition'),
            parentItemId: id('torso-instance'),
            relationshipType: 'equipped',
            slotKey: 'chest',
          },
          {
            id: gauntlet,
            itemDefinitionId: id('gauntlet-definition'),
            parentItemId: id('arm-instance'),
            relationshipType: 'equipped',
            slotKey: 'hand',
          },
          {
            id: battery,
            itemDefinitionId: id('battery-definition'),
            parentItemId: gauntlet,
            relationshipType: 'installed',
            slotKey: 'power-cell',
          },
        ],
      },
    ],
    interactions: [
      {
        id: id('diagnostics'),
        title: 'Run equipment diagnostics',
        body: 'Ari checks every body part, equipped plate, and installed power cell.',
        position: { x: 600, y: 20 },
        characterIds: [ari],
        triggers: [buildDemoTrigger(storyId, 'diagnostics', [])],
      },
      {
        id: id('calibrate'),
        title: 'Calibrate the armor',
        body: 'The armor returns to full integrity while drawing power from the gauntlet battery.',
        position: { x: 300, y: 280 },
        characterIds: [ari],
        statEffects: [
          { statId: armorIntegrity, itemId: armor, operation: 'set', value: 100 },
          { statId: batteryCharge, itemId: battery, operation: 'add', value: -15 },
        ],
        triggers: [buildDemoTrigger(storyId, 'calibrate', [id('diagnostics')])],
      },
      {
        id: id('stress-test'),
        title: 'Stress-test the equipment',
        body: 'A heavy impact tests the chest plate and tool gauntlet under field conditions.',
        position: { x: 900, y: 280 },
        characterIds: [ari],
        statEffects: [
          { statId: armorIntegrity, itemId: armor, operation: 'add', value: -50 },
          { statId: gauntletIntegrity, itemId: gauntlet, operation: 'add', value: -20 },
        ],
        triggers: [buildDemoTrigger(storyId, 'stress-test', [id('diagnostics')])],
      },
      {
        id: id('assessment'),
        title: 'Review the equipment report',
        body: 'The report compares each exact item instance with its safe operating threshold.',
        position: { x: 600, y: 530 },
        characterIds: [ari],
        triggers: [buildDemoTrigger(storyId, 'assessment', [id('calibrate'), id('stress-test')])],
      },
      {
        id: id('field-ready'),
        title: 'Approve the field configuration',
        body: 'The armor, gauntlet, and battery all remain within safe limits.',
        position: { x: 350, y: 790 },
        characterIds: [ari],
        triggers: [
          buildDemoTrigger(
            storyId,
            'field-ready',
            [id('assessment')],
            [
              { statId: armorIntegrity, itemId: armor, operator: 'gte', value: 70 },
              { statId: gauntletIntegrity, itemId: gauntlet, operator: 'gte', value: 50 },
              { statId: batteryCharge, itemId: battery, operator: 'gte', value: 40 },
            ],
          ),
        ],
      },
      {
        id: id('repair-required'),
        title: 'Send the equipment for repair',
        body: 'At least one equipped component falls below its safe threshold.',
        position: { x: 850, y: 790 },
        characterIds: [ari],
        triggers: [
          buildDemoTrigger(
            storyId,
            'repair-armor',
            [id('assessment')],
            [{ statId: armorIntegrity, itemId: armor, operator: 'lt', value: 70 }],
          ),
          buildDemoTrigger(
            storyId,
            'repair-gauntlet',
            [id('assessment')],
            [{ statId: gauntletIntegrity, itemId: gauntlet, operator: 'lt', value: 50 }],
          ),
          buildDemoTrigger(
            storyId,
            'repair-battery',
            [id('assessment')],
            [{ statId: batteryCharge, itemId: battery, operator: 'lt', value: 40 }],
          ),
        ],
      },
    ],
  });
}

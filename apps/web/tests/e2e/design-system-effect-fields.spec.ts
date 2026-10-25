import { expect, test, type Locator } from '@playwright/test';
import { cloneStory, prepareEditorPage } from './editorTestHarness';

test('keeps catalogue effect fields visually aligned with the interaction inspector', async ({
  page,
}) => {
  const currentStory = cloneStory();
  currentStory.statDefinitions = [{ id: 'score-definition', name: 'Score', valueType: 'number' }];
  currentStory.stats = [{ id: 'score', statDefinitionId: 'score-definition', initialValue: 2 }];
  currentStory.interactions[0].statEffects = [{ statId: 'score', operation: 'add', value: 2 }];

  await prepareEditorPage(page, currentStory);
  await page.goto('/stories/story-1/edit');
  await page.getByTestId('interaction-node').filter({ hasText: 'Original title' }).click();
  const inspectorCard = page.locator('.inspector .interaction-effect-card');
  await expect(inspectorCard).toBeVisible();

  const inspectorPresentation = await readEffectFieldPresentation(inspectorCard);
  expect(inspectorPresentation.label.fontSize).toBe('12px');
  expect(inspectorPresentation.input.fontSize).toBe('14px');
  expect(inspectorPresentation.select.fontSize).toBe('14px');
  expect(inspectorPresentation.input.widthToParent).toBeCloseTo(1, 2);
  expect(inspectorPresentation.select.widthToParent).toBeCloseTo(1, 2);

  await page.goto('/design-system');
  const catalogueCard = page.locator('.narrative-reference .interaction-effect-card');
  await expect(catalogueCard).toBeVisible();
  const cataloguePresentation = await readEffectFieldPresentation(catalogueCard);

  expect(cataloguePresentation).toEqual(inspectorPresentation);
});

async function readEffectFieldPresentation(card: Locator) {
  return card.evaluate((element) => {
    const label = element.querySelector('.interaction-effect-fields label');
    const input = element.querySelector('.interaction-effect-fields input[type="number"]');
    const select = element.querySelector('.interaction-effect-fields select');
    if (!label || !input || !select)
      throw new Error('Expected effect label, number input, and select');

    const capture = (field: HTMLElement) => {
      const style = getComputedStyle(field);
      const bounds = field.getBoundingClientRect();
      const parentBounds = field.parentElement?.getBoundingClientRect();
      return {
        fontFamily: style.fontFamily,
        fontSize: style.fontSize,
        fontWeight: style.fontWeight,
        color: style.color,
        backgroundColor: style.backgroundColor,
        borderTopWidth: style.borderTopWidth,
        borderTopStyle: style.borderTopStyle,
        borderTopColor: style.borderTopColor,
        borderRadius: style.borderRadius,
        padding: style.padding,
        marginTop: style.marginTop,
        outlineWidth: style.outlineWidth,
        outlineStyle: style.outlineStyle,
        outlineColor: style.outlineColor,
        boxShadow: style.boxShadow,
        height: style.height,
        widthToParent: parentBounds?.width ? bounds.width / parentBounds.width : 0,
      };
    };
    const labelStyle = getComputedStyle(label);

    (input as HTMLInputElement).focus();
    const inputStyle = capture(input as HTMLElement);
    const inputIsFocusVisible = input.matches(':focus-visible');
    (select as HTMLSelectElement).focus();
    const selectStyle = capture(select as HTMLElement);
    const selectIsFocusVisible = select.matches(':focus-visible');

    return {
      label: {
        display: labelStyle.display,
        fontFamily: labelStyle.fontFamily,
        fontSize: labelStyle.fontSize,
        fontWeight: labelStyle.fontWeight,
        color: labelStyle.color,
        marginTop: labelStyle.marginTop,
        marginBottom: labelStyle.marginBottom,
      },
      input: inputStyle,
      select: selectStyle,
      inputIsFocusVisible,
      selectIsFocusVisible,
    };
  });
}

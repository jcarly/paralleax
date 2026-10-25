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
  expect(inspectorPresentation.input.height).toBe('36px');
  expect(inspectorPresentation.select.height).toBe('36px');
  expect(inspectorPresentation.input.widthToParent).toBeCloseTo(1, 2);
  expect(inspectorPresentation.select.widthToParent).toBeCloseTo(1, 2);

  await page.goto('/design-system');
  const catalogueCard = page.locator('.narrative-reference .interaction-effect-card');
  await expect(catalogueCard).toBeVisible();
  const cataloguePresentation = await readEffectFieldPresentation(catalogueCard);

  expect(cataloguePresentation).toEqual(inspectorPresentation);

  const standardPresentation = await readStandardFieldPresentation(page.locator('.form-reference'));
  expect(standardPresentation.labelSize).toBe('12px');
  expect(standardPresentation.inputSize).toBe('14px');
  expect(standardPresentation.selectSize).toBe('14px');
  expect(standardPresentation.inputHeight).toBe('44px');
  expect(standardPresentation.selectHeight).toBe('44px');
  expect(standardPresentation.inputSelectTopDelta).toBeLessThan(0.5);
  expect(standardPresentation.labelControlGap).toBe('6px');
  expect(standardPresentation.errorBorderColor).toBe('rgb(165, 69, 63)');
  expect(standardPresentation.disabled).toBe(true);
  expect(standardPresentation.readOnly).toBe(true);
  expect(standardPresentation.selectBackground).toBe(standardPresentation.inputBackground);
  expect(standardPresentation.disabledBackground).toBe('rgb(251, 251, 248)');
  expect(standardPresentation.readOnlyBackground).toBe('rgb(251, 251, 248)');
  expect(standardPresentation.textareaHeight).toBeGreaterThan(44);
  expect(standardPresentation.textareaResize).toBe('vertical');

  await page.getByRole('textbox', { name: 'Story title' }).focus();
  await page.keyboard.press('Tab');
  const focusedSelect = page.getByRole('combobox', { name: 'Location' });
  await expect(focusedSelect).toBeFocused();
  const focusIndicator = await focusedSelect.evaluate((element) => {
    const style = getComputedStyle(element);
    return { width: style.outlineWidth, style: style.outlineStyle };
  });
  expect(focusIndicator).toEqual({ width: '2px', style: 'solid' });

  await page.setViewportSize({ width: 390, height: 844 });
  const mobileCatalogue = await page.locator('.form-reference').evaluate((element) => ({
    viewportWidth: window.innerWidth,
    documentWidth: document.documentElement.scrollWidth,
    controlBounds: Array.from(element.querySelectorAll<HTMLElement>('.form-control')).map(
      (field) => {
        const bounds = field.getBoundingClientRect();
        return { left: bounds.left, right: bounds.right };
      },
    ),
  }));
  expect(mobileCatalogue.documentWidth).toBeLessThanOrEqual(mobileCatalogue.viewportWidth);
  expect(mobileCatalogue.controlBounds.every(({ left, right }) => left >= 0 && right <= 390)).toBe(
    true,
  );

  await page.goto('/stories/story-1/edit');
  await page.getByRole('button', { name: 'Collapse story context' }).click();
  await page.getByTestId('interaction-node').filter({ hasText: 'Original title' }).click();
  const mobileInspector = page.locator('.inspector');
  await expect(mobileInspector).toBeVisible();
  const mobileInspectorBounds = await mobileInspector.evaluate((element) => {
    const parent = element.getBoundingClientRect();
    const controls = Array.from(element.querySelectorAll<HTMLElement>('.form-control')).map(
      (control) => {
        const bounds = control.getBoundingClientRect();
        return { left: bounds.left, right: bounds.right };
      },
    );
    return {
      clientWidth: element.clientWidth,
      scrollWidth: element.scrollWidth,
      left: parent.left,
      right: parent.right,
      controls,
      viewportWidth: window.innerWidth,
      documentWidth: document.documentElement.scrollWidth,
    };
  });
  expect(mobileInspectorBounds.scrollWidth).toBeLessThanOrEqual(mobileInspectorBounds.clientWidth);
  expect(mobileInspectorBounds.documentWidth).toBeLessThanOrEqual(
    mobileInspectorBounds.viewportWidth,
  );
  expect(
    mobileInspectorBounds.controls.every(
      ({ left, right }) =>
        left >= mobileInspectorBounds.left - 0.5 && right <= mobileInspectorBounds.right + 0.5,
    ),
  ).toBe(true);
});

async function readStandardFieldPresentation(form: Locator) {
  return form.evaluate((element) => {
    const titleField = element.querySelector<HTMLElement>('.form-field--standard');
    const titleInput = titleField?.querySelector<HTMLInputElement>('.form-control');
    const locationField = element.querySelectorAll<HTMLElement>('.form-field--standard')[1];
    const locationSelect = locationField?.querySelector<HTMLSelectElement>('.form-control');
    const titleLabel = titleField?.querySelector('span');
    const errorInput = element.querySelector<HTMLInputElement>('[aria-invalid="true"]');
    const disabledInput = element.querySelector<HTMLInputElement>('.form-control:disabled');
    const readOnlyInput = element.querySelector<HTMLInputElement>('.form-control[readonly]');
    const textarea = element.querySelector<HTMLTextAreaElement>('textarea.form-control');
    if (
      !titleField ||
      !titleInput ||
      !locationSelect ||
      !titleLabel ||
      !errorInput ||
      !disabledInput ||
      !readOnlyInput ||
      !textarea
    ) {
      throw new Error('Expected standard field examples and states');
    }
    const titleInputStyle = getComputedStyle(titleInput);
    const locationSelectStyle = getComputedStyle(locationSelect);
    const errorStyle = getComputedStyle(errorInput);
    const titleInputBounds = titleInput.getBoundingClientRect();
    const locationInputBounds = locationSelect.getBoundingClientRect();
    return {
      labelSize: getComputedStyle(titleLabel).fontSize,
      inputSize: titleInputStyle.fontSize,
      selectSize: locationSelectStyle.fontSize,
      inputBackground: titleInputStyle.backgroundColor,
      selectBackground: locationSelectStyle.backgroundColor,
      inputHeight: titleInputStyle.height,
      selectHeight: locationSelectStyle.height,
      inputSelectTopDelta: Math.abs(titleInputBounds.top - locationInputBounds.top),
      labelControlGap: getComputedStyle(titleField).rowGap,
      errorBorderColor: errorStyle.borderTopColor,
      disabled: disabledInput.disabled,
      readOnly: readOnlyInput.readOnly,
      disabledBackground: getComputedStyle(disabledInput).backgroundColor,
      readOnlyBackground: getComputedStyle(readOnlyInput).backgroundColor,
      textareaHeight: textarea.getBoundingClientRect().height,
      textareaResize: getComputedStyle(textarea).resize,
    };
  });
}

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

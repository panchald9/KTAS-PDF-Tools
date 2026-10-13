import { test, expect, sheetNames, uploadFile } from './fixtures';

for (const slug of ['trim-excel-text', 'split-excel', 'excel-to-csv', 'remove-excel-duplicates']) {
  test(`${slug}: all worksheets remains the default before and after preview`, async ({ workbook, page }) => {
    await workbook.open(slug);
    await workbook.upload();
    expect((await workbook.process()).options.sheet).toBe('');
    await workbook.preview();
    await expect(page.getByTestId('select-process-sheet')).toHaveValue('');
    expect((await workbook.requests())[0].input).toMatchObject({
      file: { name: 'first.xlsx', dataBase64: uploadFile().buffer.toString('base64') },
    });
    expect((await workbook.requests())[0].input.sheet).toBeUndefined();
    expect((await workbook.process()).options.sheet).toBe('');
  });
}

for (const name of sheetNames) {
  test(`processing receives the exact worksheet identifier: ${JSON.stringify(name)}`, async ({ workbook, page }) => {
    await workbook.open();
    await workbook.upload();
    await workbook.preview();
    await page.getByTestId('select-process-sheet').selectOption(name);
    expect((await workbook.process()).options.sheet).toBe(name);
    // Processing selection must not request a new sample or change its picker.
    expect((await workbook.requests()).length).toBe(1);
    await expect(page.getByTestId('select-preview-sheet')).toHaveValue(sheetNames[0]);
  });
}

test('preview worksheet changes never change a selected processing worksheet or the all-sheet default', async ({ workbook, page }) => {
  await workbook.open();
  await workbook.upload();
  await workbook.preview();
  await page.getByTestId('select-preview-sheet').selectOption(sheetNames[1]);
  const second = await workbook.waitForRequests(2);
  expect(second.input.sheet).toBe(sheetNames[1]);
  await workbook.deliver(1);
  await expect(page.getByTestId('table-workbook-preview')).toContainText(`first workbook bytes: ${sheetNames[1]}`);
  expect((await workbook.process()).options.sheet).toBe('');
  await page.getByTestId('select-process-sheet').selectOption(sheetNames[1]);
  await page.getByTestId('select-preview-sheet').selectOption(sheetNames[2]);
  expect((await workbook.waitForRequests(3)).input.sheet).toBe(sheetNames[2]);
  await workbook.deliver(2);
  expect((await workbook.process()).options.sheet).toBe(sheetNames[1]);
  await page.getByTestId('select-process-sheet').selectOption('');
  expect((await workbook.process()).options.sheet).toBe('');
});

test('same-name file replacement clears worksheet selection, column settings, and the old sample', async ({ workbook, page }) => {
  await workbook.open('remove-excel-duplicates');
  await workbook.upload();
  await workbook.preview();
  await page.getByTestId('select-process-sheet').selectOption(sheetNames[1]);
  await page.getByLabel('Match column numbers (blank = all)', { exact: true }).fill('1,3');
  await workbook.upload('first.xlsx', 'replacement workbook bytes');
  await workbook.expectCleared();
  const processed = await workbook.process();
  expect(processed.options).toMatchObject({ sheet: '', columns: '' });
  expect(processed.files).toEqual([{ name: 'first.xlsx', dataBase64: uploadFile('first.xlsx', 'replacement workbook bytes').buffer.toString('base64') }]);
  await workbook.preview();
  expect((await workbook.requests())[1].input.sheet).toBeUndefined();
  await expect(page.getByTestId('table-workbook-preview')).toContainText('replacement workbook bytes: Summary');
  await expect(page.getByTestId('table-workbook-preview')).not.toContainText('first workbook bytes');
  await expect(page.getByTestId('select-process-sheet')).toHaveValue('');
});

test('removing and re-adding a workbook does not restore its selection or sample', async ({ workbook, page }) => {
  await workbook.open();
  await workbook.upload();
  await workbook.preview();
  await page.getByTestId('select-process-sheet').selectOption(sheetNames[2]);
  await page.getByRole('button', { name: 'Remove first.xlsx', exact: true }).click();
  await workbook.expectCleared();
  await expect(page.getByTestId('button-preview-workbook')).toHaveCount(0);
  await expect(page.getByTestId('button-process')).toBeDisabled();
  await workbook.upload();
  await workbook.expectCleared();
  expect((await workbook.process()).options.sheet).toBe('');
  await workbook.preview();
  await expect(page.getByTestId('select-process-sheet')).toHaveValue('');
});

test('rejected replacement preserves the current workbook, sample, and processing selection', async ({ workbook, page }) => {
  await workbook.open();
  await workbook.upload();
  await workbook.preview();
  await page.getByTestId('select-process-sheet').selectOption(sheetNames[1]);
  await page.getByTestId('input-file').setInputFiles({ name: 'invalid.txt', mimeType: 'text/plain', buffer: Buffer.from('wrong type') });
  await expect(page.getByTestId('list-problems')).toContainText('invalid.txt');
  await expect(page.getByTestId('table-workbook-preview')).toContainText('first workbook bytes');
  expect((await workbook.process()).options.sheet).toBe(sheetNames[1]);
});

for (const action of ['clear', 'replace', 'remove'] as const) {
  for (const outcome of ['success', 'error'] as const) {
    test(`late inspection ${outcome} cannot restore preview after ${action}`, async ({ workbook, page }) => {
      await workbook.open();
      await workbook.upload();
      await workbook.preview();
      await page.getByTestId('select-process-sheet').selectOption(sheetNames[1]);
      await page.getByTestId('select-preview-sheet').selectOption(sheetNames[2]);
      await workbook.waitForRequests(2);
      await expect(page.getByTestId('button-preview-workbook')).toBeDisabled();
      await expect(page.getByTestId('table-workbook-preview')).toHaveCount(0);
      if (action === 'clear') await page.getByRole('button', { name: 'Clear preview & sheet selection', exact: true }).click();
      if (action === 'replace') await workbook.upload('replacement.xlsx', 'replacement bytes');
      if (action === 'remove') await page.getByRole('button', { name: 'Remove first.xlsx', exact: true }).click();
      await workbook.expectCleared();
      expect((await workbook.requests())[1].aborted).toBe(true);
      await workbook.deliver(1, outcome === 'error' ? { error: 'Late inspection failure' } : undefined, outcome === 'error' ? 422 : 200);
      await workbook.expectCleared();
      if (action === 'remove') await workbook.upload('replacement.xlsx', 'replacement bytes');
      expect((await workbook.process()).options.sheet).toBe('');
      await workbook.preview();
      expect((await workbook.requests())[2].input.sheet).toBeUndefined();
      await expect(page.getByTestId('select-process-sheet')).toHaveValue('');
    });
  }
}

test('a superseded initial inspection cannot overwrite a newer preview', async ({ workbook, page }) => {
  await workbook.open();
  await workbook.upload();
  await page.getByTestId('button-preview-workbook').click();
  await workbook.waitForRequests(1);
  await page.getByRole('button', { name: 'Clear preview & sheet selection', exact: true }).click();
  await page.getByTestId('button-preview-workbook').click();
  await workbook.waitForRequests(2);
  await workbook.deliver(1);
  await page.getByTestId('select-preview-sheet').selectOption(sheetNames[2]);
  await workbook.waitForRequests(3);
  await workbook.deliver(2);
  await workbook.deliver(0);
  await expect(page.getByTestId('select-preview-sheet')).toHaveValue(sheetNames[2]);
  await expect(page.getByTestId('table-workbook-preview')).toContainText(sheetNames[2]);
});

test('initial inspection error is visible and can be retried without selecting a processing sheet', async ({ workbook, page }) => {
  await workbook.open();
  await workbook.upload();
  await page.getByTestId('button-preview-workbook').click();
  await workbook.waitForRequests(1);
  await workbook.deliver(0, { error: 'Workbook inspection failed' }, 422);
  await expect(page.getByRole('alert')).toContainText('Workbook inspection failed');
  await expect(page.getByRole('alert')).toContainText('Use the preview button to retry');
  await expect(page.getByTestId('table-workbook-preview')).toHaveCount(0);
  await expect(page.getByTestId('button-preview-workbook')).toBeEnabled();
  expect((await workbook.process()).options.sheet).toBe('');
  await workbook.preview();
  await expect(page.getByRole('alert')).toHaveCount(0);
  await expect(page.getByTestId('select-process-sheet')).toHaveValue('');
});

test('sheet inspection error hides the previous sample, retains processing selection, and retries the requested sheet', async ({ workbook, page }) => {
  await workbook.open();
  await workbook.upload();
  await workbook.preview();
  await page.getByTestId('select-process-sheet').selectOption(sheetNames[1]);
  await page.getByTestId('select-preview-sheet').selectOption(sheetNames[2]);
  await workbook.waitForRequests(2);
  await workbook.deliver(1, { error: 'Cannot inspect this sheet' }, 500);
  await expect(page.getByRole('alert')).toContainText('Cannot inspect this sheet');
  await expect(page.getByRole('alert')).toContainText('Use the preview button to retry');
  await expect(page.getByTestId('table-workbook-preview')).toHaveCount(0);
  expect((await workbook.process()).options.sheet).toBe(sheetNames[1]);
  await workbook.preview();
  expect((await workbook.requests())[2].input.sheet).toBe(sheetNames[2]);
  await expect(page.getByTestId('table-workbook-preview')).toContainText(sheetNames[2]);
  await expect(page.getByTestId('select-process-sheet')).toHaveValue(sheetNames[1]);
  await page.getByRole('button', { name: 'Clear preview & sheet selection', exact: true }).click();
  await workbook.expectCleared();
  expect((await workbook.process()).options.sheet).toBe('');
});

test('merge switches between workbook previews without selecting sheets or changing submitted file order', async ({ workbook, page }) => {
  await workbook.open('merge-excel');
  await page.getByTestId('input-file').setInputFiles([uploadFile(), uploadFile('second.xlsx', 'second workbook bytes')]);
  await expect(page.getByRole('button', { name: 'Remove second.xlsx', exact: true })).toBeVisible();
  await workbook.preview();
  await expect(page.getByTestId('select-process-sheet')).toHaveCount(0);
  await expect(page.getByText('This tool processes all worksheets. The picker below changes only the preview.')).toBeVisible();
  await page.getByTestId('select-preview-sheet').selectOption(sheetNames[1]);
  await workbook.waitForRequests(2);
  // Switching active workbooks aborts the previous workbook's pending preview.
  await page.getByRole('button', { name: /^second.xlsx/ }).click();
  await workbook.expectCleared();
  expect((await workbook.requests())[1].aborted).toBe(true);
  await workbook.preview();
  expect((await workbook.requests())[2].input.file.name).toBe('second.xlsx');
  expect((await workbook.requests())[2].input.sheet).toBeUndefined();
  await workbook.deliver(1);
  await expect(page.getByTestId('table-workbook-preview')).toContainText('second workbook bytes');
  await expect(page.getByTestId('table-workbook-preview')).not.toContainText('first workbook bytes');
  await page.getByRole('button', { name: /^first.xlsx/ }).click();
  await workbook.expectCleared();
  await workbook.preview();
  expect((await workbook.requests())[3].input.sheet).toBeUndefined();
  const processed = await workbook.process();
  expect(processed.files).toEqual([
    { name: 'first.xlsx', dataBase64: uploadFile().buffer.toString('base64') },
    { name: 'second.xlsx', dataBase64: uploadFile('second.xlsx', 'second workbook bytes').buffer.toString('base64') },
  ]);
  expect(processed.options).toEqual({});
  await page.getByTestId('button-down-0').click();
  expect((await workbook.process()).files.map((f) => f.name)).toEqual(['second.xlsx', 'first.xlsx']);
  await page.getByRole('button', { name: 'Remove first.xlsx', exact: true }).click();
  await workbook.expectCleared();
  await workbook.preview();
  expect((await workbook.requests())[4].input.file.name).toBe('second.xlsx');
  expect((await workbook.process()).files.map((f) => f.name)).toEqual(['second.xlsx']);
});

test('an all-worksheet-only tool never submits the preview worksheet', async ({ workbook, page }) => {
  await workbook.open('excel-statistics');
  await workbook.upload();
  await workbook.preview();
  await page.getByTestId('select-preview-sheet').selectOption(sheetNames[2]);
  await workbook.waitForRequests(2);
  await workbook.deliver(1);
  await expect(page.getByTestId('select-process-sheet')).toHaveCount(0);
  expect((await workbook.process()).options.sheet).toBe('');
});

test('merge inspection errors and retries stay with the active workbook', async ({ workbook, page }) => {
  await workbook.open('merge-excel');
  await page.getByTestId('input-file').setInputFiles([uploadFile(), uploadFile('second.xlsx', 'second workbook bytes')]);
  await expect(page.getByRole('button', { name: 'Remove second.xlsx', exact: true })).toBeVisible();
  await page.getByTestId('button-preview-workbook').click();
  await workbook.waitForRequests(1);
  await workbook.deliver(0, { error: 'Cannot inspect first workbook' }, 422);
  await expect(page.getByRole('alert')).toContainText('Use the preview button to retry');
  await page.getByRole('button', { name: /^second.xlsx/ }).click();
  await workbook.expectCleared();
  await page.getByTestId('button-preview-workbook').click();
  expect((await workbook.waitForRequests(2)).input.file.name).toBe('second.xlsx');
  await workbook.deliver(1, { error: 'Cannot inspect second workbook' }, 422);
  await expect(page.getByRole('alert')).toContainText('Use the preview button to retry');
  await workbook.preview();
  expect((await workbook.requests())[2].input.file.name).toBe('second.xlsx');
  await expect(page.getByRole('alert')).toHaveCount(0);
  await expect(page.getByTestId('table-workbook-preview')).toContainText('second workbook bytes');
  await expect(page.getByTestId('select-process-sheet')).toHaveCount(0);
  expect((await workbook.process()).options).toEqual({});
});
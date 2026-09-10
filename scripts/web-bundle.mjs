import assert from 'node:assert/strict';

export const WEB_BUNDLE_ROUTE_SOURCES = Object.freeze({
  editor: 'src/pages/StoryEditor.tsx',
  player: 'src/pages/StoryPlayer.tsx',
});

export const WEB_BUNDLE_BUDGETS = Object.freeze({
  initialJavaScriptBytes: 135 * 1024,
  initialStylesheetBytes: 24 * 1024,
  editorIncrementalBytes: 145 * 1024,
  playerIncrementalBytes: 95 * 1024,
});

export function collectStaticBundleAssets(manifest, entryKey) {
  const chunkKeys = new Set();
  const assets = new Set();
  const pending = [entryKey];

  while (pending.length > 0) {
    const chunkKey = pending.pop();
    if (chunkKeys.has(chunkKey)) continue;
    const chunk = manifest[chunkKey];
    assert.ok(chunk, 'Bundle manifest references missing chunk "' + chunkKey + '".');
    chunkKeys.add(chunkKey);
    if (isMeasuredAsset(chunk.file)) assets.add(chunk.file);
    for (const stylesheet of chunk.css ?? []) assets.add(stylesheet);
    pending.push(...(chunk.imports ?? []));
  }

  return { chunkKeys, assets };
}

export function analyzeWebBundle(manifest, compressedAssetBytes) {
  const entryKey = findChunkKey(manifest, (chunk) => chunk.isEntry === true, 'application entry');
  const editorKey = findSourceChunkKey(manifest, WEB_BUNDLE_ROUTE_SOURCES.editor);
  const playerKey = findSourceChunkKey(manifest, WEB_BUNDLE_ROUTE_SOURCES.player);
  const entry = manifest[entryKey];
  const initial = collectStaticBundleAssets(manifest, entryKey);
  const editor = collectStaticBundleAssets(manifest, editorKey);
  const player = collectStaticBundleAssets(manifest, playerKey);

  assert.equal(
    manifest[editorKey].isDynamicEntry,
    true,
    'Story Editor must remain a dynamic entry.',
  );
  assert.equal(
    manifest[playerKey].isDynamicEntry,
    true,
    'Story Player must remain a dynamic entry.',
  );
  assert.ok(
    entry.dynamicImports?.includes(editorKey),
    'The application entry must dynamically import Story Editor.',
  );
  assert.ok(
    entry.dynamicImports?.includes(playerKey),
    'The application entry must dynamically import Story Player.',
  );
  assert.ok(
    !initial.chunkKeys.has(editorKey),
    'Story Editor was pulled into the initial chunk graph.',
  );
  assert.ok(
    !initial.chunkKeys.has(playerKey),
    'Story Player was pulled into the initial chunk graph.',
  );

  const editorIncrementalAssets = difference(editor.assets, initial.assets);
  const playerIncrementalAssets = difference(player.assets, initial.assets);

  return {
    initialJavaScriptBytes: sumCompressedBytes(initial.assets, compressedAssetBytes, (asset) =>
      asset.endsWith('.js'),
    ),
    initialStylesheetBytes: sumCompressedBytes(initial.assets, compressedAssetBytes, (asset) =>
      asset.endsWith('.css'),
    ),
    editorIncrementalBytes: sumCompressedBytes(editorIncrementalAssets, compressedAssetBytes),
    playerIncrementalBytes: sumCompressedBytes(playerIncrementalAssets, compressedAssetBytes),
    assets: {
      initial: [...initial.assets].sort(),
      editorIncremental: [...editorIncrementalAssets].sort(),
      playerIncremental: [...playerIncrementalAssets].sort(),
    },
  };
}

export function assertWebBundleBudgets(metrics, budgets = WEB_BUNDLE_BUDGETS) {
  for (const [metric, maximumBytes] of Object.entries(budgets)) {
    assert.ok(
      metrics[metric] <= maximumBytes,
      metric +
        ' is ' +
        formatKibibytes(metrics[metric]) +
        ', above its ' +
        formatKibibytes(maximumBytes) +
        ' budget.',
    );
  }
}

export function formatWebBundleReport(metrics, budgets = WEB_BUNDLE_BUDGETS) {
  return [
    ['Initial JavaScript', 'initialJavaScriptBytes'],
    ['Initial stylesheets', 'initialStylesheetBytes'],
    ['Story Editor incremental assets', 'editorIncrementalBytes'],
    ['Story Player incremental assets', 'playerIncrementalBytes'],
  ]
    .map(
      ([label, metric]) =>
        label + ': ' + formatKibibytes(metrics[metric]) + ' / ' + formatKibibytes(budgets[metric]),
    )
    .join('\n');
}

function findSourceChunkKey(manifest, source) {
  return findChunkKey(manifest, (chunk, key) => chunk.src === source || key === source, source);
}

function findChunkKey(manifest, predicate, description) {
  const key = Object.entries(manifest).find(([candidateKey, chunk]) =>
    predicate(chunk, candidateKey),
  )?.[0];
  assert.ok(key, 'Bundle manifest is missing ' + description + '.');
  return key;
}

function difference(assets, excluded) {
  return new Set([...assets].filter((asset) => !excluded.has(asset)));
}

function sumCompressedBytes(assets, compressedAssetBytes, include = () => true) {
  let total = 0;
  for (const asset of assets) {
    if (!include(asset)) continue;
    const bytes =
      compressedAssetBytes instanceof Map
        ? compressedAssetBytes.get(asset)
        : compressedAssetBytes[asset];
    assert.ok(Number.isFinite(bytes), 'Missing compressed size for bundle asset "' + asset + '".');
    total += bytes;
  }
  return total;
}

function isMeasuredAsset(asset) {
  return typeof asset === 'string' && (asset.endsWith('.js') || asset.endsWith('.css'));
}

function formatKibibytes(bytes) {
  return (bytes / 1024).toFixed(1) + ' KiB';
}

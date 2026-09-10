import assert from 'node:assert/strict';
import test from 'node:test';
import {
  analyzeWebBundle,
  assertWebBundleBudgets,
  collectStaticBundleAssets,
  formatWebBundleReport,
} from './web-bundle.mjs';

const manifest = {
  'index.html': {
    file: 'assets/main.js',
    isEntry: true,
    imports: ['_shared.js'],
    dynamicImports: ['src/pages/StoryEditor.tsx', 'src/pages/StoryPlayer.tsx'],
    css: ['assets/main.css'],
  },
  '_shared.js': {
    file: 'assets/shared.js',
  },
  'src/pages/StoryEditor.tsx': {
    file: 'assets/editor.js',
    src: 'src/pages/StoryEditor.tsx',
    isDynamicEntry: true,
    imports: ['index.html', '_editor-vendor.js'],
    css: ['assets/editor.css'],
  },
  '_editor-vendor.js': {
    file: 'assets/editor-vendor.js',
    imports: ['_shared.js'],
  },
  'src/pages/StoryPlayer.tsx': {
    file: 'assets/player.js',
    src: 'src/pages/StoryPlayer.tsx',
    isDynamicEntry: true,
    imports: ['index.html', '_shared.js'],
  },
};

const compressedAssetBytes = {
  'assets/main.js': 60,
  'assets/main.css': 10,
  'assets/shared.js': 20,
  'assets/editor.js': 30,
  'assets/editor.css': 5,
  'assets/editor-vendor.js': 15,
  'assets/player.js': 25,
};

test('collects a static chunk graph once even when imports converge', () => {
  const result = collectStaticBundleAssets(manifest, 'src/pages/StoryEditor.tsx');

  assert.deepEqual([...result.chunkKeys].sort(), [
    '_editor-vendor.js',
    '_shared.js',
    'index.html',
    'src/pages/StoryEditor.tsx',
  ]);
  assert.deepEqual([...result.assets].sort(), [
    'assets/editor-vendor.js',
    'assets/editor.css',
    'assets/editor.js',
    'assets/main.css',
    'assets/main.js',
    'assets/shared.js',
  ]);
});

test('measures only route assets not already loaded by the application entry', () => {
  const metrics = analyzeWebBundle(manifest, compressedAssetBytes);

  assert.deepEqual(metrics, {
    initialJavaScriptBytes: 80,
    initialStylesheetBytes: 10,
    editorIncrementalBytes: 50,
    playerIncrementalBytes: 25,
    assets: {
      initial: ['assets/main.css', 'assets/main.js', 'assets/shared.js'],
      editorIncremental: ['assets/editor-vendor.js', 'assets/editor.css', 'assets/editor.js'],
      playerIncremental: ['assets/player.js'],
    },
  });
  assert.doesNotThrow(() =>
    assertWebBundleBudgets(metrics, {
      initialJavaScriptBytes: 80,
      initialStylesheetBytes: 10,
      editorIncrementalBytes: 50,
      playerIncrementalBytes: 25,
    }),
  );
});

test('rejects eager routes, missing chunks, and exceeded budgets with explicit errors', () => {
  const eagerManifest = structuredClone(manifest);
  eagerManifest['index.html'].imports.push('src/pages/StoryEditor.tsx');
  assert.throws(
    () => analyzeWebBundle(eagerManifest, compressedAssetBytes),
    /Story Editor was pulled into the initial chunk graph/,
  );

  const brokenManifest = structuredClone(manifest);
  brokenManifest['src/pages/StoryPlayer.tsx'].imports.push('_missing.js');
  assert.throws(
    () => analyzeWebBundle(brokenManifest, compressedAssetBytes),
    /missing chunk "_missing.js"/,
  );

  const metrics = analyzeWebBundle(manifest, compressedAssetBytes);
  assert.throws(
    () =>
      assertWebBundleBudgets(metrics, {
        initialJavaScriptBytes: 79,
        initialStylesheetBytes: 10,
        editorIncrementalBytes: 50,
        playerIncrementalBytes: 25,
      }),
    /InitialJavaScriptBytes is 0.1 KiB, above its 0.1 KiB budget/i,
  );
  assert.match(formatWebBundleReport(metrics), /Story Editor incremental assets: 0.0 KiB/);
});

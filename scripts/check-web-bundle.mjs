import { readFile } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';
import { analyzeWebBundle, assertWebBundleBudgets, formatWebBundleReport } from './web-bundle.mjs';

const webDist = new URL('../apps/web/dist/', import.meta.url);
const manifest = JSON.parse(await readFile(new URL('.vite/manifest.json', webDist), 'utf8'));
const assetNames = new Set();

for (const chunk of Object.values(manifest)) {
  if (typeof chunk.file === 'string' && isMeasuredAsset(chunk.file)) {
    assetNames.add(chunk.file);
  }
  for (const stylesheet of chunk.css ?? []) assetNames.add(stylesheet);
}

const compressedAssetBytes = new Map(
  await Promise.all(
    [...assetNames].map(async (asset) => [
      asset,
      gzipSync(await readFile(new URL(asset, webDist))).byteLength,
    ]),
  ),
);
const metrics = analyzeWebBundle(manifest, compressedAssetBytes);

assertWebBundleBudgets(metrics);
console.log(formatWebBundleReport(metrics));

function isMeasuredAsset(asset) {
  return asset.endsWith('.js') || asset.endsWith('.css');
}

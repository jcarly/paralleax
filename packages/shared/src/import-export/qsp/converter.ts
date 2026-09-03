import type { QspSourceLocation } from './models.js';

// eslint-disable-next-line @typescript-eslint/ban-ts-comment -- the dependency's invalid exports map makes the error compiler-dependent.
// @ts-ignore -- @qsp/converters 1.0.1 publishes declarations outside its exports map.
import * as qspConvertersPackage from '@qsp/converters';

const {
  readQsp: readQspPackage,
  readQsps: readQspsPackage,
  writeQsp: writeQspPackage,
} = qspConvertersPackage;

export const readQsp = readQspPackage as (buffer: ArrayBuffer) => QspSourceLocation[];
export const readQsps = readQspsPackage as (content: string) => QspSourceLocation[];
export const writeQsp = writeQspPackage as (locations: QspSourceLocation[]) => ArrayBuffer;

/** Uploaded clips on disk, in MEDIA_DIR, named by a random id so a name is never guessed or reused. */

import { randomUUID } from 'crypto';
import { mkdirSync, unlinkSync, writeFileSync } from 'fs';
import { join } from 'path';

import { MEDIA_DIR } from './db';

/** Only names this app made: an id and an extension. Anything else is refused before touching disk. */
export const SAFE_NAME = /^[0-9a-f-]{36}\.[a-z0-9]{2,5}$/;

export const pathOf = (file: string) => join(MEDIA_DIR, file);

export function saveUpload(bytes: Uint8Array, ext: string): string {
  mkdirSync(MEDIA_DIR, { recursive: true });
  const file = `${randomUUID()}.${ext}`;
  writeFileSync(pathOf(file), bytes);
  return file;
}

export function removeFiles(files: string[]): void {
  for (const file of files) {
    if (!SAFE_NAME.test(file)) continue;
    try {
      unlinkSync(pathOf(file));
    } catch { /* already gone */ }
  }
}

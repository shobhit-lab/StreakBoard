// Functions deploy as isolated folders, so copy shared/ into each one before deploy/test.
import { cpSync, readdirSync, mkdirSync } from 'node:fs';
for (const fn of readdirSync('functions')) {
  mkdirSync(`functions/${fn}/src/shared`, { recursive: true });
  cpSync('shared', `functions/${fn}/src/shared`, { recursive: true });
}
console.log('shared/ synced into functions/*/src/shared');

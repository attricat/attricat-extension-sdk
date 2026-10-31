#!/usr/bin/env node
// Checks that wit/ holds exactly the released host ABIs of the Attricat core
// repository (crates/extension-runtime/wit-released). Set ATTRICAT_CORE_DIR
// to the core checkout; it defaults to the sibling `attricat/main` checkout.
// Skips when that directory does not exist.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const vendored = join(root, 'wit');
const released = join(
  resolve(process.env.ATTRICAT_CORE_DIR ?? join(root, '..', 'attricat', 'main')),
  'crates',
  'extension-runtime',
  'wit-released',
);
const snapshot = /^attricat-host-\d+\.\d+\.\d+\.wit$/;

if (!existsSync(released)) {
  console.log(`Skipped: no released host ABIs at ${released}`);
  process.exit(0);
}
const names = (directory) => readdirSync(directory).filter((name) => snapshot.test(name)).sort();
const problems = [];
for (const name of names(released)) {
  const copy = join(vendored, name);
  if (!existsSync(copy)) problems.push(`missing ${name}`);
  else if (readFileSync(copy, 'utf8') !== readFileSync(join(released, name), 'utf8'))
    problems.push(`${name} differs`);
}
for (const name of names(vendored))
  if (!existsSync(join(released, name))) problems.push(`${name} is not released in core`);
if (problems.length) {
  console.error(`wit/ does not match ${released}: ${problems.join(', ')}.\nCopy every released snapshot verbatim.`);
  process.exit(1);
}
console.log(`wit/ matches ${released}`);

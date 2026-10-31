#!/usr/bin/env node
// Checks that the vendored contract equals the Attricat core repository's
// copy. Set ATTRICAT_CORE_DIR to the core checkout; it defaults to the
// sibling `attricat/main` checkout. Skips when that copy does not exist.
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const packageRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const vendored = join(packageRoot, 'contract', 'ui-kit-v1.schema.json');

export const coreContractPath = () =>
  join(
    resolve(process.env.ATTRICAT_CORE_DIR ?? join(packageRoot, '..', '..', '..', 'attricat', 'main')),
    'contracts',
    'ui-kit-v1.schema.json',
  );

/** `skipped` when the core copy is absent, else whether both files are equal. */
export const checkContract = (core = coreContractPath()) => {
  if (!existsSync(core)) return { status: 'skipped', core };
  const same = readFileSync(core, 'utf8') === readFileSync(vendored, 'utf8');
  return { status: same ? 'equal' : 'different', core };
};

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const { status, core } = checkContract();
  if (status === 'skipped') console.log(`Skipped: no core contract at ${core}`);
  else if (status === 'equal') console.log(`Vendored contract equals ${core}`);
  else {
    console.error(`Vendored contract differs from ${core}.\nCopy it to contract/ui-kit-v1.schema.json and run \`pnpm generate\`.`);
    process.exit(1);
  }
}

import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
// @ts-expect-error The generator is a plain script without declarations.
import { contractPath, generate, generatedDir } from '../scripts/generate.mjs';
// @ts-expect-error The check is a plain script without declarations.
import { checkContract } from '../scripts/check-contract.mjs';

const contract = JSON.parse(readFileSync(contractPath, 'utf8'));

describe('generated UI kit', () => {
  const files = generate(contract) as Record<string, string>;
  for (const [file, content] of Object.entries(files))
    it(`src/generated/${file} matches the contract`, () => {
      const path = join(generatedDir, file);
      if (process.env.UPDATE === '1') writeFileSync(path, content);
      expect(
        readFileSync(path, 'utf8') === content,
        `src/generated/${file} is stale: run \`pnpm generate\` (or UPDATE=1 pnpm test)`,
      ).toBe(true);
    });

  it('matches the core repository contract when it is available', (context) => {
    const { status, core } = checkContract();
    if (status === 'skipped') context.skip(`no core contract at ${core}`);
    expect(status, `contract differs from ${core}`).toBe('equal');
  });
});

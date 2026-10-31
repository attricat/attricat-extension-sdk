import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { Worker } from 'node:worker_threads';
import { afterAll, describe, expect, it } from 'vitest';
import { build, defaultClientConditions, mergeConfig } from 'vite';
import { ThreadMessagePort } from '@quilted/threads';
import { attricatExtension } from '../src/vite.js';
import { TestReceiver, textOf, elementsOf } from '../src/receiver.js';
import type { HostExports, WorkerExports } from '../src/protocol.js';

const fixture = fileURLToPath(new URL('./fixtures/basic', import.meta.url));
const source = fileURLToPath(new URL('../src/index.ts', import.meta.url));
const scratch = mkdtempSync(join(tmpdir(), 'attricat-vite-'));
afterAll(() => rmSync(scratch, { recursive: true, force: true }));

/** Builds the fixture into a fresh directory with the preset. */
const buildFixture = async (options: { budgetBytes?: number } = {}) => {
  const out = mkdtempSync(join(scratch, 'build-'));
  await build(
    mergeConfig(attricatExtension({ entry: 'src/main.tsx', outFile: join(out, 'ui.js'), ...options }), {
      root: fixture,
      configFile: false,
      logLevel: 'silent',
      resolve: {
        // Use the SDK's sources rather than a built `dist`.
        conditions: ['source', ...defaultClientConditions],
        alias: [{ find: /^@attricat\/extension$/, replacement: source }],
      },
    }),
  );
  return out;
};

const until = async (check: () => boolean) => {
  for (let attempt = 0; attempt < 200 && !check(); attempt += 1)
    await new Promise((resolve) => setTimeout(resolve, 5));
  expect(check()).toBe(true);
};

describe('attricatExtension preset', () => {
  it('builds one classic script and its build record', async () => {
    const out = await buildFixture();
    const code = readFileSync(join(out, 'ui.js'), 'utf8');
    expect(JSON.parse(readFileSync(join(out, 'ui.js.build.json'), 'utf8'))).toEqual({ ui_kit: '1.0.0' });
    expect(Buffer.byteLength(code)).toBeLessThan(1_048_576);
    // A classic script: it parses as a script, not only as a module.
    expect(() => new vm.Script(code)).not.toThrow();
    // No dynamic import() calls (a `static import(` method is fine).
    expect(code).not.toMatch(/(?<!static )(?<![\w.$])import\s*\(/);

    // Run it as the sandbox frame would: a classic script in its own realm,
    // handed the extension's port by an init message.
    const channel = new MessageChannel();
    const registered: string[][] = [];
    const requests: unknown[] = [];
    const host = new ThreadMessagePort<WorkerExports, HostExports>(channel.port1, {
      exports: {
        ready: async (ids) => void registered.push([...ids]),
        request: async (...args) => void requests.push(args),
      },
    });
    channel.port1.start();
    const prelude = `
      const { workerData } = require('node:worker_threads');
      let listener;
      globalThis.WorkerGlobalScope = class { static [Symbol.hasInstance]() { return true; } };
      globalThis.addEventListener = (type, added) => { if (type === 'message') listener = added; };
      globalThis.removeEventListener = () => {};
      setTimeout(() => listener({ data: { type: 'attricat:native-init.v1' }, ports: [workerData.port] }), 0);
    `;
    const errors: unknown[] = [];
    const worker = new Worker(`${prelude}\n${code}`, {
      eval: true,
      workerData: { port: channel.port2 },
      transferList: [channel.port2 as never],
    });
    worker.on('error', (error) => errors.push(error));
    await until(() => registered.length === 1);
    expect(registered[0]).toEqual(['panel']);
    const receiver = new TestReceiver();
    await host.imports.mount('1', 'panel', receiver.connection, {
      context: { record_id: 'r1' },
      configuration: null,
      capabilities: [],
      locale: 'en',
      theme: { color_mode: 'light' },
      ui_kit: '1.0.0',
    });
    await until(() => textOf(receiver.root).includes('Record r1: 0'));
    await elementsOf(receiver.root).find((node) => node.name === 'Button')!.listeners.press!({});
    await until(() => textOf(receiver.root).includes('Record r1: 1'));
    expect(requests).toEqual([['1', 'notify', { message: 'pressed' }]]);
    expect(receiver.warnings).toEqual([]);
    expect(errors).toEqual([]);
    channel.port1.close();
    await worker.terminate();
  }, 30_000);

  it('fails a build over its budget', async () => {
    await expect(buildFixture({ budgetBytes: 1_000 })).rejects.toThrow(/over its budget of 1,000 bytes/);
  }, 30_000);

  it('returns a Vite config with React aliases and no code splitting', () => {
    const config = attricatExtension({ entry: 'src/main.tsx' });
    expect(config.build?.lib && config.build.lib.formats).toEqual(['iife']);
    expect(config.build?.outDir).toBe('dist');
    expect(existsSync(fixture)).toBe(true);
    expect(JSON.stringify(config.resolve?.alias)).toContain('preact/compat');
  });
});

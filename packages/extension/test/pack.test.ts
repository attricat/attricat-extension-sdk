import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { main, pack, ustar } from '../src/pack.js';

const scratch = mkdtempSync(join(tmpdir(), 'attricat-pack-'));
afterAll(() => rmSync(scratch, { recursive: true, force: true }));

const longPath = `dist/${'nested/'.repeat(16)}server.wasm`;
const manifest = {
  manifest_version: 1,
  name: 'Acme',
  version: '1.2.3',
  icons: { '48': 'assets/icon-48.svg' },
  attricat: { id: 'acme.native', host_api: '^1.0' },
  artifacts: [
    { id: 'ui', kind: 'client_native', path: 'dist/ui.js', ui_kit: '^1.0' },
    { id: 'server', kind: 'server_wasm', path: longPath },
  ],
};

const extension = (files: Record<string, string>) => {
  const root = mkdtempSync(join(scratch, 'extension-'));
  for (const [path, content] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), content);
  }
  return root;
};

const complete = () =>
  extension({
    'manifest.json': JSON.stringify(manifest),
    'README.md': '# Acme',
    'assets/icon-48.svg': '<svg/>',
    'assets/screens/one.png': 'png',
    'dist/ui.js': '(function(){})();',
    'dist/ui.js.build.json': '{"ui_kit":"1.0.0"}\n',
    [longPath]: 'wasm',
    'src/main.tsx': 'not packed',
  });

const hasTarZstd = spawnSync('tar', ['--zstd', '--version']).status === 0;

describe('pack', () => {
  it('writes the manifest, README, assets, artifacts and build records', () => {
    const root = complete();
    const { archive, files } = pack({ root });
    expect(archive).toBe(join(root, 'dist', 'acme.native-1.2.3.tar.zst'));
    expect(files).toEqual([
      'manifest.json',
      'README.md',
      'assets/icon-48.svg',
      'assets/screens/one.png',
      longPath,
      'dist/ui.js',
      'dist/ui.js.build.json',
    ]);
  });

  it.runIf(hasTarZstd)('round-trips through the system tar', () => {
    const root = complete();
    const { archive, files } = pack({ root });
    const listed = spawnSync('tar', ['--zstd', '-tf', archive], { encoding: 'utf8' });
    expect(listed.status, listed.stderr).toBe(0);
    expect(listed.stdout.trim().split('\n')).toEqual(files);
    const out = mkdtempSync(join(scratch, 'extract-'));
    const extracted = spawnSync('tar', ['--zstd', '-xf', archive, '-C', out], { encoding: 'utf8' });
    expect(extracted.status, extracted.stderr).toBe(0);
    for (const file of files) expect(readFileSync(join(out, file))).toEqual(readFileSync(join(root, file)));
  });

  it('refuses a native artifact without its build record', () => {
    const root = complete();
    rmSync(join(root, 'dist/ui.js.build.json'));
    expect(() => pack({ root })).toThrow("artifact 'ui''s build record 'dist/ui.js.build.json' does not exist");
  });

  it('refuses paths outside the extension', () => {
    const root = extension({
      'manifest.json': JSON.stringify({ ...manifest, icons: {}, artifacts: [{ id: 'x', kind: 'client_frame', path: '../x.js' }] }),
    });
    expect(() => pack({ root })).toThrow('must be relative');
  });

  it('pads entries to 512-byte blocks and ends with two empty blocks', () => {
    const tar = ustar([{ path: 'a.txt', data: Buffer.from('hello') }]);
    expect(tar.length).toBe(512 * 4);
    expect(tar.subarray(257, 263).toString()).toBe('ustar\0');
  });

  it('runs as a command with an exit code', () => {
    const root = complete();
    const logs: unknown[] = [];
    const original = console.log;
    console.log = (...args: unknown[]) => void logs.push(args.join(' '));
    try {
      expect(main(['--root', root, '--out-dir', 'out'])).toBe(0);
    } finally {
      console.log = original;
    }
    expect(String(logs[0])).toMatch(/acme\.native-1\.2\.3\.tar\.zst \(7 files\)/);
    const error = console.error;
    console.error = () => {};
    try {
      expect(main(['--bogus'])).toBe(2);
      expect(main(['--root', join(scratch, 'missing')])).toBe(1);
    } finally {
      console.error = error;
    }
  });
});

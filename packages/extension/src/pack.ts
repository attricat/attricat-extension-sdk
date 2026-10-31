import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, posix, relative, resolve, sep } from 'node:path';
import * as zlib from 'node:zlib';
import { buildRecordSuffix, nativeBudgets } from './protocol.js';

const nativeArtifactKind = 'client_native';
const blockSize = 512;

export type ArchiveEntry = { path: string; data: Uint8Array };

type Manifest = {
  version?: unknown;
  attricat?: { id?: unknown };
  icons?: Record<string, unknown>;
  artifacts?: { id?: unknown; kind?: unknown; path?: unknown }[];
};

const fail = (message: string): never => {
  throw new Error(`attricat-pack: ${message}`);
};

/** A safe archive path: relative, forward slashes, no `..`. */
const archivePath = (path: unknown, what: string) => {
  if (typeof path !== 'string' || !path) return fail(`${what} has no path`);
  const normalized = posix.normalize(path);
  if (path.includes('\\') || posix.isAbsolute(path) || normalized.startsWith('..') || normalized !== path)
    fail(`${what} path '${path}' must be relative, normalized and inside the extension`);
  return normalized;
};

const octal = (value: number, length: number) => value.toString(8).padStart(length - 1, '0') + '\0';

/** Splits a path into ustar `prefix` and `name` fields. */
const splitPath = (path: string) => {
  if (Buffer.byteLength(path) <= 100) return { prefix: '', name: path };
  for (let index = path.lastIndexOf('/'); index > 0; index = path.lastIndexOf('/', index - 1)) {
    const prefix = path.slice(0, index);
    const name = path.slice(index + 1);
    if (Buffer.byteLength(prefix) <= 155 && Buffer.byteLength(name) <= 100) return { prefix, name };
  }
  return fail(`'${path}' is too long for a tar archive`);
};

/** A POSIX ustar archive of regular files, with fixed owners and times. */
export const ustar = (entries: readonly ArchiveEntry[], mtime = 0): Buffer => {
  const blocks: Buffer[] = [];
  for (const { path, data } of entries) {
    const header = Buffer.alloc(blockSize);
    const { prefix, name } = splitPath(path);
    header.write(name, 0, 100, 'utf8');
    header.write(octal(0o644, 8), 100, 'ascii');
    header.write(octal(0, 8), 108, 'ascii');
    header.write(octal(0, 8), 116, 'ascii');
    header.write(octal(data.byteLength, 12), 124, 'ascii');
    header.write(octal(mtime, 12), 136, 'ascii');
    header.write('        ', 148, 'ascii');
    header.write('0', 156, 'ascii');
    header.write('ustar\0', 257, 'ascii');
    header.write('00', 263, 'ascii');
    header.write(prefix, 345, 155, 'utf8');
    let checksum = 0;
    for (const byte of header) checksum += byte;
    header.write(`${checksum.toString(8).padStart(6, '0')}\0 `, 148, 'ascii');
    blocks.push(header, Buffer.from(data));
    const padding = (blockSize - (data.byteLength % blockSize)) % blockSize;
    if (padding) blocks.push(Buffer.alloc(padding));
  }
  blocks.push(Buffer.alloc(blockSize * 2));
  return Buffer.concat(blocks);
};

/** Zstandard-compresses with Node's zlib, or the `zstd` command where Node lacks it. */
export const zstd = (data: Buffer): Buffer => {
  const compress = (zlib as { zstdCompressSync?: (data: Buffer) => Buffer }).zstdCompressSync;
  if (compress) return compress(data);
  const result = spawnSync('zstd', ['-q', '-c'], { input: data, maxBuffer: 1 << 30 });
  if (result.status !== 0) fail('this Node has no zstd support and the `zstd` command failed');
  return result.stdout;
};

const filesBelow = (root: string, directory: string): string[] =>
  readdirSync(join(root, directory), { withFileTypes: true }).flatMap((entry) => {
    const path = posix.join(directory, entry.name);
    if (entry.isDirectory()) return filesBelow(root, path);
    return entry.isFile() ? [path] : [];
  });

export type PackOptions = {
  /** The extension root, holding manifest.json. */
  root?: string;
  /** Where the archive goes, relative to the root. */
  outDir?: string;
};

/**
 * Writes `<outDir>/<id>-<version>.tar.zst` with what Attricat installs: the
 * manifest, the README, icons and `assets/` when present, every declared
 * artifact and each client_native artifact's build record.
 */
export const pack = ({ root = process.cwd(), outDir = 'dist' }: PackOptions = {}) => {
  root = resolve(root);
  const manifestFile = join(root, 'manifest.json');
  if (!existsSync(manifestFile)) fail(`no manifest.json in ${root}`);
  let manifest: Manifest;
  try {
    manifest = JSON.parse(readFileSync(manifestFile, 'utf8')) as Manifest;
  } catch (error) {
    return fail(`manifest.json is not valid JSON: ${(error as Error).message}`);
  }
  const id = manifest.attricat?.id;
  const version = manifest.version;
  if (typeof id !== 'string' || !id) fail('manifest.json has no attricat.id');
  if (typeof version !== 'string' || !version) fail('manifest.json has no version');

  const paths = new Set<string>();
  const add = (path: string, what: string) => {
    if (!existsSync(join(root, path)) || !statSync(join(root, path)).isFile())
      fail(`${what} '${path}' does not exist; build it first`);
    paths.add(path);
  };
  if (existsSync(join(root, 'README.md'))) paths.add('README.md');
  for (const [size, icon] of Object.entries(manifest.icons ?? {})) add(archivePath(icon, `icon ${size}`), `icon ${size}`);
  if (existsSync(join(root, 'assets')) && statSync(join(root, 'assets')).isDirectory())
    for (const path of filesBelow(root, 'assets')) paths.add(path);
  for (const artifact of manifest.artifacts ?? []) {
    const what = `artifact '${String(artifact.id)}'`;
    const path = archivePath(artifact.path, what);
    add(path, what);
    if (artifact.kind === nativeArtifactKind) {
      const bytes = statSync(join(root, path)).size;
      if (bytes > nativeBudgets.maximumArtifactBytes)
        fail(`${what} is ${bytes} bytes; client_native artifacts may be at most ${nativeBudgets.maximumArtifactBytes}`);
      add(`${path}${buildRecordSuffix}`, `${what}'s build record`);
    }
  }
  paths.delete('manifest.json');
  const entries: ArchiveEntry[] = ['manifest.json', ...[...paths].sort()].map((path) => ({
    path,
    data: readFileSync(join(root, path)),
  }));
  const directory = resolve(root, outDir);
  const archive = join(directory, `${id}-${version}.tar.zst`);
  mkdirSync(directory, { recursive: true });
  writeFileSync(archive, zstd(ustar(entries)));
  return { archive, files: entries.map((entry) => entry.path) };
};

const usage = `Usage: attricat-pack [--root <dir>] [--out-dir <dir>]

Packs the extension in <dir> (default: the current directory) into
<out-dir>/<id>-<version>.tar.zst (default out-dir: dist), reading manifest.json.`;

/** The `attricat-pack` command; answers its exit code. */
export const main = (argv: readonly string[]) => {
  const options: PackOptions = {};
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--help' || argument === '-h') {
      console.log(usage);
      return 0;
    }
    if (argument === '--root' || argument === '--out-dir') {
      const value = argv[++index];
      if (!value) {
        console.error(`${argument} needs a value\n\n${usage}`);
        return 2;
      }
      if (argument === '--root') options.root = value;
      else options.outDir = value;
      continue;
    }
    console.error(`Unknown argument '${argument}'\n\n${usage}`);
    return 2;
  }
  try {
    const { archive, files } = pack(options);
    console.log(`Created ${relative(process.cwd(), archive).split(sep).join('/')} (${files.length} files)`);
    return 0;
  } catch (error) {
    console.error((error as Error).message);
    return 1;
  }
};

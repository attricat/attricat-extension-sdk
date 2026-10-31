import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { basename, dirname, join } from 'node:path';
import type { Plugin, UserConfig } from 'vite';
import { buildRecordSuffix, nativeBudgets } from './protocol.js';

export { buildRecordSuffix };

export type AttricatExtensionOptions = {
  /** The module that registers the contributions, such as `src/main.tsx`. */
  entry: string;
  /** Where the artifact goes, relative to the project root. */
  outFile?: string;
  /** The build fails when the artifact is larger, in bytes. */
  budgetBytes?: number;
  /** Overrides the UI kit version recorded; defaults to the installed `@attricat/ui-kit`. */
  uiKitVersion?: string;
  /** Minify the artifact. */
  minify?: boolean;
};

/** The UI kit version of the `@attricat/ui-kit` the project at `root` installs. */
export const installedUiKitVersion = (root: string) => {
  for (const from of [join(root, 'package.json'), import.meta.url])
    try {
      const path = createRequire(from).resolve('@attricat/ui-kit/contract');
      return (JSON.parse(readFileSync(path, 'utf8')) as { version: string }).version;
    } catch {
      // Try the SDK's own copy next.
    }
  throw new Error('@attricat/ui-kit is not installed');
};

const formatBytes = (bytes: number) => `${bytes.toLocaleString('en')} bytes`;

/**
 * Checks the one artifact the build produced and records the UI kit version
 * it was built against beside it.
 */
export const attricatBuildPlugin = ({
  outFile,
  budgetBytes,
  uiKitVersion,
}: {
  outFile: string;
  budgetBytes: number;
  uiKitVersion?: string;
}): Plugin => {
  let root = process.cwd();
  return {
    name: 'attricat:native-artifact',
    apply: 'build',
    config: () => ({ define: { 'process.env.NODE_ENV': JSON.stringify('production') } }),
    configResolved(config) {
      root = config.root;
    },
    generateBundle(_options, bundle) {
      const fileName = basename(outFile);
      const outputs = Object.values(bundle);
      const chunks = outputs.filter((output) => output.type === 'chunk');
      const others = outputs.filter((output) => output.type !== 'chunk').map((output) => output.fileName);
      if (chunks.length !== 1 || chunks[0]!.fileName !== fileName)
        this.error(
          `A native artifact is one script; this build produced ${chunks.map((chunk) => chunk.fileName).join(', ')}`,
        );
      if (others.length)
        this.error(
          `A native artifact cannot load other files (${others.join(', ')}); the host draws everything, so remove stylesheet and asset imports`,
        );
      const chunk = chunks[0]!;
      if (chunk.type !== 'chunk') return;
      if (chunk.imports.length || chunk.dynamicImports.length)
        this.error(`A native artifact cannot import other modules at runtime: ${[...chunk.imports, ...chunk.dynamicImports].join(', ')}`);
      const bytes = Buffer.byteLength(chunk.code);
      if (bytes > budgetBytes)
        this.error(
          `${outFile} is ${formatBytes(bytes)}, over its budget of ${formatBytes(budgetBytes)} (Attricat accepts at most ${formatBytes(nativeBudgets.maximumArtifactBytes)})`,
        );
      this.emitFile({
        type: 'asset',
        fileName: `${fileName}${buildRecordSuffix}`,
        source: `${JSON.stringify({ ui_kit: uiKitVersion ?? installedUiKitVersion(root) })}\n`,
      });
    },
  };
};

/**
 * The preset's Vite config. It names its own fields instead of Vite's
 * `UserConfig`, so it type-checks against whichever copy of Vite the project
 * uses, as with a `link:` dependency on the SDK.
 */
export type AttricatViteConfig = {
  publicDir: false;
  resolve: { dedupe: string[]; alias: { find: RegExp; replacement: string }[] };
  esbuild: { jsx: 'automatic'; jsxImportSource: string };
  build: {
    outDir: string;
    emptyOutDir: boolean;
    copyPublicDir: boolean;
    target: string;
    minify: boolean;
    sourcemap: boolean;
    modulePreload: boolean;
    reportCompressedSize: boolean;
    lib: { entry: string; formats: 'iife'[]; name: string; fileName: () => string };
    rollupOptions: { output: { inlineDynamicImports: boolean } };
  };
  plugins: any[];
  /** Vitest options, read when the project's tests use this config. */
  test: {
    environment: 'node';
    server: { deps: { inline: RegExp[] } };
  };
};


/**
 * A Vite config that builds an extension's native UI into one self-contained
 * classic script for the host's sandboxed Worker: no code splitting, no
 * runtime imports (the Worker has no network), Preact with `react` aliased to
 * `preact/compat`, a size budget, and `<outFile>.build.json` naming the UI kit
 * version. Use it as `export default defineConfig(attricatExtension({ entry }))`.
 */
export const attricatExtension = ({
  entry,
  outFile = 'dist/ui.js',
  budgetBytes = nativeBudgets.maximumArtifactBytes,
  uiKitVersion,
  minify = true,
}: AttricatExtensionOptions): AttricatViteConfig => ({
  publicDir: false,
  resolve: {
    // One Preact for the extension, the SDK and the UI kit, even when linked.
    dedupe: ['preact'],
    alias: [
      { find: /^react$/, replacement: 'preact/compat' },
      { find: /^react-dom\/test-utils$/, replacement: 'preact/test-utils' },
      { find: /^react-dom(\/client)?$/, replacement: 'preact/compat' },
      { find: /^react\/jsx-(dev-)?runtime$/, replacement: 'preact/jsx-runtime' },
    ],
  },
  esbuild: { jsx: 'automatic', jsxImportSource: 'preact' },
  build: {
    outDir: dirname(outFile),
    emptyOutDir: false,
    copyPublicDir: false,
    target: 'es2022',
    minify,
    sourcemap: false,
    modulePreload: false,
    reportCompressedSize: false,
    lib: {
      entry,
      // The host starts a classic Worker from a blob: URL: no ES module syntax.
      formats: ['iife'],
      name: 'AttricatExtension',
      fileName: () => basename(outFile),
    },
    rollupOptions: { output: { inlineDynamicImports: true } },
  },
  plugins: [attricatBuildPlugin({ outFile, budgetBytes, uiKitVersion })],
  // Vitest: render contributions with `@attricat/extension/testing` in Node,
  // passing the SDK through Vite so Preact is deduplicated.
  test: {
    environment: 'node',
    server: { deps: { inline: [/@attricat\//, /@remote-dom\//, /@quilted\//] } },
  },
}) satisfies Omit<UserConfig, 'plugins'> & AttricatViteConfig;

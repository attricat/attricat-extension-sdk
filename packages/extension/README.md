# @attricat/extension

Write Attricat native UI contributions with Preact.

| Import | Exports |
| --- | --- |
| `@attricat/extension` | `register`, `useOutletContext`, `useLocale`, `useTheme`, `useConfiguration`, `useCapabilities`, `useUiKitVersion`, `useAttricat`, `useEditor`, and the client and outlet context types. In the extension's Worker it also starts the runtime. |
| `@attricat/extension/vite` | `attricatExtension(options)`, a full Vite config building one classic-script Worker bundle and its `.build.json`. |
| `@attricat/extension/pack` | `pack({ root, outDir })`, `ustar`, `zstd`, `main`. The `attricat-pack` command runs it. |
| `@attricat/extension/testing` | `renderContribution(Component, options)` for Vitest. |

See the [repository README](../../README.md) for a walkthrough.

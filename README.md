# Attricat extension SDK

Write the native UI of an Attricat extension with Preact.

Attricat runs an extension's native UI code in a dedicated Web Worker inside a
hidden, sandboxed frame with no network access. The code composes elements of
the **Attricat UI kit**; Attricat validates the tree and draws it with its own
components, so the extension looks and behaves like the rest of the app in
both themes. This SDK covers the extension author's side:

| Package | What it is |
| --- | --- |
| [`@attricat/ui-kit`](packages/ui-kit) (1.0.0) | One Preact component per UI kit element (`Stack`, `Text`, `TextField`, `Button`, `Table`, …), generated from the UI kit contract, plus `UI_KIT_VERSION`. |
| [`@attricat/extension`](packages/extension) (0.1.0) | `register()`, the hooks, the Worker runtime, the Vite preset (`/vite`), the packer (`attricat-pack`, `/pack`) and the test harness (`/testing`). |

The Worker, Remote DOM, the DOM polyfill and the message port stay inside the
SDK; extension code only registers components and uses hooks.

## Declare a native artifact

A release has at most one `client_native` artifact. Its `ui_kit` range says
which UI kit versions the code works with; contributions name the artifact.

```json
{
  "artifacts": [
    { "id": "ui", "kind": "client_native", "path": "dist/ui.js", "ui_kit": "^1.0" }
  ],
  "ui": [
    { "id": "summary", "version": 1, "kind": "panel", "artifact": "ui",
      "outlet": "blueprint_panel", "title": "Summary" },
    { "id": "formula", "version": 1, "kind": "editor", "artifact": "ui",
      "outlet": "attribute_editor", "title": "Formula",
      "editor": { "value_types": ["string"], "props": { "rows": { "type": "integer", "minimum": 1, "maximum": 8 } } } }
  ]
}
```

Request the capabilities each contribution uses (`client.blueprint_panel`,
`client.attribute_editor`, `client.commands`, `storage.extension`, …) in
`permissions`, as for frame contributions.

## Write contributions

```tsx
// src/main.tsx
import { useState } from 'preact/hooks';
import { Button, EmptyState, Stack, Text, TextField } from '@attricat/ui-kit';
import {
  register,
  useAttricat,
  useEditor,
  useLocale,
  useOutletContext,
  type BlueprintRevisionContext,
} from '@attricat/extension';

const Summary = () => {
  const { blueprint_id, blueprint_version } = useOutletContext<BlueprintRevisionContext>();
  const locale = useLocale();
  const attricat = useAttricat();
  const [note, setNote] = useState<string>();

  if (note === undefined)
    return (
      <EmptyState
        title={locale === 'pl' ? 'Brak notatki' : 'No note yet'}
        action={
          <Button
            onPress={async () => {
              // A server command of this extension; its answer is yours to define.
              const { note } = await attricat.command<{ note: string }>({
                command_id: 'load-note',
                payload: { blueprint_id },
              });
              setNote(note);
            }}
          >
            Load
          </Button>
        }
      />
    );
  return (
    <Stack gap="sm">
      <Text tone="muted">{`Revision ${blueprint_version}`}</Text>
      <TextField
        label="Note"
        value={note}
        onChange={({ value }) => setNote(value)}
        onSubmit={({ value }) =>
          attricat.command({ command_id: 'save-note', payload: { blueprint_id, note: value } })
        }
      />
    </Stack>
  );
};

const Formula = () => {
  const editor = useEditor<{ rows?: number }>();
  return (
    <TextField
      label={editor.attribute.name}
      hideLabel
      multiline
      monospace
      rows={editor.props.rows ?? 3}
      value={String(editor.value ?? '')}
      readOnly={editor.readOnly}
      onChange={({ value }) => editor.propose(value === '' ? null : value)}
    />
  );
};

register('summary', Summary);
register('formula', Formula);
```

- **`register(id, Component)`** at module top level, once per native
  contribution in the manifest. The SDK announces the registered IDs to the
  host after the module has run; later registrations are ignored.
- **Events**: `onX` props receive the host's payload, not an event:
  `onPress()`, `onChange({ value })` / `onChange({ checked })`,
  `onSubmit({ value })`, `onRowPress({ id })`.
- **Slots**: pass the slotted element as a prop (`<EmptyState action={<Button …/>} />`)
  or as a child with `slot="action"`. Only UI kit elements are drawn: plain
  HTML tags, unknown props and text outside text elements (`Text`, `Heading`,
  `Button`, `Badge`, `Link`) are dropped by the host.
- **Methods**: elements that declare `focus` expose it on their ref
  (`ref.current?.focus()`).

### Hooks

| Hook | Returns |
| --- | --- |
| `useOutletContext<T>()` | The outlet context (`record_id`, `blueprint_id`, …); it changes while mounted. Types: `RecordTabContext`, `BlueprintRevisionContext`, `ActionContext`, `AttributeEditorContext`. |
| `useLocale()` | The viewer's language, such as `en` or `pl`. Supply your own translations. |
| `useTheme()` | `{ color_mode: 'light' \| 'dark' }`. The host draws the theme; you rarely need it. |
| `useConfiguration<T>()` | The installation configuration (needs `configuration.read`). |
| `useCapabilities()` | The capabilities this contribution holds. |
| `useUiKitVersion()` | The UI kit version the host negotiated. |
| `useAttricat()` | The host client, mirroring the frame `attricat` API: `request(path)`, `command({ command_id, payload })`, `storage.get/set/delete/list(…)`, `navigate({ record_id, tab? })`, `notify({ message, severity? })`, `refresh()`, `dialog.close()`, `operations.start/get/list/cancel/download(…)`. A refused call rejects with an `Error`. |
| `useEditor<Props>()` | In an `attribute_editor`: `{ value, attribute, props, required, readOnly, errors, recordId, contextId, propose(value) }`. The host owns the label, errors, focus and saving; `propose` sends the next value. |

The host re-renders a mounted contribution with each new context, theme or
locale; component state survives. An error while rendering one contribution
stops only that contribution.

## Build

```ts
// vite.config.ts
import { defineConfig } from 'vite';
import { attricatExtension } from '@attricat/extension/vite';

export default defineConfig(attricatExtension({ entry: 'src/main.tsx' }));
```

`attricatExtension({ entry, outFile = 'dist/ui.js', budgetBytes = 1048576, uiKitVersion?, minify = true })`
returns a full Vite config that builds **one self-contained classic script**
(IIFE): the host starts it as a classic Worker from a `blob:` URL, so there is
no ES module syntax, no code splitting and nothing loaded at runtime. It
aliases `react`/`react-dom` to `preact/compat`, deduplicates Preact, fails the
build when the script exceeds `budgetBytes` (Attricat accepts at most 1 MiB)
or imports stylesheets or assets, and writes `<outFile>.build.json` with the
version of the installed `@attricat/ui-kit`, e.g. `{"ui_kit":"1.0.0"}`, which
the host requires beside every `client_native` artifact.

A minimal extension bundle (Preact, Remote DOM, the runtime and the UI kit) is
about 88 kB minified.

## Test

```tsx
import { expect, it } from 'vitest';
import { renderContribution } from '@attricat/extension/testing';
import { Summary } from './Summary';

it('saves the note', async () => {
  const view = await renderContribution(Summary, {
    context: { context_version: 1, blueprint_id: 'b1', blueprint_version: 2 },
    broker: { command: ({ command_id }: { command_id: string }) => (command_id === 'load-note' ? { note: 'hello' } : null) },
  });
  await view.fire(view.getByText('Load'), 'press');
  expect(view.getByLabel('Note').props.value).toBe('hello');
  await view.fire(view.getByLabel('Note'), 'submit', { value: 'new' });
  expect(view.calls.at(-1)).toEqual({
    method: 'command',
    payload: { command_id: 'save-note', payload: { blueprint_id: 'b1', note: 'new' } },
  });
  expect(view.warnings()).toEqual([]);
});
```

`renderContribution(Component, { context, configuration, capabilities, locale, theme, uiKit, broker })`
renders the way the Worker runtime does, in-process, and collects the tree a
host would receive. It returns `root`, `getByText` / `queryAllByText`,
`getByElement` / `queryAllByElement`, `getByLabel`, `text(node)`,
`fire(element, event, payload)`, `calls` (broker calls), `proposals()`
(editor values), `methodCalls`, `update(init)`, `unmount()`, `settle()`,
`debug()` and `warnings()` (what the host would drop or not draw). `broker` is
a function `(method, payload) => answer` or a map from method to an answer or
function; a method missing from a map is refused. Prop values are not checked
against their JSON Schema; the host does that. Run these tests in Vitest's
`node` environment; the preset's config sets it.

## Pack

```sh
pnpm exec attricat-pack            # or add "package": "attricat-pack" to scripts
```

`attricat-pack [--root <dir>] [--out-dir <dir>]` reads `manifest.json` and
writes `dist/<attricat.id>-<version>.tar.zst` with the manifest, `README.md`,
the icons and `assets/` when present, every declared artifact path, and each
`client_native` artifact's `.build.json`. It refuses a missing artifact or
build record and a native artifact over 1 MiB. Install the archive from
Attricat's extension management page. (Don't name the script `pack`: `pnpm pack`
is pnpm's own command.) `pack({ root, outDir })` is also exported from
`@attricat/extension/pack`.

## Install

The packages are not on npm. Each [GitHub release](https://github.com/attricat/attricat-extension-sdk/releases)
carries their built tarballs; depend on them directly:

```json
"@attricat/extension": "https://github.com/attricat/attricat-extension-sdk/releases/download/v0.1.2/attricat-extension-0.1.2.tgz",
"@attricat/ui-kit": "https://github.com/attricat/attricat-extension-sdk/releases/download/v0.1.2/attricat-ui-kit-1.0.0.tgz",
"preact": "10.29.8"
```

`@attricat/ui-kit` and `preact` are peer dependencies of `@attricat/extension`:
install them in the extension, so it draws with exactly one copy of each. The
preset deduplicates Preact for builds and tests, and its config types do not
depend on which copy of Vite resolves.

To work against a local checkout instead, run
`pnpm install && pnpm build` in it and use `link:` paths such as
`link:../attricat-extension-sdk/packages/extension`.

## Work on the SDK

```sh
pnpm install
pnpm build            # tsc to packages/*/dist
pnpm test             # vitest in both packages
pnpm typecheck
pnpm check-contract   # vendored contract vs. the core repository (skips when absent)
```

### A new UI kit contract

The UI kit contract is defined in the Attricat core repository
(`contracts/ui-kit-v1.schema.json`, generated from
`scripts/ui-kit/definition.ts`). To adopt a new version:

1. Copy it to `packages/ui-kit/contract/ui-kit-v1.schema.json` and update the
   source note in [`packages/ui-kit/README.md`](packages/ui-kit/README.md).
2. Run `pnpm generate`. It rewrites `packages/ui-kit/src/generated/`
   (`elements.ts`, `components.ts`, `version.ts`); the staleness test fails
   until you do (or run `UPDATE=1 pnpm test`).
3. Set `packages/ui-kit/package.json` `version` to the contract's `version`.
4. `ATTRICAT_CORE_DIR=/path/to/attricat pnpm check-contract` confirms the copy;
   by default it looks at `../attricat/main`.

### Protocol

The runtime implements the host side in the core repository's
`apps/web/src/features/extensions/native/`:

- The sandbox frame posts `{ type: 'attricat:native-init.v1' }` to the Worker
  with the extension's `MessagePort` in `event.ports[0]`.
- Over that port a `@quilted/threads` thread exports `mount(mountId,
  contributionId, connection, init)`, `update(mountId, init)`,
  `unmount(mountId)` and `ping()`, and imports the host's `ready(ids)` and
  `request(mountId, method, payload)`.
- Each mount renders into a Remote DOM root connected to the host's
  `RemoteConnection`; mutation records are batched per microtask and split
  well below the host's 1 MiB message limit.
- Broker methods and payloads match `extensionBroker.ts`; `editor.propose`
  carries `{ value }`.

## License

MIT. See [LICENSE](LICENSE).

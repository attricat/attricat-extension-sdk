# Attricat extension SDK

Write the native UI of an Attricat extension with Preact.

Attricat runs an extension's native UI code in a dedicated Web Worker inside a
hidden, sandboxed frame with no network access. The code composes elements of
the **Attricat UI kit**; Attricat validates the tree and draws it with its own
components, so the extension looks and behaves like the rest of the app in
both themes. An extension's event handlers, commands, durable operations,
connectors and inbound webhooks run on the server as one WebAssembly component
(see [Server components](#server-components)). This SDK covers the extension
author's side of both:

| Package | What it is |
| --- | --- |
| [`@attricat/ui-kit`](packages/ui-kit) (1.0.0) | One Preact component per UI kit element (`Stack`, `Text`, `TextField`, `Button`, `Table`, …), generated from the UI kit contract, plus `UI_KIT_VERSION`. |
| [`@attricat/extension`](packages/extension) (0.1.2) | `register()`, the hooks, the Worker runtime, the Vite preset (`/vite`), the packer (`attricat-pack`, `/pack`) and the test harness (`/testing`). |
| [`attricat-extension`](crates/attricat-extension) (Rust) | Typed calls to the host for server components: storage, batches, network, export mappings. |
| [`wit/`](wit) | Every released `attricat:host` server ABI (1.0.0–1.2.0), to generate a server component's bindings from. |

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
    { "id": "summary", "version": 1, "kind": "tab", "artifact": "ui",
      "outlet": "record_tab", "title": "Summary" },
    { "id": "formula", "version": 1, "kind": "editor", "artifact": "ui",
      "outlet": "attribute_editor", "title": "Formula",
      "editor": { "value_types": ["string"], "props": { "rows": { "type": "integer", "minimum": 1, "maximum": 8 } } } }
  ]
}
```

Panels are read-only and cannot call server commands, except `export_mapping`.
Use a tab, a dialog or an action for anything that does.

Request the capabilities each contribution uses (`client.record_tab`,
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
  type RecordTabContext,
} from '@attricat/extension';

const Summary = () => {
  const { record_id } = useOutletContext<RecordTabContext>();
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
                payload: { record_id },
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
      <Text tone="muted">{`Record ${record_id}`}</Text>
      <TextField
        label="Note"
        value={note}
        onChange={({ value }) => setNote(value)}
        onSubmit={({ value }) =>
          attricat.command({ command_id: 'save-note', payload: { record_id, note: value } })
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
    context: { context_version: 1, record_id: 'r1' },
    broker: { command: ({ command_id }: { command_id: string }) => (command_id === 'load-note' ? { note: 'hello' } : null) },
  });
  await view.fire(view.getByText('Load'), 'press');
  expect(view.getByLabel('Note').props.value).toBe('hello');
  await view.fire(view.getByLabel('Note'), 'submit', { value: 'new' });
  expect(view.calls.at(-1)).toEqual({
    method: 'command',
    payload: { command_id: 'save-note', payload: { record_id: 'r1', note: 'new' } },
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
pnpm check-wit        # released WIT vs. the core repository
cargo test --manifest-path crates/attricat-extension/Cargo.toml
```

CI runs all of these against the core repository's `main`.

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

## Server components

An extension's server code is one WebAssembly **component**, declared as a
`server_wasm` artifact. Attricat runs it on demand, with no WASI: no
filesystem, sockets, environment or ambient clock. Everything it does goes
through the `attricat:host` ABI, and the host checks the release's granted
capabilities on every call. One component can have any of these entry points:

| Entry point | Invoked when | Manifest | Capability |
| --- | --- | --- | --- |
| Event handler | A subscribed domain event happens (`record.updated.v1`, `webhook.received.v1`, another extension's declared event, …) | `server.event_handlers` | `events.subscribe` |
| Command | A client contribution calls `attricat.command(…)`; the request and response are validated against JSON Schemas | `server.commands` | `client.commands` |
| Operation | A durable, checkpointed run in batches: started by an operator, on a schedule, by a blueprint connector job, or from a host action for selected records | `server.operations` | per call |
| Webhook | An external system calls the extension's public endpoint | `server.webhooks` | `webhooks.receive` |

### Pick a host ABI and a world

`wit/` holds every released ABI (see [Server ABI (WIT)](#server-abi-wit)).
Later 1.x versions only add, so set `attricat.host_api` to the oldest
version whose features you use (`"^1.2"` for webhooks, `"^1.1"` for typed
outcomes) and generate bindings for one of its worlds. Every world imports the
whole host; they differ only in what the component exports.

| World | Since | Exports |
| --- | --- | --- |
| `webhook-extension` | 1.2 | `event-handler`, `command-handler`, `deferrable-operations`, `webhook-receiver` |
| `outcome-extension` | 1.1 | `event-handler`, `command-handler`, `deferrable-operations` |
| `attricat-extension` | 1.0 | `handler` (events and commands), `operations` |
| `handler-extension`, `operation-extension` | 1.0 | `handler` or `operations` alone |

Prefer a 1.1 or later world for new code. In a 1.0 `handler`, any error
quarantines the installation. A 1.1 `event-handler` or batch returns a typed
`failure` instead:

| `failure` | Event handler | Operation batch |
| --- | --- | --- |
| `rejected { code, message, record-id?, connection? }` | Recorded, never retried; with a record ID it becomes that record's export status | Settles the named record (with `exports.mappings`), otherwise dead-letters the run |
| `retry { message, after-ms? }` | Retried with backoff (5 s doubling to 1 h), up to 10 attempts | Retried with the same batch key |
| `fault(message)` | Quarantines the installation | Fails the run and quarantines |

A handler's `delivery` carries the event's `sequence`, the record's
`record-revision`, the `attempt` number and its `source-kind` and
`source-name`. Skip deliveries whose `source-name` is
`extension:<your-id>` to ignore your own writes. Exports of the world that you
don't use can return an error.

### What the component can call

| Interface | What it gives you | Where |
| --- | --- | --- |
| `api` | Typed `read` (record, direct or resolved values) and `write` (scalar values in an explicit context), scoped configuration, `log`, and `call(operation, json)` for everything below | Everywhere; catalog access only outside operation runs |
| `clock` (1.1) | UTC wall-clock time, for token expiry and polling | Everywhere |
| `attricat-data` | `read` and `batch`, with the JSON of `attricat.read.v1` and `attricat.command.v1` | Operation runs |
| `attricat` | Connector `schema`, `page`, `page-v2` (resolved values, relationships, files, expanded related records), `withdrawn` and `upsert-batch` | Connector runs, scoped by the host to the job's blueprint, context and channel |
| `selection` | `describe` and `page` over the frozen records an interactive run was started for | Interactive runs |
| `artifacts` | Read run inputs and write checksummed outputs, or stage outputs batch by batch (`append-output`, `finalize-output`, up to 1 GiB) | Operation runs |
| `transfer` | Stream HTTPS byte ranges into input artifacts and deliver outputs (PUT/POST, presigned URLs, multipart); `open-record-file` copies a record's file into an input | Operation runs |

Operation runs reach catalog data only through their run-scoped interfaces, so
an interactive run can never read beyond its selection. `webhook-receiver.receive`
reaches only configuration, secrets, storage reads, logging and the clock, and
must answer within 5 seconds.

The JSON operations of `api.call`:

| Operation | Does | Capability | In the crate |
| --- | --- | --- | --- |
| `configuration.get.v1` | The installation configuration | `configuration.read` | `configuration()` |
| `secrets.get.v1` | A workspace secret, for this invocation only | `secrets.read` | `secret()` |
| `storage.get/set/delete/list.v1` | The extension's key-value store, with revisions for compare-and-set (65,536 keys, 64 KiB a value) | `storage.extension` | `storage()` |
| `attricat.read.v1` | `page`, `changes`, `lookup` by business key, `movements`, `incoming` relationships | `attricat.read` | `attricat_extension::read(&GeneratedHost, …)` |
| `attricat.command.v1` | Idempotent batches of up to 100 `create`, `update`, `upsert`, `relationships` and `annotate` intents | `attricat.write` / `attricat.annotations.write` | `Batch` |
| `events.emit.v1` | Publish one of the manifest's `event_contracts.exports` | `events.emit` | `emit_event()` |
| `network.request.v2` | Brokered HTTPS through a granted host-permission rule, with typed outcomes, query strings, binary and secret-filled bodies, and a connection's OAuth token | `network.request` | `network()` |
| `connections.get/list.v1` | A credential connection's non-secret description; the host runs the OAuth grants and refreshes tokens | `connections.use` | `connections()` |
| `mappings.get/list/begin/commit/release/delete.v1` | Per-record export status and external IDs at a destination, with leases against duplicate pushes | `exports.mappings` | `mappings()` |
| `files.link.v1` | A public, expiring link to a record's file, for destinations that fetch media themselves | `attricat.files.public_links` | `file_links()` |
| `connector.scope.v1` | The connector run's job, blueprint, context, channel, connection and mode | — | `connector_scope()` |
| `webhooks.receipt.get.v1` | A kept webhook payload, from its `webhook.received.v1` event | `webhooks.receive` | `webhooks()`, `Received::from_event` |

JSON the component sends is bounded to 64 KiB and the host's answers to 1 MiB.
Deliveries are at-least-once and may be reordered, so make handlers and batches
idempotent: keep intent keys and idempotency keys stable across retries. The
core repository's `docs/extensions.md` is the full contract.

### Declare it

```json
{
  "attricat": { "id": "acme.orders", "host_api": "^1.2" },
  "permissions": ["webhooks.receive", "secrets.read", "events.subscribe",
                  "configuration.read", "attricat.write"],
  "artifacts": [{ "id": "server", "kind": "server_wasm", "path": "dist/server.wasm" }],
  "server": {
    "webhooks": [
      { "id": "orders", "title": "Order notifications", "max_body_bytes": 131072 }
    ],
    "event_handlers": [
      { "id": "orders", "event_types": ["webhook.received.v1"], "handler": "handle-event" }
    ],
    "commands": [
      { "id": "load-note", "handler": "load-note",
        "request_schema": { "type": "object" }, "response_schema": { "type": "object" } }
    ],
    "operations": [
      { "id": "export", "handler": "export", "request_schema": { "type": "object" },
        "max_checkpoint_bytes": 4096 }
    ]
  }
}
```

An operation can also declare `interactive: { "version": 1, "max_selection": 50 }`
to be started from a host action on selected records (or `"scope": "blueprint"`
for a whole blueprint revision), and a blueprint's YAML can run it as a
`connector_jobs` entry on an interval or on record changes. `server.connections`
declares credential connection kinds; `server.exports` declares export
destinations with preview, resync and reconcile hooks. An event handler can set
`debounce_ms` to receive only a record's latest event after a burst of edits.

### Typed host calls

`crates/attricat-extension` names the host's `api.call` operations and types
their JSON. It holds no WIT: your component generates its own bindings, and one
line connects them.

```toml
[dependencies]
attricat-extension = { git = "https://github.com/attricat/attricat-extension-sdk" }
serde = { version = "1", features = ["derive"] }
serde_json = "1"
wit-bindgen = "0.63"
```

`host!(…)` defines `storage()`, `mappings()`, `network()`, `connections()`,
`file_links()`, `webhooks()`, `configuration()`, `secret()`, `emit_event()` and
`connector_scope()` in the calling module.
`Batch`, `Intent` and `Scalar` build `attricat.command.v1` and
`attricat-data.batch` requests; `decode` and `encode` handle the JSON of
everything else. Pin a `rev` in a real extension.

This component receives signed order webhooks and upserts each order from its
event handler, where catalog writes are allowed:

```rust
wit_bindgen::generate!({ path: "wit", world: "webhook-extension" });

use attricat::host::outcomes::{Failure, Retry};
use attricat_extension::{Batch, Intent, Received, Scalar, decode};
use exports::attricat::host::{event_handler, webhook_receiver};
use serde::Deserialize;
use webhook_receiver::{KeptPayload, WebhookOutcome, WebhookReply, WebhookRequest};

attricat_extension::host!(attricat::host::api);

struct Component;
export!(Component);

impl webhook_receiver::Guest for Component {
    // Runs while the sender waits: check, answer, keep. No catalog, no network.
    fn receive(request: WebhookRequest) -> Result<WebhookOutcome, String> {
        // One secret per endpoint, so one webhook serves several accounts.
        let secret = secret(&format!("orders-{}", request.endpoint))?;
        if !signed(&request, &secret) {
            return Ok(WebhookOutcome { reply: reply(401), keep: None });
        }
        let delivery_id = request.headers.iter()
            .find(|header| header.name == "x-delivery-id")
            .map(|header| header.value.clone());
        Ok(WebhookOutcome {
            reply: reply(202),
            keep: Some(KeptPayload {
                payload: String::from_utf8(request.body).map_err(|e| e.to_string())?,
                dedupe_key: delivery_id, // a resent delivery is kept once
            }),
        })
    }
}

impl event_handler::Guest for Component {
    fn handle_event(
        event: event_handler::Event,
        _delivery: event_handler::Delivery,
    ) -> Result<(), Failure> {
        let retry = |message| Failure::Retry(Retry { message, after_ms: None });
        match Received::from_event(&event.event_type, &event.payload).map_err(retry)? {
            Some(received) => store_order(&received).map_err(retry),
            None => Ok(()),
        }
    }
}

#[derive(Deserialize)]
struct Config { blueprint_id: String, blueprint_version: u64, order_number_attribute_id: String, context_id: String }
#[derive(Deserialize)]
struct Order { number: String, total: f64 }

fn store_order(received: &Received) -> Result<(), String> {
    let Some(receipt) = webhooks().receipt(&received.receipt_id)? else {
        return Ok(()); // past retention
    };
    let order: Order = decode(&receipt.payload)?;
    let config: Config = configuration()?;
    // Upsert by the sender's order number, so a redelivery changes nothing.
    let batch = Batch::new(&receipt.id, vec![Intent::upsert(
        &format!("order-{}", order.number),
        &config.blueprint_id,
        config.blueprint_version,
        &config.order_number_attribute_id,
        &order.number,
        &[Scalar::new("total", &config.context_id, order.total)],
    )]);
    attricat::host::api::call("attricat.command.v1", &batch.to_request()).map(drop)
}

fn reply(status: u16) -> WebhookReply {
    WebhookReply { status, headers: vec![], body: String::new() }
}

fn signed(_request: &WebhookRequest, _secret: &str) -> bool {
    todo!("check the sender's signature over request.body, e.g. an HMAC with `secret`")
}

// `command_handler::Guest` and `deferrable_operations::Guest` are implemented
// too, returning errors, since the world exports them.
```

Build a `cdylib` crate for `wasm32-unknown-unknown` (not `wasip2`: a component
may import nothing but `attricat:host`) and wrap the module as a component:

```sh
cargo build --release --target wasm32-unknown-unknown
wasm-tools component new target/wasm32-unknown-unknown/release/acme_orders.wasm -o dist/server.wasm
wasm-tools component wit dist/server.wasm   # imports and exports only attricat:host@1.2.0
```

Inside
an operation run, write through `attricat_data::batch(&batch.to_request())`
instead of `api.call`, with the run's current `batch-key` as the batch key, and
parse its answer with `decode`.

## Server ABI (WIT)

`wit/` holds every released `attricat:host` ABI as WIT, for server components:
copy the version your manifest targets into your component and generate
bindings from it. See [`wit/README.md`](wit/README.md).

## License

MIT. See [LICENSE](LICENSE).

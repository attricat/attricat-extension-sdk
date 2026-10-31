# @attricat/ui-kit

Preact components for the Attricat UI kit, the elements an extension's native
UI is made of. Each component draws one Remote DOM custom element that the
Attricat host validates and renders with its own components.

```tsx
import { Button, Stack, Text, UI_KIT_VERSION } from '@attricat/ui-kit';
```

- One component per contract element, under the element's name: `Stack`,
  `Grid`, `Divider`, `Text`, `Heading`, `Button`, `IconButton`, `TextField`,
  `NumberField`, `Select`, `Checkbox`, `Switch`, `Badge`, `Link`, `Table`,
  `EmptyState`. Props are typed from the contract's JSON Schema fragments;
  `onX` props (`onPress`, `onChange`, `onSubmit`, `onRowPress`) receive the
  event's payload; slots are props (`action` on `EmptyState`) or children with
  `slot="…"`.
- `UI_KIT_VERSION`, `UI_KIT_ICONS`, `UI_KIT_LIMITS`, `UI_KIT_TAGS` and
  `UI_KIT_ELEMENTS` (props, events, children, slots per element). The
  side-effect-free subpath `@attricat/ui-kit/version` exports these without
  defining elements; `@attricat/ui-kit/contract` is the contract itself.
- Importing the package installs Remote DOM's DOM polyfill and defines the
  elements: it is meant for the extension's Worker, through
  [`@attricat/extension`](../extension).

## Source of the contract

`contract/ui-kit-v1.schema.json` is a verbatim copy of the Attricat core
repository's `contracts/ui-kit-v1.schema.json` (generated there from
`scripts/ui-kit/definition.ts`), taken from `main` at the merge of
[attricat/attricat#465](https://github.com/attricat/attricat/pull/465)
(`6e1e056bee8713ab756a0029002ac84f7ca62161`). UI kit version 1.0.0.

`src/generated/` is produced by `scripts/generate.mjs`; do not edit it. After
replacing the contract run `pnpm generate`. `pnpm test` fails while the
generated files are stale (`UPDATE=1 pnpm test` rewrites them), and
`pnpm check-contract` compares the copy with the core repository's when
`ATTRICAT_CORE_DIR` (default `../../../attricat/main` from this package)
has it.

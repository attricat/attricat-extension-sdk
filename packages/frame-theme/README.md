# @attricat/frame-theme

Attricat's visual identity for **Frame UI** contributions (`client_frame`
artifacts): the semantic design tokens, an MUI theme built from them, and
helpers that follow the host's light or dark mode.

Native UI contributions don't need this: the host draws UI kit elements with
its own components.

```tsx
import { createRoot } from 'react-dom/client';
import { CssBaseline, ThemeProvider } from '@mui/material';
import { applyCssVariables, watchColorMode } from '@attricat/frame-theme';
import { makeTheme } from '@attricat/frame-theme/mui';

export function mount(root, attricat) {
  const app = createRoot(root);
  const stop = watchColorMode(root, attricat, (mode) => {
    applyCssVariables(document.documentElement, mode);
    app.render(
      <ThemeProvider theme={makeTheme(mode)}>
        <CssBaseline />
        <App attricat={attricat} />
      </ThemeProvider>,
    );
  });
  return () => {
    stop();
    app.unmount();
  };
}
```

## What it contains

| Export | What it is |
| --- | --- |
| `colors`, `elevation`, `radius`, `spacing`, `typography` | The tokens. Colors are semantic, per mode (`colors.dark.background.inset`); use them rather than hex values. The JSON files are also exported (`@attricat/frame-theme/tokens/colors.json`). |
| `makeTheme(mode)` (`/mui`) | The MUI 6 theme: palette, type roles, the 4px spacing, radii, shadows and compact component defaults for data screens. `palette.background` also carries `inset`, `elevated`, `navigation` and `navigationRail`. |
| `colorMode(attricat)` | `'light'` or `'dark'` from `attricat.theme`. |
| `watchColorMode(root, attricat, listener)` | Calls the listener now and on each `attricat:theme-changed.v1` that changes the mode; returns a function that stops listening. Changes need the `client.events` permission. |
| `cssVariables(mode)`, `applyCssVariables(element, mode)` | The semantic colors as CSS custom properties (`--ac-background-inset`, `--ac-border-strong`, …), the font stacks (`--ac-font-sans`, `--ac-font-mono`) and the radii (`--ac-radius-control`), for SVG and other content MUI does not style. |

## Rules that matter in a frame

- Light and dark are peers: choose tokens per mode and check both.
- Inter for text, IBM Plex Mono for codes, measurements and quantities. The
  frame's content security policy allows no font loading, so the stacks fall
  back to system fonts unless these are installed; don't try to embed them.
- `brand.primary` marks links, focus, primary actions and the important part
  of a drawing; `brand.accent` is a rare editorial detail, never a second
  action color. Semantic colors only for success, warning, error and info,
  and never status by color alone.
- Borders carry structure: 1px `border.default` for surfaces, `border.subtle`
  for row divisions; radii 6 / 8 / 12 / 4 for controls, surfaces, dialogs and
  chips; flat by default.
- Icons from [Lucide](https://lucide.dev) at 18–20px in controls.
- Diagrams draw on `background.inset`, nodes on `background.surface` with a
  1px border, connectors in `border.strong`; label everything and keep them
  readable in grayscale.

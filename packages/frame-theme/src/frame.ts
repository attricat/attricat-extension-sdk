import { colors, radius, typography, type ColorMode } from './tokens.js';

/** The part of the frame's `attricat` object this module reads. */
export interface FrameThemeSource {
  theme?: { color_mode?: string } | null;
}

export const THEME_CHANGED_EVENT = 'attricat:theme-changed.v1';

/** The host's current color mode, light when it has not said. */
export function colorMode(attricat: FrameThemeSource): ColorMode {
  return attricat.theme?.color_mode === 'dark' ? 'dark' : 'light';
}

/**
 * Calls `listener` with the color mode now and whenever the user switches
 * between light and dark (frames stay mounted). Needs `client.events` for
 * changes. Returns a function that stops listening.
 */
export function watchColorMode(
  root: EventTarget,
  attricat: FrameThemeSource,
  listener: (mode: ColorMode) => void,
): () => void {
  let last: ColorMode | null = null;
  const update = () => {
    const mode = colorMode(attricat);
    if (mode === last) return;
    last = mode;
    listener(mode);
  };
  root.addEventListener(THEME_CHANGED_EVENT, update);
  update();
  return () => root.removeEventListener(THEME_CHANGED_EVENT, update);
}

const kebab = (value: string) => value.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);

/**
 * The semantic colors of a mode as CSS custom properties, for content MUI
 * does not style (SVG drawings, plain elements): `--ac-background-inset`,
 * `--ac-border-strong`, `--ac-semantic-warning-foreground`, … plus the font
 * stacks (`--ac-font-sans`, `--ac-font-mono`) and radii (`--ac-radius-control`).
 */
export function cssVariables(mode: ColorMode): Record<string, string> {
  const variables: Record<string, string> = {};
  const walk = (value: unknown, path: string[]) => {
    if (typeof value === 'string') variables[`--ac-${path.map(kebab).join('-')}`] = value;
    else if (value && typeof value === 'object') {
      for (const [key, child] of Object.entries(value)) walk(child, [...path, key]);
    }
  };
  walk(colors[mode], []);
  variables['--ac-font-sans'] = typography.families.sans;
  variables['--ac-font-mono'] = typography.families.mono;
  for (const [key, value] of Object.entries(radius)) variables[`--ac-radius-${kebab(key)}`] = `${value}px`;
  return variables;
}

/** Sets the mode's custom properties and `color-scheme` on an element. */
export function applyCssVariables(element: { style: CSSStyleDeclaration }, mode: ColorMode): void {
  for (const [name, value] of Object.entries(cssVariables(mode))) element.style.setProperty(name, value);
  element.style.colorScheme = mode;
}

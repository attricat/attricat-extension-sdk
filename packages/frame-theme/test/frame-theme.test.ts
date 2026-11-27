import { describe, expect, it } from 'vitest';
import { colorMode, colors, cssVariables, THEME_CHANGED_EVENT, watchColorMode } from '../src/index.js';
import { makeTheme } from '../src/mui.js';

describe('colorMode', () => {
  it('reads the host mode and falls back to light', () => {
    expect(colorMode({ theme: { color_mode: 'dark' } })).toBe('dark');
    expect(colorMode({ theme: { color_mode: 'light' } })).toBe('light');
    expect(colorMode({})).toBe('light');
    expect(colorMode({ theme: { color_mode: 'sepia' } })).toBe('light');
  });
});

describe('watchColorMode', () => {
  it('reports the mode now and on each real change', () => {
    const root = new EventTarget();
    const attricat = { theme: { color_mode: 'light' } };
    const seen: string[] = [];
    const stop = watchColorMode(root, attricat, (mode) => seen.push(mode));
    attricat.theme.color_mode = 'dark';
    root.dispatchEvent(new Event(THEME_CHANGED_EVENT));
    root.dispatchEvent(new Event(THEME_CHANGED_EVENT));
    stop();
    attricat.theme.color_mode = 'light';
    root.dispatchEvent(new Event(THEME_CHANGED_EVENT));
    expect(seen).toEqual(['light', 'dark']);
  });
});

describe('cssVariables', () => {
  it('names every semantic color by its path', () => {
    const light = cssVariables('light');
    expect(light['--ac-background-inset']).toBe(colors.light.background.inset);
    expect(light['--ac-semantic-warning-foreground']).toBe(colors.light.semantic.warning.foreground);
    expect(light['--ac-action-navigation-hover']).toBe(colors.light.action.navigationHover);
    expect(light['--ac-radius-control']).toBe('6px');
    expect(light['--ac-font-mono']).toContain('IBM Plex Mono');
    expect(Object.keys(cssVariables('dark'))).toEqual(Object.keys(light));
  });
});

describe('makeTheme', () => {
  it('builds both modes from the tokens', () => {
    for (const mode of ['light', 'dark'] as const) {
      const theme = makeTheme(mode);
      expect(theme.palette.mode).toBe(mode);
      expect(theme.palette.primary.main).toBe(colors[mode].brand.primary);
      expect(theme.palette.background.inset).toBe(colors[mode].background.inset);
      expect(theme.spacing(4)).toBe('16px');
      expect(theme.shape.borderRadius).toBe(6);
    }
  });
});

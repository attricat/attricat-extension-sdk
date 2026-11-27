import colorTokens from '../tokens/colors.json' with { type: 'json' };
import elevationTokens from '../tokens/elevation.json' with { type: 'json' };
import radiusTokens from '../tokens/radius.json' with { type: 'json' };
import spacingTokens from '../tokens/spacing.json' with { type: 'json' };
import typographyTokens from '../tokens/typography.json' with { type: 'json' };

export type ColorMode = 'light' | 'dark';
export type SemanticColors = typeof colorTokens.light;

/** Semantic colors per mode: use these, never raw hex values. */
export const colors: Record<ColorMode, SemanticColors> = colorTokens;
/** Shadows per mode: `raised` for a floating control, `overlay` for menus and dialogs. */
export const elevation: Record<ColorMode, typeof elevationTokens.light> = elevationTokens;
/** Corner radii in CSS pixels: controls 6, surfaces 8, dialogs 12, chips 4. */
export const radius = radiusTokens;
/** The 4px spacing rhythm and layout widths in CSS pixels. */
export const spacing = spacingTokens;
/** Font stacks and type roles (sizes in CSS pixels, unitless line heights). */
export const typography = typographyTokens;

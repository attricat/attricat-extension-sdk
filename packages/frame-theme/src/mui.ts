// Attricat's MUI theme for Frame UI. Build it per color mode and rebuild it
// when the host switches mode:
//
//   const theme = makeTheme(colorMode(attricat));
//   <ThemeProvider theme={theme}><CssBaseline />…</ThemeProvider>
import { createTheme, type Components, type Shadows, type Theme } from '@mui/material/styles';
import { colors, elevation, radius, typography, type ColorMode } from './tokens.js';

declare module '@mui/material/styles' {
  interface TypeBackground {
    navigation: string;
    navigationRail: string;
    inset: string;
    elevated: string;
  }
  interface TypeAction {
    navigationHover: string;
    changed: string;
  }
}

export function makeTheme(mode: ColorMode): Theme {
  const c = colors[mode];
  const role = typography.roles;
  const type = (r: typeof role.body) => ({
    fontSize: r.size,
    fontWeight: r.weight,
    lineHeight: r.lineHeight,
    letterSpacing: r.tracking,
  });
  return createTheme({
    palette: {
      mode,
      primary: { main: c.brand.primary, contrastText: c.brand.onPrimary },
      secondary: { main: c.brand.accent },
      success: { main: c.semantic.success.main },
      warning: { main: c.semantic.warning.main, contrastText: c.semantic.warning.onMain },
      error: { main: c.semantic.error.main },
      info: { main: c.semantic.info.main },
      background: {
        default: c.background.default,
        paper: c.background.surface,
        navigation: c.background.navigation,
        navigationRail: c.background.navigationRail,
        inset: c.background.inset,
        elevated: c.background.elevated,
      },
      text: { primary: c.text.primary, secondary: c.text.secondary, disabled: c.text.disabled },
      divider: c.border.default,
      action: {
        hover: c.action.hover,
        navigationHover: c.action.navigationHover,
        changed: c.action.changed,
        selected: c.action.selected,
        disabledBackground: c.action.disabled,
        focus: c.action.hover,
      },
    },
    typography: {
      fontFamily: typography.families.sans,
      fontSize: 14,
      h1: type(role.display),
      h2: type(role.marketingHeading),
      h3: type(role.appHeading),
      h4: type(role.sectionHeading),
      h5: type(role.sectionHeading),
      h6: type(role.label),
      body1: type(role.body),
      body2: type(role.body),
      subtitle1: type(role.label),
      subtitle2: type(role.caption),
      caption: type(role.caption),
      overline: { ...type(role.caption), fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.09em' },
      button: { ...type(role.label), textTransform: 'none' },
    },
    spacing: 4,
    shape: { borderRadius: radius.control },
    shadows: Array.from({ length: 25 }, (_, i) =>
      i === 0 ? 'none' : i < 5 ? elevation[mode].raised : elevation[mode].overlay,
    ) as Shadows,
    components: components(mode),
  });
}

function components(mode: ColorMode): Components<Theme> {
  const c = colors[mode];
  const shadow = elevation[mode];
  const outline = `1px solid ${c.border.default}`;
  // A floated field label shrinks from body to label size.
  const shrunkLabelScale = typography.roles.label.size / typography.roles.body.size;
  return {
    MuiCssBaseline: {
      styleOverrides: {
        body: { scrollbarColor: `${c.border.strong} ${c.background.default}` },
        '::selection': { backgroundColor: c.action.selected },
      },
    },
    MuiButton: {
      defaultProps: { disableElevation: true, size: 'small' },
      styleOverrides: {
        root: { textTransform: 'none', fontWeight: 600, borderRadius: radius.control, minHeight: 36, paddingInline: 14 },
        outlined: { borderColor: c.border.default, '&:hover': { borderColor: c.brand.primary, backgroundColor: c.action.hover } },
      },
    },
    MuiIconButton: {
      defaultProps: { size: 'small' },
      styleOverrides: {
        root: { borderRadius: radius.control, '&:focus-visible': { outline: `2px solid ${c.action.focus}`, outlineOffset: 2 } },
      },
    },
    MuiTextField: { defaultProps: { variant: 'outlined' } },
    MuiOutlinedInput: {
      styleOverrides: {
        root: {
          borderRadius: radius.control,
          backgroundColor: c.background.surface,
          '& .MuiOutlinedInput-notchedOutline': { borderColor: c.border.default },
          '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: c.border.strong },
        },
        input: { fontSize: 14 },
        notchedOutline: { '& legend': { fontSize: `${shrunkLabelScale}em` } },
      },
    },
    MuiInputLabel: {
      styleOverrides: {
        root: { fontSize: 14 },
        shrink: { '&.MuiInputLabel-outlined': { transform: `translate(14px, -9px) scale(${shrunkLabelScale})` } },
      },
    },
    MuiCheckbox: { defaultProps: { size: 'small' }, styleOverrides: { root: { padding: 6 } } },
    MuiSwitch: { defaultProps: { size: 'small' } },
    MuiChip: {
      defaultProps: { size: 'small' },
      styleOverrides: {
        root: { borderRadius: radius.small, fontWeight: 600, fontSize: 12 },
        outlined: { borderColor: c.border.default },
        colorWarning: {
          '&.MuiChip-outlined': {
            color: c.semantic.warning.foreground,
            backgroundColor: c.semantic.warning.tint,
            borderColor: c.semantic.warning.main,
          },
          '&.MuiChip-filled': { color: c.semantic.warning.onMain },
        },
      },
    },
    MuiAlert: {
      styleOverrides: {
        root: {
          borderRadius: radius.surface,
          border: outline,
          alignItems: 'center',
          '&.MuiAlert-standardWarning, &.MuiAlert-outlinedWarning': {
            color: c.semantic.warning.foreground,
            backgroundColor: c.semantic.warning.tint,
            '& .MuiAlert-icon': { color: c.semantic.warning.foreground },
          },
        },
      },
    },
    MuiCard: {
      defaultProps: { variant: 'outlined' },
      styleOverrides: { root: { borderColor: c.border.default, borderRadius: radius.surface, backgroundImage: 'none' } },
    },
    MuiPaper: { styleOverrides: { root: { backgroundImage: 'none' }, outlined: { borderColor: c.border.default } } },
    MuiDialog: { styleOverrides: { paper: { borderRadius: radius.dialog, border: outline, boxShadow: shadow.overlay } } },
    MuiTooltip: {
      defaultProps: { arrow: true },
      styleOverrides: {
        tooltip: {
          backgroundColor: c.background.elevated,
          color: c.text.primary,
          border: outline,
          boxShadow: shadow.raised,
          fontSize: 12,
        },
        arrow: { color: c.background.elevated },
      },
    },
    MuiTabs: { styleOverrides: { root: { minHeight: 40, borderBottom: `1px solid ${c.border.subtle}` }, indicator: { height: 2 } } },
    MuiTab: { styleOverrides: { root: { textTransform: 'none', minHeight: 40, minWidth: 0, padding: '8px 16px', fontWeight: 600 } } },
    MuiAppBar: {
      defaultProps: { elevation: 0, color: 'default' },
      styleOverrides: {
        root: { backgroundImage: 'none', backgroundColor: c.background.surface, borderBottom: `1px solid ${c.border.subtle}` },
      },
    },
    MuiDrawer: {
      styleOverrides: {
        paper: { backgroundColor: c.background.surface, backgroundImage: 'none', borderRight: `1px solid ${c.border.subtle}` },
      },
    },
    MuiTable: { defaultProps: { size: 'small' } },
    MuiTableCell: {
      styleOverrides: {
        root: { borderBottom: `1px solid ${c.border.subtle}`, padding: '10px 16px' },
        head: { color: c.text.secondary, fontSize: 12, fontWeight: 600, backgroundColor: c.background.inset, whiteSpace: 'nowrap' },
      },
    },
    MuiTableRow: { styleOverrides: { root: { '&:hover': { backgroundColor: c.action.hover } } } },
    MuiMenu: { styleOverrides: { paper: { border: outline, boxShadow: shadow.overlay, marginTop: 4 } } },
    MuiMenuItem: { styleOverrides: { root: { fontSize: 14, minHeight: 36 } } },
    MuiDivider: { styleOverrides: { root: { borderColor: c.border.subtle } } },
    MuiPaginationItem: { styleOverrides: { root: { borderRadius: radius.control } } },
  };
}

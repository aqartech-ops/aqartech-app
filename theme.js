// AqarTech design tokens — light beige & bronze identity.
// Use these tokens everywhere; never hard-code colors or sizes in screens.

export const COLORS = {
  background: '#F5EFE6', // warm beige page background
  surface: '#FFFFFF', // cards, inputs, sidebar
  surfaceSoft: '#FBF8F3', // subtle panels, table headers
  card: '#FFFFFF', // kept for backward compatibility

  primary: '#B68D6A', // bronze — main actions
  primaryDark: '#8F6A4C', // pressed / headings accent
  primarySoft: '#F1E7DC', // selected item background
  secondary: '#B68D6A',

  textDark: '#3E3228', // main text
  text: '#3E3228',
  textMuted: '#96897F', // secondary text, placeholders
  onPrimary: '#FFFFFF',

  border: '#E3D9CD',
  borderStrong: '#D8CFC4',

  // Status colors (each with a soft background)
  success: '#1F8A5B',
  successSoft: '#E5F4EC',
  warning: '#B7791F',
  warningSoft: '#FBF0DC',
  danger: '#C0392B',
  dangerSoft: '#FBE6E3',
  info: '#2B6CB0',
  infoSoft: '#E3EEF9',

  overlay: 'rgba(30, 22, 15, 0.35)',
};

export const SPACING = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 };

export const RADIUS = { sm: 8, md: 12, lg: 16, pill: 999 };

export const FONT = {
  small: 12,
  body: 14,
  medium: 16,
  title: 20,
  large: 26,
  weightRegular: '400',
  weightMedium: '600',
  weightBold: '700',
};

// Legacy names used by older code
export const SIZES = { base: 10, small: 13, font: 15, medium: 17, large: 22, radius: RADIUS.lg, padding: 20 };

export const SHADOWS = {
  card: { boxShadow: '0px 1px 3px rgba(62, 50, 40, 0.06), 0px 6px 18px rgba(62, 50, 40, 0.05)' },
  floating: { boxShadow: '0px 6px 20px rgba(182, 141, 106, 0.18)' },
};

export default { COLORS, SPACING, RADIUS, FONT, SIZES, SHADOWS };

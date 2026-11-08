import { WEB_SKIN } from './services/skin';

// AqarTech design tokens — light beige & bronze identity (phone & tablet app, classic web look).
// The web has its own look (services/skin.js): the same token names get other values below.
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

// Side menu of the web look (dark). Defined for both looks so any screen may use them.
COLORS.nav = COLORS.surface;
COLORS.navText = COLORS.textDark;
COLORS.navMuted = COLORS.textMuted;
COLORS.navActive = COLORS.primarySoft;
COLORS.navActiveText = COLORS.primaryDark;
COLORS.navBorder = COLORS.border;

// ------------------------------------------------------------------ web look: slate & teal
if (WEB_SKIN) {
  Object.assign(COLORS, {
    background: '#F3F5F9',
    surface: '#FFFFFF',
    surfaceSoft: '#F8FAFC',
    card: '#FFFFFF',
    primary: '#0F766E',
    primaryDark: '#115E59',
    primarySoft: '#E6F4F1',
    secondary: '#0F766E',
    textDark: '#0F172A',
    text: '#0F172A',
    textMuted: '#64748B',
    onPrimary: '#FFFFFF',
    border: '#E5E9F0',
    borderStrong: '#CBD5E1',
    overlay: 'rgba(15, 23, 42, 0.45)',
    nav: '#0B1324',
    navText: '#E2E8F0',
    navMuted: '#94A3B8',
    navActive: 'rgba(45, 212, 191, 0.12)',
    navActiveText: '#5EEAD4',
    navBorder: 'rgba(255, 255, 255, 0.08)',
  });
  Object.assign(RADIUS, { sm: 6, md: 8, lg: 12 });
  Object.assign(SHADOWS, {
    card: { boxShadow: '0px 1px 2px rgba(15, 23, 42, 0.05)' },
    floating: { boxShadow: '0px 8px 24px rgba(15, 23, 42, 0.12)' },
  });
}

export default { COLORS, SPACING, RADIUS, FONT, SIZES, SHADOWS };

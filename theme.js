import { Platform } from 'react-native';
import { WEB_SKIN } from './services/skin';

// AqarTech design tokens — "Ivory & Emerald" (العاجي والزمردي), the same identity on phone, tablet and web:
// ivory pages, white cards with fine borders, deep emerald for actions and the report band, brass/champagne
// for the few accents. Use these tokens everywhere; never hard-code colors or sizes in screens.

export const COLORS = {
  background: '#FAF7F0', // ivory page background
  surface: '#FFFFFF', // cards, inputs, menus
  surfaceSoft: '#F3EEE2', // totals, table headers, subtle panels (warm beige)
  card: '#FFFFFF', // kept for backward compatibility

  primary: '#0F4D3F', // emerald — main actions
  primaryDark: '#0A3329', // pressed / headings accent
  primarySoft: '#EEF3EF', // selected item background
  secondary: '#0F4D3F',

  accent: '#A9864A', // brass — avatars, highlights, chart accent
  accentSoft: '#E9D7AE', // champagne — the main button on the emerald band
  onAccentSoft: '#0A3329',

  textDark: '#1C2421', // main text
  text: '#1C2421',
  textMuted: '#5F6763', // secondary text, placeholders (4.5:1 on ivory)
  onPrimary: '#FFFFFF',

  border: '#E6E0D2',
  borderStrong: '#D6CEBC',

  // the emerald band at the top of the dashboard / reports
  band: '#0F4D3F',
  bandText: '#FFFFFF',
  bandMuted: '#D8D0BC',
  bandCard: 'rgba(255, 255, 255, 0.07)',
  bandBorder: 'rgba(233, 215, 174, 0.28)',

  // Status colors (each with a soft background)
  success: '#1F7A52',
  successSoft: '#E4F2EA',
  warning: '#8A6416',
  warningSoft: '#FFF4DC',
  danger: '#9F3328',
  dangerSoft: '#FBE6E2',
  info: '#24609B',
  infoSoft: '#E3EEF9',

  overlay: 'rgba(10, 30, 25, 0.40)',
};

export const SPACING = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 };

export const RADIUS = { sm: 10, md: 12, lg: 18, pill: 999 };

export const FONT = {
  small: 12,
  body: 14,
  medium: 16,
  title: 22,
  large: 26,
  weightRegular: '400',
  weightMedium: '600',
  weightBold: '700',
  // headings and large numbers: Noto Kufi Arabic on the web (loaded in services/skin.js); the phone keeps its
  // system font until the font files are added to the app
  display: Platform.OS === 'web' ? "'Noto Kufi Arabic', 'IBM Plex Sans Arabic', sans-serif" : undefined,
};

// Legacy names used by older code
export const SIZES = { base: 10, small: 13, font: 15, medium: 17, large: 22, radius: RADIUS.lg, padding: 20 };

export const SHADOWS = {
  card: { boxShadow: '0px 1px 2px rgba(28, 36, 33, 0.04)' },
  floating: { boxShadow: '0px 12px 32px rgba(10, 51, 41, 0.14)' },
};

// Menus (the web's top navigation, the phone's side menu): light, the selected item in soft emerald.
COLORS.nav = COLORS.surface;
COLORS.navText = COLORS.textDark;
COLORS.navMuted = COLORS.textMuted;
COLORS.navActive = COLORS.primarySoft;
COLORS.navActiveText = COLORS.primary;
COLORS.navBorder = COLORS.border;

// The web look only changes the frame (top navigation, wider pages), not the colors.
export const WEB_LOOK = WEB_SKIN;

export default { COLORS, SPACING, RADIUS, FONT, SIZES, SHADOWS };

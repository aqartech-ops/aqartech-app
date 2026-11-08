import { Platform } from 'react-native';

// Web look (واجهة الويب) — TRIAL.
// The web has its own presentation layer: its own colours, font, frame (dark side menu + top bar) and
// table-style lists, on top of exactly the same screens, logic, permissions and data as the phone app.
// Phone and tablet apps are never affected. On the web it is ON by default and can be switched back to
// the classic look in Settings (stored per browser; switching reloads the page, because the design tokens
// are read once at start-up).

const KEY = 'aqartech.webSkin';
export const WEB_FONT = 'IBM Plex Sans Arabic';

function saved() {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

export const WEB_SKIN = Platform.OS === 'web' && saved() !== 'classic';

export function setWebSkin(on) {
  try {
    localStorage.setItem(KEY, on ? 'new' : 'classic');
  } catch {
    // private mode: nothing to remember, the reload shows the default
  }
  if (typeof window !== 'undefined') window.location.reload();
}

/** Font + a few page-level touches that only CSS can do (font on every text, thin scrollbars). */
function installCss() {
  if (typeof document === 'undefined' || document.getElementById('aqartech-web-skin')) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = 'https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Arabic:wght@400;500;600;700&display=swap';
  document.head.appendChild(link);

  const family = `'${WEB_FONT}', system-ui, -apple-system, 'Segoe UI', Tahoma, sans-serif`;
  const style = document.createElement('style');
  style.id = 'aqartech-web-skin';
  // Texts are <div dir="auto">; icons carry their own font in an inline style, so they are left alone.
  style.textContent = `
    html, body { font-family: ${family}; -webkit-font-smoothing: antialiased; }
    [dir="auto"]:not([style*="font-family"]), [dir="auto"] span:not([style*="font-family"]), input, textarea { font-family: ${family} !important; }
    * { scrollbar-width: thin; scrollbar-color: #CBD5E1 transparent; }
    ::-webkit-scrollbar { width: 8px; height: 8px; }
    ::-webkit-scrollbar-thumb { background: #CBD5E1; border-radius: 8px; }
  `;
  document.head.appendChild(style);
}

if (WEB_SKIN) installCss();

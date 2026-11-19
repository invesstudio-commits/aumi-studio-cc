import { StudioSettings } from '../types/aumi.ts';

const DEFAULT_PRIMARY_FONT =
  '"DM Sans", -apple-system, BlinkMacSystemFont, "SF Pro Text", "Inter", "Segoe UI", system-ui, sans-serif';
const DEFAULT_DISPLAY_FONT =
  '"DM Sans", -apple-system, BlinkMacSystemFont, "SF Pro Display", "Segoe UI", system-ui, sans-serif';
const DEFAULT_EDITORIAL_FONT =
  '"DM Sans", -apple-system, BlinkMacSystemFont, "SF Pro Display", "Segoe UI", system-ui, sans-serif';

export function applyStudioTheme(settings?: Partial<StudioSettings> | null) {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;

  const typo = settings?.typography;
  const appearance = settings?.appearance;
  const tokens = settings?.theme_tokens;

  // Dynamic font CSS link injection (user can paste Google Fonts / Adobe Fonts / Typekit / CDN CSS link)
  const linkId = 'aumi-custom-font-link';
  const existingLink = document.getElementById(linkId) as HTMLLinkElement | null;
  const fontUrl = typo?.font_css_url?.trim() || '';

  if (fontUrl && (fontUrl.startsWith('https://') || fontUrl.startsWith('http://') || fontUrl.startsWith('/'))) {
    if (existingLink) {
      if (existingLink.href !== fontUrl) existingLink.href = fontUrl;
    } else {
      const link = document.createElement('link');
      link.id = linkId;
      link.rel = 'stylesheet';
      link.href = fontUrl;
      document.head.appendChild(link);
    }
  } else if (existingLink && !fontUrl) {
    existingLink.remove();
  }

  const primary = typo?.primary_font?.trim()
    ? `"${typo.primary_font.replace(/["']/g, '')}", ${DEFAULT_PRIMARY_FONT}`
    : DEFAULT_PRIMARY_FONT;
  const display = typo?.display_font?.trim()
    ? `"${typo.display_font.replace(/["']/g, '')}", ${primary}`
    : typo?.primary_font?.trim()
      ? primary
      : DEFAULT_DISPLAY_FONT;
  const editorial = typo?.editorial_font?.trim()
    ? `"${typo.editorial_font.replace(/["']/g, '')}", ${DEFAULT_EDITORIAL_FONT}`
    : DEFAULT_EDITORIAL_FONT;

  root.style.setProperty('--aumi-font-primary', primary);
  root.style.setProperty('--aumi-font-display', display);
  root.style.setProperty('--aumi-font-editorial', editorial);

  const scale = Number(typo?.base_scale) || 1;
  root.style.setProperty('--aumi-font-scale', String(Math.min(1.15, Math.max(0.88, scale))));
  root.style.setProperty('--aumi-letter-spacing', typo?.letter_spacing?.trim() || '-0.015em');

  if (appearance?.primary_accent) {
    root.style.setProperty('--aumi-accent-purple', appearance.primary_accent);
  }
  if (appearance?.secondary_accent) {
    root.style.setProperty('--aumi-accent-pink', appearance.secondary_accent);
  }
  if (appearance?.warm_accent) {
    root.style.setProperty('--aumi-accent-orange', appearance.warm_accent);
  }

  const blurPx = Number(tokens?.glass_blur) || 22;
  root.style.setProperty('--aumi-glass-blur', `${Math.min(40, Math.max(8, blurPx))}px`);
  root.dataset.aumiWallpaper = tokens?.wallpaper_tint || 'aura_purple';
}

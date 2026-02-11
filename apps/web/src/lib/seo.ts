const DEFAULT_SITE_URL = 'https://retrofoot-web.pages.dev';

export const SITE_NAME = 'RetroFoot';
export const SITE_URL = (
  import.meta.env.VITE_SITE_URL || DEFAULT_SITE_URL
).replace(/\/+$/, '');
export const DEFAULT_OG_IMAGE = `${SITE_URL}/og-default.svg`;

export function toCanonicalUrl(pathname = '/'): string {
  const normalizedPath = pathname.startsWith('/') ? pathname : `/${pathname}`;
  return `${SITE_URL}${normalizedPath}`;
}

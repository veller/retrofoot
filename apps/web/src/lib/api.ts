// API configuration
// In both development and production, we use relative /api paths
// - Development: Vite proxies /api to localhost:8787
// - Production: Cloudflare Pages Functions proxy /api to the Workers API
// This keeps auth cookies first-party (same domain) avoiding third-party cookie blocking
export const API_BASE_URL = '';

export function apiUrl(path: string): string {
  return `${API_BASE_URL}${path}`;
}

// Fetch wrapper that uses the correct API URL
export async function apiFetch(
  path: string,
  options?: RequestInit
): Promise<Response> {
  const url = apiUrl(path);
  return fetch(url, {
    ...options,
    credentials: 'include',
  });
}

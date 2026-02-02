// API configuration
// In development, Vite proxies /api to localhost:8787
// In production, we need to call the API directly
export const API_BASE_URL = import.meta.env.PROD
  ? 'https://retrofoot-api.vellerbauer.workers.dev'
  : '';

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

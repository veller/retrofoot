// Proxy all /api/* requests to the Workers API
// This makes auth cookies first-party (same domain) instead of third-party

const API_ORIGIN = 'https://retrofoot-api.vellerbauer.workers.dev';

export const onRequest: PagesFunction = async (context) => {
  const { request } = context;
  const url = new URL(request.url);

  // Build the target URL (keep the /api path)
  const targetUrl = new URL(url.pathname + url.search, API_ORIGIN);

  // Create headers, forwarding most from the original request
  const headers = new Headers(request.headers);

  // Set the correct host for the target
  headers.set('Host', new URL(API_ORIGIN).host);

  // Forward the original origin for CORS
  const origin = request.headers.get('Origin');
  if (origin) {
    headers.set('X-Forwarded-Origin', origin);
  }

  // Forward client IP
  const clientIp = request.headers.get('CF-Connecting-IP');
  if (clientIp) {
    headers.set('X-Forwarded-For', clientIp);
  }

  // Create the proxied request
  const proxyRequest = new Request(targetUrl.toString(), {
    method: request.method,
    headers,
    body: request.body,
    redirect: 'manual',
  });

  // Forward the request to the API
  const response = await fetch(proxyRequest);

  // Create response headers
  const responseHeaders = new Headers(response.headers);

  // Rewrite Set-Cookie headers to use the Pages domain
  const cookies = response.headers.getSetCookie?.() || [];
  if (cookies.length > 0) {
    // Remove old Set-Cookie headers
    responseHeaders.delete('Set-Cookie');

    // Rewrite each cookie
    for (const cookie of cookies) {
      // Remove the Domain attribute so it defaults to the current domain
      // Also remove __Secure- prefix if present (we'll keep it secure via SameSite)
      let rewrittenCookie = cookie
        // Remove Domain=... attribute
        .replace(/;\s*Domain=[^;]*/gi, '')
        // Keep the cookie otherwise unchanged
        .trim();

      responseHeaders.append('Set-Cookie', rewrittenCookie);
    }
  }

  // Set CORS headers for the Pages origin
  if (origin) {
    responseHeaders.set('Access-Control-Allow-Origin', origin);
    responseHeaders.set('Access-Control-Allow-Credentials', 'true');
  }

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: responseHeaders,
  });
};

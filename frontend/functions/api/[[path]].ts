// Cloudflare Pages Function: proxies every /api/* request to the real
// backend. The frontend code calls relative /api/... paths everywhere
// (same-origin, matching local dev's Vite proxy) — this is what makes that
// same-origin illusion true in production too. API_ORIGIN is a Pages
// environment variable (not VITE_-prefixed — read at request time by this
// function, not baked into the client bundle).
interface Env {
  API_ORIGIN: string;
}

export const onRequest: PagesFunction<Env> = async (context) => {
  const { request, env } = context;
  const apiOrigin = env.API_ORIGIN;
  if (!apiOrigin) {
    return new Response(JSON.stringify({ message: "API_ORIGIN is not configured" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  const url = new URL(request.url);
  const targetUrl = apiOrigin.replace(/\/$/, "") + url.pathname + url.search;

  const headers = new Headers(request.headers);
  headers.delete("host");

  const init: RequestInit = {
    method: request.method,
    headers,
    body: ["GET", "HEAD"].includes(request.method) ? undefined : request.body,
  };
  // Cloudflare requires duplex when forwarding a streamed body.
  (init as { duplex?: string }).duplex = "half";

  const response = await fetch(targetUrl, init);
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
  });
};

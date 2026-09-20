import { defineMiddleware } from 'astro:middleware';

/**
 * Nothing under /learning may enter a shared cache.
 *
 * Found in production, not in review. A request for `S02-COACH.pdf` made while
 * signed in as the boy correctly returned 404 — and Cloudflare cached it,
 * because `.pdf` is on its default cacheable-extension list and that response
 * carried no `Cache-Control` at all. The father then asked for the same URL,
 * was served the cached denial, and could not open his own coach notes.
 *
 * The inverse is the one that matters: the same mechanism would happily cache
 * a *successful* response and hand it to whoever asked for the URL next. It
 * did not, only because the success paths already set `private` — which is
 * exactly the kind of protection that should not depend on remembering it on
 * every individual response.
 *
 * So it is set here, once, for every response on every /learning route:
 * pages, endpoints, redirects, 404s and errors alike. `Vary: Cookie` is
 * belt-and-braces, since the cookie is what makes these responses differ.
 *
 * The cost is that a sheet PDF re-downloads each time it is opened. For a
 * two-person site that is not a cost worth trading a cross-role cache hit for.
 */
export const onRequest = defineMiddleware(async (ctx, next) => {
  const response = await next();

  if (ctx.url.pathname.startsWith('/learning')) {
    response.headers.set('cache-control', 'private, no-store, max-age=0, must-revalidate');
    response.headers.set('vary', 'Cookie');
    // Belt and braces alongside the meta tag in LearningLayout: a PDF or a
    // JSON export has no <head> to put a robots meta tag in.
    response.headers.set('x-robots-tag', 'noindex, nofollow, noarchive');
  }

  return response;
});

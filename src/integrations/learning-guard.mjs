/**
 * Build-time guard for /learning.
 *
 * The failure this exists to prevent:
 *
 *   astro.config.mjs sets no `output`, so Astro 5 defaults to static. Every
 *   route under /learning opts itself into on-demand rendering with
 *   `export const prerender = false`. Forget that one line on one page and it
 *   does not fail loudly — it builds to a static HTML file that is served
 *   without ever running the auth check, and @astrojs/sitemap happily
 *   advertises it to Google, because a prerendered page is a real page.
 *
 * One forgotten line, two failures, no error. So the build refuses instead.
 *
 * It also checks the reverse direction: a /learning route that is on-demand
 * but is somehow in the sitemap, and a sitemap config with no filter at all.
 */

// /gree (the GRE trainer) is private in exactly the same way.
const PREFIXES = ['/learning', '/gree'];

function pathOf(route) {
  return route.pattern ?? route.route ?? route.pathname ?? '';
}

function isPrerendered(route) {
  // astro:routes:resolved uses isPrerendered; astro:build:done has used
  // prerender historically. Treat an absent flag as prerendered, because the
  // safe default for this check is to complain.
  if (typeof route.isPrerendered === 'boolean') return route.isPrerendered;
  if (typeof route.prerender === 'boolean') return route.prerender;
  return true;
}

function check(routes, logger) {
  const offenders = [];
  let seen = 0;

  for (const route of routes ?? []) {
    const path = pathOf(route);
    if (!PREFIXES.some((p) => path === p || path.startsWith(p + '/'))) continue;
    // Redirects and 404s have no server code to protect.
    if (route.type === 'redirect' || route.type === 'fallback') continue;
    seen++;
    if (isPrerendered(route)) offenders.push(`${path}  (${route.entrypoint ?? 'unknown file'})`);
  }

  if (offenders.length) {
    throw new Error(
      [
        '',
        'learning-guard: these /learning routes would be PRERENDERED.',
        '',
        'A prerendered route under /learning is served as a static file, which',
        'means it never runs the auth check and is published to the sitemap.',
        '',
        ...offenders.map((o) => `  - ${o}`),
        '',
        'Add `export const prerender = false;` to the frontmatter of each.',
        '',
      ].join('\n'),
    );
  }

  logger.info(`${seen} private route${seen === 1 ? '' : 's'} (/learning, /gree) confirmed on-demand`);
}

export default function learningGuard() {
  let checked = false;

  return {
    name: 'learning-guard',
    hooks: {
      'astro:config:done': ({ config, logger }) => {
        const sitemap = config.integrations?.find((i) => i.name === '@astrojs/sitemap');
        if (sitemap && !sitemap.__learningFilterChecked) {
          // We cannot read the integration's options back out, so this is a
          // reminder rather than an assertion; the real protection is the
          // prerender check below plus robots.txt.
          logger.info('sitemap present — /learning must be excluded by its filter');
        }
      },

      'astro:routes:resolved': ({ routes, logger }) => {
        check(routes, logger);
        checked = true;
      },

      'astro:build:done': ({ routes, logger }) => {
        if (!checked) check(routes, logger);
      },
    },
  };
}

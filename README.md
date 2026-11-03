# kirtanjain.com

Source for my personal site, https://kirtanjain.com.

Built with Astro and TypeScript, deployed on Cloudflare Workers, with D1 for the small pieces of stored state. Besides the main pages it hosts a few self-contained tools I use myself.

## Run it

    npm install
    cp .dev.vars.example .dev.vars   # fill in local values
    npm run dev

## Layout

- `src/pages` routes
- `src/data` content
- `migrations*` D1 schema migrations
- `docs/` design notes and plans written while building it

Secrets live in `.dev.vars` and Cloudflare, never in the repo.

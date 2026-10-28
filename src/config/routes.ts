/**
 * Every path the app serves.
 *
 * This exists so the host can be told which paths are real. A blanket SPA
 * fallback (`/* -> /index.html 200`) answers 200 for *any* URL, which is an
 * unbounded crawl space: a crawler that invents `/a/b/c/d` gets a page, follows
 * more invented links, and never terminates. That shape ran up a four-figure
 * bill on another Colorlib demo in 2026.
 *
 * Enumerating the routes lets unknown paths return a real 404, so crawling
 * terminates. `routes.test.ts` fails if this list and the router disagree, so
 * the two cannot drift.
 *
 * Plain strings and no JSX on purpose — `vite.config.ts` imports this at build
 * time to generate `_redirects`.
 */
export const ROUTE_PATHS = [
  '/',
  '/overview',
  '/campaigns',
  '/campaign-detail',
  '/search-terms',
  '/trends',
  '/placements',
  '/placement-detail',
  '/import',
  '/management',
  '/sync',
  '/settings',
] as const;

export type RoutePath = (typeof ROUTE_PATHS)[number];

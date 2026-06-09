import type { Context } from 'hono';

// Adapt a Next-style route handler — (Request, { params }) => Promise<Response> —
// into a Hono handler. `c.req.raw` is the standard Request; `c.req.param()` is the params object.
// Generic over the ctx type so each handler keeps its specific `{ params: {...} }` typing.
export const adapt =
  <C extends { params: Record<string, string> }>(
    handler: (req: Request, ctx: C) => Promise<Response>,
  ) =>
  (c: Context): Promise<Response> =>
    handler(c.req.raw, { params: c.req.param() } as C);

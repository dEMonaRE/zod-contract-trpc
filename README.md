# zod-contract-trpc

Wires a [tRPC](https://trpc.io) `appRouter` into
[zod-contract](../zod-contract)'s pipeline — produces OpenAPI `paths.yaml/json`
that exposes your tRPC procedures as a REST-style surface (one POST per
procedure, paths from the dotted procedure path).

## Install

```bash
npm install --save-dev @aemrezorlu/zod-contract-trpc @trpc/server zod
```

Peer deps: `@trpc/server` `^11.0.0`, `@aemrezorlu/zod-contract` `^0.4.0`.

## Webhooks (OpenAPI 3.2)

`t.procedure.subscription(...)` procedures are routed into the top-level
`webhooks:` field introduced in OpenAPI 3.2, keyed by the dotted procedure
path (`message.onNew`):

```yaml
webhooks:
  message.onNew:
    post:
      summary: subscription message.onNew
      requestBody: { ... }
      responses:
        '200': { ... }
```

Queries and mutations remain under `paths:` as `POST /trpc/<path>`. When
the build target is OpenAPI 3.1, subscriptions fall back to the same `paths:`
shape (no downgrade warning — `webhooks:` was the only 3.2-only addition).

## Usage

```ts
// src/server/root.ts
import { initTRPC } from '@trpc/server'
import { z } from 'zod'

const t = initTRPC.create()
export const appRouter = t.router({
  user: {
    list: t.procedure.input(z.object({ limit: z.number().int().optional() })).query(...),
    create: t.procedure.input(z.object({ email: z.string().email() })).mutation(...),
  },
})
```

```ts
// build.mjs
import { build } from '@aemrezorlu/zod-contract'
import { trpcPlugin } from '@aemrezorlu/zod-contract-trpc'

await build({
  src: 'src/api',
  plugins: [trpcPlugin({
    routerEntry: 'src/server/root.ts',
    mountPath: '/trpc',   // default; matches tRPC's HTTP handler
  })],
})
```

## Output

Every procedure becomes a `POST /<mount>/<dot.path.slashed>`:

```yaml
paths:
  /trpc/user/list:
    post:
      summary: query user.list
      description: List users with optional limit.
      requestBody:
        content:
          application/json:
            schema: ...
      responses:
        '200': { ... }
        default: { description: 'tRPC error (TRPCError JSON shape)' }
  /trpc/user/create:
    post:
      summary: mutation user.create
      requestBody: ...
```

`paths.json` is produced when the core is invoked with `--format json`.

## Description (v0.3)

`Schema.describe('...')` on the output (or input) schema is copied to
`operation.description`. Use it to give API consumers one source of truth
for each procedure's behavior.

## v0.1.0 scope

- Walks `appRouter._def.procedures` to enumerate query / mutation / subscription procedures
- Reads `.input(zodSchema)` and emits as `requestBody.content[application/json].schema`
- Reads `.output(zodSchema)` (when present) and emits as the `200` response
- All procedures are POST — tRPC's HTTP transport uniform

Not yet (roadmap):
- Read procedures' `.input((ctx) => zodSchema)` for context-derived input schemas
- Form-data / non-JSON procedure inputs
- Splitting batched calls (`createCaller`) back into one entry per procedure

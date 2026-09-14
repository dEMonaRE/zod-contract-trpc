// tRPC appRouter → OpenAPI paths.
//
// Usage:
//   await build({
//     src: 'src/api',
//     plugins: [trpcPlugin({
//       routerEntry: 'src/server/root.ts',  // exports `appRouter`
//     })],
//   })
//
// tRPC is RPC-style: every procedure is POST to /<mountPath>/<procedure.path>.
// The plugin emits a single OpenAPI operation per query/mutation/subscription
// procedure using a path of form /<mountPath>/{procedure.path.replace('.', '/')}.
// Inputs (Zod schemas) flow to requestBody; outputs to 200 response.

import * as path from 'node:path'
import { createJiti } from 'jiti'
import { stringify as yaml } from 'yaml'
import type { ZodTypeAny } from 'zod'
import {
  zodToOpenAPI,
  type BuildContext,
  type OpenAPISchema,
  type Plugin,
} from '@aemrezorlu/zod-contract'

export interface TrpcPluginOptions {
  /** File exporting `appRouter` (or default export). Loaded via jiti. */
  routerEntry: string
  /** Mount path for the tRPC endpoint (default `/trpc`). */
  mountPath?: string
}

export function trpcPlugin(opts: TrpcPluginOptions): Plugin {
  return {
    name: 'trpc',
    async finalize(ctx: BuildContext): Promise<BuildContext> {
      const mountPath = opts.mountPath ?? '/trpc'
      const entry = path.resolve(opts.routerEntry)
      let router: unknown
      try {
        const jiti = createJiti(path.dirname(entry), {
          interopDefault: true,
          moduleCache: false,
        })
        const mod = jiti(entry) as Record<string, unknown>
        router = mod.appRouter ?? mod.default
      } catch (e) {
        process.stderr.write(`trpc: failed to load ${opts.routerEntry}: ${(e as Error).message}\n`)
        return ctx
      }

      const procedures = extractProcedures(router)
      if (procedures.length === 0) return ctx

      const paths: Record<string, Record<string, OpenAPISchema>> = {}
      for (const proc of procedures) {
        const openapiPath = mountPath + '/' + proc.path.replace(/\./g, '/')
        const operation = buildOperation(proc)
        const entry = paths[openapiPath] ?? {}
        // tRPC uses POST for everything at the HTTP transport level
        entry.post = operation
        paths[openapiPath] = entry
      }

      const ext = ctx.format === 'json' ? 'json' : 'yaml'
      const payload = { paths }
      const content =
        ctx.format === 'json' ? JSON.stringify(payload, null, 2) + '\n' : yaml(payload)
      ctx.outputs.set(`paths.${ext}`, content)
      return ctx
    },
  }
}

interface Procedure {
  path: string
  type: 'query' | 'mutation' | 'subscription'
  /** Zod schema for input, if any (procedure with .input(z.object({}))) */
  input?: ZodTypeAny
  /** Zod schema for output, if any (procedure returning .output(...)) */
  output?: ZodTypeAny
}

function extractProcedures(router: unknown): Procedure[] {
  const out: Procedure[] = []
  if (typeof router !== 'object' || router === null) return out

  // tRPC v11 router has _def.procedures which is a record<path, ProcedureRecord>
  const def = (router as { _def?: { procedures?: unknown } })._def
  const procedures = def?.procedures
  if (!procedures || typeof procedures !== 'object') return out

  for (const [procPath, rec] of Object.entries(procedures as Record<string, unknown>)) {
    // tRPC procedure records are AsyncFunction instances in v11 — typeof === 'function', not 'object'
    if (rec === null) continue
    const r = rec as { _def?: { type?: unknown; inputs?: unknown; output?: unknown } }
    const d = r._def
    if (!d) continue

    const type = (d.type as string | undefined)?.toLowerCase()
    if (type !== 'query' && type !== 'mutation' && type !== 'subscription') continue

    const proc: Procedure = { path: procPath, type }
    // inputs is an array of input descriptors; [0] is usually the .input() schema
    if (Array.isArray(d.inputs) && d.inputs.length > 0) {
      const first = d.inputs[0] as { parse?: unknown; _def?: { typeName?: string } } | undefined
      // Ponytail: tRPC v11 inputs shape varies; we accept anything with a parse fn (looks like Zod)
      if (first && typeof first.parse === 'function') {
        proc.input = first as ZodTypeAny
      }
    }
    if (d.output && typeof (d.output as { parse?: unknown }).parse === 'function') {
      proc.output = (d.output as unknown) as ZodTypeAny
    }
    out.push(proc)
  }
  return out
}

function buildOperation(proc: Procedure): OpenAPISchema {
  const operation: OpenAPISchema = {
    summary: `${proc.type} ${proc.path}`,
  }

  if (proc.input) {
    operation.requestBody = {
      required: true,
      content: {
        'application/json': {
          schema: zodToOpenAPI({ name: 'Input', zod: proc.input, file: '' }),
        },
      },
    }
    // tRPC inputs go in the body, but also expose in query for GET semantics
    // ponytail: not emitting alternate; v1 ships body-only matching tRPC's HTTP transport
  }

  const responses: Record<string, OpenAPISchema> = {}
  if (proc.output) {
    responses['200'] = {
      description: 'OK',
      content: {
        'application/json': {
          schema: zodToOpenAPI({ name: 'Output', zod: proc.output, file: '' }),
        },
      },
    }
  } else {
    responses['200'] = { description: 'OK' }
  }
  responses['default'] = {
    description: 'tRPC error (TRPCError JSON shape)',
  }
  operation.responses = responses

  return operation
}

import { describe, it, expect } from 'vitest'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'
import { parse as parseYaml } from 'yaml'
import { trpcPlugin } from '../src/trpc-plugin.js'
import type { BuildContext } from '@aemrezorlu/zod-contract'

const here = path.dirname(fileURLToPath(import.meta.url))

function makeCtx(): BuildContext {
  return { schemas: [], outputs: new Map(), format: 'yaml', openapiVersion: '3.2.0' }
}

describe('tRPC subscriptions → webhooks (OpenAPI 3.2)', () => {
  it('emits subscription procedures under webhooks:, not paths:', async () => {
    const plugin = trpcPlugin({
      routerEntry: path.resolve(here, '../fixtures/router-with-sub.ts'),
      mountPath: '/trpc',
    })
    const ctx = makeCtx()
    await plugin.finalize!(ctx)

    const out = ctx.outputs.get('paths.yaml')
    expect(out).toBeDefined()
    const parsed = parseYaml(out!) as {
      paths: Record<string, unknown>
      webhooks: Record<string, { post: unknown }>
    }
    expect(parsed.paths).toEqual({})
    expect(parsed.webhooks).toBeDefined()
    // Subscriptions keyed by dotted procedure path (OpenAPI 3.2 native webhooks)
    expect(parsed.webhooks['message.onNew'].post).toBeDefined()
  })

  it('mixed router: queries in paths:, subscriptions in webhooks:', async () => {
    const plugin = trpcPlugin({
      routerEntry: path.resolve(here, '../fixtures/router.ts'),
      mountPath: '/trpc',
    })
    const ctx = makeCtx()
    await plugin.finalize!(ctx)

    const parsed = parseYaml(ctx.outputs.get('paths.yaml')!) as {
      paths: Record<string, unknown>
      webhooks: Record<string, unknown>
    }
    // router.ts has only queries/mutations — no subscriptions
    expect(parsed.paths['/trpc/user/list']).toBeDefined()
    // webhooks: omitted entirely when no subscriptions exist (clean YAML)
    expect(parsed.webhooks).toBeUndefined()
  })
})

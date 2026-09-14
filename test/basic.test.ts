import { describe, it, expect } from 'vitest'
import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import * as os from 'node:os'
import { build } from '@aemrezorlu/zod-contract'
import { trpcPlugin } from '../src/trpc-plugin.js'

const ROUTER = path.resolve('fixtures/router.ts')

async function tmp(): Promise<string> {
  return await fs.mkdtemp(path.join(os.tmpdir(), 'zod-contract-trpc-'))
}

describe('trpcPlugin', () => {
  it('emits paths.yaml under /trpc for each procedure', async () => {
    const out = await tmp()
    const ctx = await build({
      src: ROUTER,
      out,
      plugins: [trpcPlugin({ routerEntry: ROUTER })],
    })
    const yaml = ctx.outputs.get('paths.yaml')
    expect(yaml).toBeDefined()
    expect(yaml).toContain('/trpc/user/list:')
    expect(yaml).toContain('/trpc/user/byId:')
    expect(yaml).toContain('/trpc/user/create:')
    // every procedure is POST
    expect(yaml).toContain('post:')
  })

  it('attaches requestBody from .input() schemas', async () => {
    const out = await tmp()
    const ctx = await build({
      src: ROUTER,
      out,
      plugins: [trpcPlugin({ routerEntry: ROUTER })],
    })
    const yaml = ctx.outputs.get('paths.yaml') ?? ''
    expect(yaml).toContain('requestBody')
    expect(yaml).toContain('limit')
    expect(yaml).toContain('email')
  })

  it('honors ctx.format=json', async () => {
    const out = await tmp()
    const ctx = await build({
      src: ROUTER,
      out,
      plugins: [trpcPlugin({ routerEntry: ROUTER })],
      format: 'json',
    })
    expect(ctx.outputs.has('paths.yaml')).toBe(false)
    const json = ctx.outputs.get('paths.json')
    expect(json).toBeDefined()
    const parsed = JSON.parse(json!)
    expect(parsed.paths['/trpc/user/list'].post).toBeTruthy()
  })

  it('respects custom mountPath', async () => {
    const out = await tmp()
    const ctx = await build({
      src: ROUTER,
      out,
      plugins: [trpcPlugin({ routerEntry: ROUTER, mountPath: '/api' })],
    })
    const yaml = ctx.outputs.get('paths.yaml') ?? ''
    expect(yaml).toContain('/api/user/list:')
    expect(yaml).not.toContain('/trpc/user/list:')
  })

  it('gracefully no-ops when routerEntry fails to load', async () => {
    const out = await tmp()
    const ctx = await build({
      src: ROUTER,
      out,
      plugins: [trpcPlugin({ routerEntry: '/nope/missing.ts' })],
    })
    expect(ctx.outputs.has('paths.yaml')).toBe(false)
  })
})

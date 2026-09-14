import { initTRPC } from '@trpc/server'
import { z } from 'zod'

const t = initTRPC.create()

export const appRouter = t.router({
  message: {
    onNew: t.procedure
      .input(z.object({ channelId: z.string() }))
      .subscription(() => ({ ts: new Date().toISOString(), text: 'hello' })),
  },
})

export type AppRouter = typeof appRouter

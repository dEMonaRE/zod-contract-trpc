import { initTRPC } from '@trpc/server'
import { z } from 'zod'

const t = initTRPC.create()

export const appRouter = t.router({
  user: {
    list: t.procedure
      .input(z.object({ limit: z.number().int().optional() }))
      .query(({ input }) => ({ users: [], total: 0, ...input })),

    byId: t.procedure
      .input(z.object({ id: z.string() }))
      .query(({ input }) => ({ id: input.id, email: 'a@b.com' })),

    create: t.procedure
      .input(z.object({ email: z.string().email(), name: z.string() }))
      .mutation(({ input }) => ({ id: 'new', ...input })),
  },
})

export type AppRouter = typeof appRouter

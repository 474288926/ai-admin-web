import { z } from 'zod'

export const authSessionSchema = z.object({
  tokenType: z.literal('Bearer'),
  accessToken: z.string().min(1),
  accessTokenExpiresIn: z.number().positive(),
  refreshToken: z.string().min(1),
  refreshTokenExpiresIn: z.number().positive(),
  user: z.object({
    id: z.string().min(1),
    email: z.email(),
    name: z.string().nullable(),
    createdAt: z.string(),
  }),
})

export const authTokensSchema = authSessionSchema.omit({ user: true })

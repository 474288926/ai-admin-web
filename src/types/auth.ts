export interface AuthUser {
  id: string
  email: string
  name: string | null
  createdAt: string
}

export interface AuthTokens {
  tokenType: 'Bearer'
  accessToken: string
  accessTokenExpiresIn: number
  refreshToken: string
  refreshTokenExpiresIn: number
}

export interface AuthSession extends AuthTokens {
  user: AuthUser
}

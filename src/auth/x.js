import { HttpError } from '../errors.js'

// TODO: Sign in with X is OAuth 2.0 authorization-code + PKCE, not a password grant.
// When X_CLIENT_ID and X_CLIENT_SECRET are both set, start() should redirect to
// https://twitter.com/i/oauth2/authorize with a stored state, a S256 code_challenge,
// and redirect_uri (X_REDIRECT_URI or {PUBLIC_BASE_URL}/api/auth/x/callback).
// The callback should exchange the code at https://api.x.com/2/oauth2/token and
// only then create a session. Do not invent a user, token, or session before that
// exchange exists. Leaving the route unimplemented on purpose is the stub.

export function xAuthEnabled(env = {}) {
  return Boolean(env.X_CLIENT_ID && env.X_CLIENT_SECRET)
}

export function xAuthStart(env = {}) {
  if (!xAuthEnabled(env)) {
    throw new HttpError(404, 'Sign in with X is not configured', 'not_configured')
  }
  throw new HttpError(501, 'Sign in with X is not available yet', 'not_implemented')
}

export function xAuthCallback(env = {}) {
  if (!xAuthEnabled(env)) {
    throw new HttpError(404, 'Sign in with X is not configured', 'not_configured')
  }
  throw new HttpError(501, 'Sign in with X is not available yet', 'not_implemented')
}

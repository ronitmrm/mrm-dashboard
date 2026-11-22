/**
 * True when a browser Origin belongs to this app. Behind the production reverse
 * proxy the server sees an internal URL, so the configured public origin counts too.
 */
export function isAppOrigin(origin: string, request: Request) {
  if (origin === new URL(request.url).origin) return true
  const publicUrl = process.env.BETTER_AUTH_URL ?? process.env.NEXT_PUBLIC_APP_URL
  return publicUrl !== undefined && origin === new URL(publicUrl).origin
}

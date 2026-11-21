// Shared by the request proxy and the auth hooks; no Node-only imports.

export const deviceCookieName = "mrm_device"

// Browsers cap cookie lifetime at 400 days; the proxy renews it on every visit.
export const deviceCookieMaxAgeSeconds = 400 * 24 * 60 * 60

// Chromium sends these on later requests once asked, so approvers can tell
// an Android tablet's model or Windows 10 from 11 apart. Other browsers ignore the request.
export const deviceClientHints = "Sec-CH-UA-Model, Sec-CH-UA-Platform, Sec-CH-UA-Platform-Version"

const tokenPattern = /^[A-Za-z0-9_-]{43}$/

export function isDeviceToken(value: string | undefined): value is string {
  return value !== undefined && tokenPattern.test(value)
}

export function newDeviceToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32))
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "")
}

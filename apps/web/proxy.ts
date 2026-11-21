import { NextResponse, type NextRequest } from "next/server"

import {
  deviceClientHints,
  deviceCookieMaxAgeSeconds,
  deviceCookieName,
  isDeviceToken,
  newDeviceToken,
} from "./lib/auth/device-cookie"

export default function proxy(request: NextRequest) {
  const current = request.cookies.get(deviceCookieName)?.value
  const token = isDeviceToken(current) ? current : newDeviceToken()
  // A first visit carries the new device token to the handler in this pass.
  if (token !== current) request.cookies.set(deviceCookieName, token)

  const response = NextResponse.next({ request: { headers: request.headers } })
  response.cookies.set(deviceCookieName, token, {
    httpOnly: true,
    maxAge: deviceCookieMaxAgeSeconds,
    path: "/",
    sameSite: "lax",
    secure:
      request.nextUrl.protocol === "https:" ||
      request.headers.get("x-forwarded-proto") === "https",
  })
  response.headers.set("Accept-CH", deviceClientHints)
  return response
}

export const config = {
  matcher: ["/((?!.*\\..*|_next).*)", "/", "/(api|trpc)(.*)"],
}

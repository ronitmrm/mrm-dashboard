import { createHash, randomBytes } from "node:crypto"

import {
  createAuthorizationRepository,
  createDeviceApprovalRepository,
} from "@workspace/db"
import type { Pool } from "pg"

import { deviceCookieName, isDeviceToken } from "./device-cookie"
import { administrationTaskCapabilities } from "./task-capabilities"

function readCookie(headers: Headers, name: string) {
  for (const part of headers.get("cookie")?.split(";") ?? []) {
    const separator = part.indexOf("=")
    if (part.slice(0, separator).trim() === name) {
      return part.slice(separator + 1).trim()
    }
  }
  return undefined
}

// Client hints arrive as quoted structured-header strings, e.g. "SM-T505".
function clientHint(headers: Headers, name: string) {
  const value = headers.get(name)?.trim().replace(/^"|"$/g, "")
  return value || null
}

export function hashDeviceToken(token: string) {
  return createHash("sha256").update(token).digest("hex")
}

function newDeviceCode() {
  const hex = randomBytes(4).toString("hex").toUpperCase()
  return `${hex.slice(0, 4)}-${hex.slice(4)}`
}

export type DeviceAccess = { allowed: true } | { allowed: false; code: string }

export function createDeviceGate(pool: Pool) {
  const devices = createDeviceApprovalRepository({ pool })
  const authorization = createAuthorizationRepository({ pool })

  const mayUseAnyDevice = (userId: string) =>
    authorization.hasCapability(
      userId,
      administrationTaskCapabilities.useAnyDevice
    )

  return async function checkDevice(input: {
    headers: Headers | undefined
    sessionId: string | null
    userId: string
  }): Promise<DeviceAccess> {
    const token = input.headers && readCookie(input.headers, deviceCookieName)
    // The proxy issues a token on every request, so only a non-browser lacks one.
    if (!input.headers || !isDeviceToken(token)) {
      return !(await devices.enforced()) || (await mayUseAnyDevice(input.userId))
        ? { allowed: true }
        : { allowed: false, code: "unknown" }
    }
    const { code, enforced, status } = await devices.observe({
      code: newDeviceCode(),
      model: clientHint(input.headers, "sec-ch-ua-model"),
      platform: clientHint(input.headers, "sec-ch-ua-platform"),
      platformVersion: clientHint(input.headers, "sec-ch-ua-platform-version"),
      sessionId: input.sessionId,
      tokenHash: hashDeviceToken(token),
      userAgent: input.headers.get("user-agent"),
      userId: input.userId,
    })
    return !enforced || status === "approved" || (await mayUseAnyDevice(input.userId))
      ? { allowed: true }
      : { allowed: false, code }
  }
}

export function deviceBlockedMessage(code: string) {
  return code === "unknown"
    ? "This browser can't be identified. Enable cookies and try again."
    : `This device isn't approved for ERP access yet. Ask an administrator to approve device ${code}.`
}

import { headers } from "next/headers"

import { createAuthorizationRepository } from "@workspace/db"

import { readSignedInCapabilities } from "@/lib/auth/require-capability"
import { administrationTaskCapabilities as rights } from "@/lib/auth/task-capabilities"
import { getWebPostgresPool } from "@/lib/postgres-runtime"

import { ScreenProtectionClient } from "./screen-protection-client"

const screenRights = [
  rights.screenWithoutWatermark,
  rights.unfocusedScreenView,
  rights.printScreen,
] as const

/** Applies each screen protection the signed-in user holds no exemption for. */
export async function ScreenProtection() {
  // Opt out of prerendering before authorization telemetry starts.
  await headers()
  const signedIn = await readSignedInCapabilities(screenRights)
  if (!signedIn) return null
  const { granted, session } = signedIn
  const protections = {
    blockPrint: !granted.has(rights.printScreen),
    hideUnfocused: !granted.has(rights.unfocusedScreenView),
    watermark: !granted.has(rights.screenWithoutWatermark),
  }
  if (!Object.values(protections).some(Boolean)) return null

  const employeeCode = protections.watermark
    ? await createAuthorizationRepository({
        pool: getWebPostgresPool(),
      }).anyLinkedEmployeeCode(session.user.id)
    : null
  return (
    <ScreenProtectionClient
      {...protections}
      identity={[session.user.name, employeeCode ?? session.user.email].join(" · ")}
    />
  )
}

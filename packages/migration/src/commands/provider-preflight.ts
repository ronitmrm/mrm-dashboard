import { buildManagedProviderPreflight } from "../managed-provider-preflight"

if (!process.argv.includes("--redacted")) {
  throw new Error("Provider preflight requires --redacted")
}

const serviceEqualsArgument = process.argv.find((argument) =>
  argument.startsWith("--service=")
)
const serviceFlagIndex = process.argv.indexOf("--service")
const service =
  serviceEqualsArgument?.slice("--service=".length) ??
  (serviceFlagIndex >= 0 ? process.argv[serviceFlagIndex + 1] : undefined) ??
  "all"
if (!["all", "neon", "upstash"].includes(service)) {
  throw new Error("--service must be all, neon, or upstash")
}

const preflight = await buildManagedProviderPreflight()
process.stdout.write(
  `${JSON.stringify({
    event: "provider-preflight",
    service,
    ...preflight,
  })}\n`
)

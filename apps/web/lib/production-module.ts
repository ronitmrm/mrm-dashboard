const enabledValues = new Set(["1", "true", "yes"])

export function productionModuleIsEnabled(
  environment: Record<string, string | undefined> = process.env
) {
  return enabledValues.has(
    environment.PRODUCTION_MODULE_ENABLED?.trim().toLowerCase() ?? ""
  )
}

export type ExternalMasterView = "dataEntry" | "masterTables"

export function externalMasterView(
  value: string | string[] | undefined
): ExternalMasterView {
  return value === "masterTables" ? "masterTables" : "dataEntry"
}

export function externalMasterViewHref(
  path: string,
  view: ExternalMasterView,
  values: Record<string, string | null | undefined> = {}
) {
  const params = new URLSearchParams({ masterView: view })
  for (const [key, value] of Object.entries(values)) {
    if (value) params.set(key, value)
  }
  return `${path}?${params.toString()}`
}

export function externalMasterAllMastersHref(view: ExternalMasterView) {
  return `/?tab=${view === "dataEntry" ? "dataEntryTab" : "masterTablesTab"}`
}

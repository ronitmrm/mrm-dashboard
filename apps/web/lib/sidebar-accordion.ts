export const sidebarSectionIds = [
  "costing",
  "hr",
  "masterData",
  "operationalEntry",
  "store",
  "productionConventional",
  "productionConventional02",
  "productionCnc",
  "productionForging",
] as const

export type SidebarSectionId = (typeof sidebarSectionIds)[number]

export type ExpandedSidebarSections = Record<SidebarSectionId, boolean>

export function expandedSidebarSections(
  selected?: SidebarSectionId
): ExpandedSidebarSections {
  return Object.fromEntries(
    sidebarSectionIds.map((section) => [section, section === selected])
  ) as ExpandedSidebarSections
}

export function storedSidebarSections(
  value: string | null,
  fallback: ExpandedSidebarSections
): ExpandedSidebarSections {
  const fallbackSection = sidebarSectionIds.find((section) => fallback[section])
  if (!value) return expandedSidebarSections(fallbackSection)

  try {
    const parsed = JSON.parse(value) as Partial<ExpandedSidebarSections> & {
      production?: boolean
    }
    const hasStoredState =
      sidebarSectionIds.some(
        (section) => typeof parsed[section] === "boolean"
      ) || typeof parsed.production === "boolean"
    if (!hasStoredState) return expandedSidebarSections(fallbackSection)

    const fallbackWasOpen =
      Boolean(fallbackSection && parsed[fallbackSection]) ||
      (fallbackSection === "productionConventional" &&
        parsed.production === true)
    const selected = fallbackWasOpen
      ? fallbackSection
      : (sidebarSectionIds.find((section) => parsed[section] === true) ??
        (parsed.production ? "productionConventional" : undefined))

    return expandedSidebarSections(selected)
  } catch {
    return expandedSidebarSections(fallbackSection)
  }
}

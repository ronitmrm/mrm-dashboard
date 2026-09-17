export const measuringInstrumentRegister = {
  title: "Measuring Instrument Register",
  number: "MRMPL/ISO/REG/001",
  href: "/iso-document/measuring-instruments",
} as const

export const machineMaintenanceRegister = {
  title: "Machine Maintenance Register",
  href: "/iso-document/machine-maintenance-register",
} as const

export const machineMaintenancePlan = {
  title: "Machine Maintenance Plan",
  href: "/iso-document/machine-maintenance-plan",
} as const

export function isMeasuringInstrumentCategory(category: string) {
  return /^measuring instruments?$/i.test(category.trim().replace(/\s+/g, " "))
}

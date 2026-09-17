export const measuringInstrumentRegister = {
  title: "Measuring Instrument Register",
  number: "MRMPL/ISO/REG/001",
  href: "/iso-document/measuring-instruments",
} as const

export function isMeasuringInstrumentCategory(category: string) {
  return /^measuring instruments?$/i.test(category.trim().replace(/\s+/g, " "))
}

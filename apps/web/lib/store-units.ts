export const STORE_UNIT_OPTIONS = [
  { label: "Number (No.)", value: "No." },
  { label: "Pair", value: "Pair" },
  { label: "Set", value: "Set" },
  { label: "Pack", value: "Pack" },
  { label: "Box", value: "Box" },
  { label: "Roll", value: "Roll" },
  { label: "Gram (g)", value: "g" },
  { label: "Kilogram (kg)", value: "kg" },
  { label: "Milliliter (mL)", value: "mL" },
  { label: "Liter (L)", value: "L" },
  { label: "Millimeter (mm)", value: "mm" },
  { label: "Centimeter (cm)", value: "cm" },
  { label: "Meter (m)", value: "m" },
  { label: "Square meter (m²)", value: "m²" },
  { label: "Cubic meter (m³)", value: "m³" },
] as const

export function storeUnitValue(value: string) {
  const normalized = value.trim().toLowerCase()
  return STORE_UNIT_OPTIONS.find(
    (option) => option.label.toLowerCase() === normalized || option.value.toLowerCase() === normalized
  )?.value ?? value.trim()
}

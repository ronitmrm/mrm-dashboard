export function formatTimeInput(value: string) {
  const digits = value.replace(/\D/g, "").slice(0, 4)
  return digits.length < 2 ? digits : `${digits.slice(0, 2)}:${digits.slice(2)}`
}

/** Fixed slots keep separators visible during typing, deletion and paste. */
export function calendarInputTemplate(withTime: boolean, value = "", step?: number | string) {
  const seconds = withTime && (/:[\dms]{2}:/.test(value) || step === "any" || (step !== undefined && Number(step) % 60 !== 0))
  const fraction = seconds ? value.split(".")[1]?.length ?? (Number(step) < 1 ? 3 : 0) : 0
  return `DD/MM/YYYY${withTime ? " HH:mm" : ""}${seconds ? ":ss" : ""}${fraction ? `.${"s".repeat(fraction)}` : ""}`
}

export function maskCalendarInput(value: string, template: string) {
  return [...template].map((slot, index) => {
    const digit = value[index] ?? ""
    return /[DMYHms]/.test(slot) && /\d/.test(digit) ? digit : slot
  }).join("")
}

export function editCalendarInput(previous: string, value: string, caret: number, template: string, backward = false) {
  let start = 0
  while (start < previous.length && previous[start] === value[start]) start++
  let beforeEnd = previous.length
  let afterEnd = value.length
  while (beforeEnd > start && afterEnd > start && previous[beforeEnd - 1] === value[afterEnd - 1]) {
    beforeEnd--
    afterEnd--
  }
  const slots = [...previous]
  const editable = (index: number) => /[DMYHms]/.test(template[index] ?? "")
  for (let index = start; index < beforeEnd; index++) if (editable(index)) slots[index] = template[index]!
  const digits = value.slice(start, afterEnd).replace(/\D/g, "")
  // Deleting at a slash/colon clears the adjacent digit, never the separator.
  if (!digits && beforeEnd > start && !editable(start)) {
    while (start > 0 && start < template.length && !editable(start)) start += backward ? -1 : 1
    if (editable(start)) slots[start] = template[start]!
  }
  let position = start
  for (const digit of digits) {
    while (position < template.length && !editable(position)) position++
    if (position === template.length) break
    slots[position++] = digit
  }
  if (digits) while (position < template.length && !editable(position)) position++
  return { text: slots.join(""), caret: value === previous ? caret : position }
}

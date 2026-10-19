"use client"

import * as React from "react"

import { calendarInputDisplay, parseCalendarInput } from "@workspace/ui/lib/calendar-date"

/** Text entry has a fixed day/month/year presentation; submitted values stay ISO. */
function CalendarInput({
  type,
  value,
  defaultValue,
  onChange,
  onBlur,
  name,
  form,
  ref,
  min,
  max,
  step,
  ...props
}: React.ComponentProps<"input"> & { type: "date" | "datetime-local" }) {
  const withTime = type === "datetime-local"
  const initial = String(value ?? defaultValue ?? "")
  const [entry, setEntry] = React.useState(() => ({ source: initial, draft: calendarInputDisplay(initial, withTime) }))
  const inputRef = React.useRef<HTMLInputElement>(null)
  const source = value === undefined ? entry.source : String(value ?? "")
  if (source !== entry.source) setEntry({ source, draft: calendarInputDisplay(source, withTime) })
  const draft = source === entry.source ? entry.draft : calendarInputDisplay(source, withTime)
  const canonical = parseCalendarInput(draft, withTime) ?? ""
  const formatHint = withTime ? "DD/MM/YYYY HH:mm" : "DD/MM/YYYY"

  const validate = React.useCallback((input: HTMLInputElement, text: string) => {
    if (!text) {
      input.setCustomValidity("")
      return
    }
    const parsed = parseCalendarInput(text, withTime)
    if (!parsed) {
      input.setCustomValidity(`Enter a valid date in ${formatHint} format.`)
      return
    }
    // Preserve native date range and step validation while displaying a fixed format.
    const native = document.createElement("input")
    native.type = type
    native.value = parsed
    if (min !== undefined) native.min = String(min)
    if (max !== undefined) native.max = String(max)
    if (step !== undefined) native.step = String(step)
    const message = native.validity.rangeUnderflow
      ? `Date must be on or after ${calendarInputDisplay(String(min), withTime)}.`
      : native.validity.rangeOverflow
        ? `Date must be on or before ${calendarInputDisplay(String(max), withTime)}.`
        : native.validity.stepMismatch
          ? `Enter a date at the permitted interval in ${formatHint} format.`
          : ""
    input.setCustomValidity(message)
  }, [formatHint, max, min, step, type, withTime])

  React.useEffect(() => {
    if (inputRef.current) validate(inputRef.current, draft)
  }, [draft, validate])

  React.useEffect(() => {
    if (value !== undefined) return
    const parent = inputRef.current?.form
    const reset = () => {
      const source = String(defaultValue ?? "")
      setEntry({ source, draft: calendarInputDisplay(source, withTime) })
    }
    parent?.addEventListener("reset", reset)
    return () => parent?.removeEventListener("reset", reset)
  }, [defaultValue, value, withTime])

  return <>
    <input
      {...props}
      ref={(input) => {
        inputRef.current = input
        if (typeof ref === "function") return ref(input)
        if (ref) ref.current = input
      }}
      form={form}
      type="text"
      inputMode="text"
      placeholder={formatHint}
      title={`Date format: ${formatHint}`}
      value={draft}
      onChange={(event) => {
        const text = event.currentTarget.value
        const next = parseCalendarInput(text, withTime) ?? ""
        setEntry({ source: next, draft: text })
        validate(event.currentTarget, text)
        // Existing consumers receive the same ISO value as a native date input.
        event.currentTarget.value = next
        onChange?.(event)
        event.currentTarget.value = text
      }}
      onBlur={(event) => {
        validate(event.currentTarget, draft)
        const text = event.currentTarget.value
        event.currentTarget.value = canonical
        onBlur?.(event)
        event.currentTarget.value = text
      }}
    />
    <input type="hidden" name={name} form={form} value={canonical} disabled={props.disabled} />
  </>
}

export { CalendarInput }

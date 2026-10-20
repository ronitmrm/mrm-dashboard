"use client"

import * as React from "react"

import { calendarInputDisplay, parseCalendarInput } from "@workspace/ui/lib/calendar-date"
import { calendarInputTemplate, editCalendarInput, maskCalendarInput } from "@workspace/ui/lib/calendar-input"

/** Text entry has a fixed day/month/year presentation; submitted values stay ISO. */
function CalendarInput({
  type,
  value,
  defaultValue,
  onChange,
  onBlur,
  onFocus,
  onClick,
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
  const [entry, setEntry] = React.useState(() => {
    const text = calendarInputDisplay(initial, withTime)
    return { source: initial, draft: maskCalendarInput(text, calendarInputTemplate(withTime, text, step)) }
  })
  const source = value === undefined ? entry.source : String(value ?? "")
  const template = calendarInputTemplate(withTime, source === entry.source ? entry.draft : calendarInputDisplay(source, withTime), step)
  const display = (source: string) => maskCalendarInput(calendarInputDisplay(source, withTime), template)
  const inputRef = React.useRef<HTMLInputElement>(null)
  const selectionRef = React.useRef<number | null>(null)
  if (source !== entry.source) setEntry({ source, draft: display(source) })
  const draft = source === entry.source ? entry.draft : display(source)
  const canonical = parseCalendarInput(draft, withTime) ?? ""
  const formatHint = withTime ? "DD/MM/YYYY HH:mm" : "DD/MM/YYYY"

  const validate = React.useCallback((input: HTMLInputElement, text: string) => {
    if (!/\d/.test(text)) {
      input.setCustomValidity(props.required ? `Enter a date in ${formatHint} format.` : "")
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
  }, [formatHint, max, min, props.required, step, type, withTime])

  React.useLayoutEffect(() => {
    if (selectionRef.current === null) return
    inputRef.current?.setSelectionRange(selectionRef.current, selectionRef.current)
    selectionRef.current = null
  })

  React.useEffect(() => {
    if (inputRef.current) validate(inputRef.current, draft)
  }, [draft, validate])

  React.useEffect(() => {
    if (value !== undefined) return
    const parent = inputRef.current?.form
    const reset = () => {
      const source = String(defaultValue ?? "")
      const text = calendarInputDisplay(source, withTime)
      setEntry({ source, draft: maskCalendarInput(text, calendarInputTemplate(withTime, text, step)) })
    }
    parent?.addEventListener("reset", reset)
    return () => parent?.removeEventListener("reset", reset)
  }, [defaultValue, step, value, withTime])

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
      inputMode="numeric"
      placeholder={formatHint}
      title={`Date format: ${formatHint}`}
      value={draft}
      onFocus={(event) => {
        if (!/\d/.test(draft)) event.currentTarget.setSelectionRange(0, 0)
        onFocus?.(event)
      }}
      onClick={(event) => {
        if (!/\d/.test(draft)) event.currentTarget.setSelectionRange(0, 0)
        onClick?.(event)
      }}
      onChange={(event) => {
        const raw = event.currentTarget.value
        const editTemplate = parseCalendarInput(raw, withTime) ? calendarInputTemplate(withTime, raw, step) : template
        const edit = editCalendarInput(
          maskCalendarInput(draft, editTemplate), raw,
          event.currentTarget.selectionStart ?? 0, editTemplate,
          (event.nativeEvent as InputEvent).inputType === "deleteContentBackward"
        )
        const text = edit.text
        selectionRef.current = edit.caret
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

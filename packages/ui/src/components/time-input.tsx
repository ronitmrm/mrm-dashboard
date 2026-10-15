"use client"

import { useEffect, useRef, useState, type ComponentProps } from "react"

import { Input } from "@workspace/ui/components/input"
import { formatTimeInput } from "@workspace/ui/lib/time-input"
import { cn } from "@workspace/ui/lib/utils"

function TimeInput({
  value,
  defaultValue = "",
  onValueChange,
  name,
  id,
  required,
  disabled,
  readOnly,
  className,
  "aria-label": label = "Time",
  ...props
}: Omit<
  ComponentProps<typeof Input>,
  "type" | "onChange" | "value" | "defaultValue" | "ref"
> & {
  value?: string
  defaultValue?: string
  onValueChange?: (value: string) => void
}) {
  const [draft, setDraft] = useState(defaultValue)
  const hoursRef = useRef<HTMLInputElement>(null)
  const minutesRef = useRef<HTMLInputElement>(null)
  const current = value ?? draft
  const [hours = "", minutes = ""] = current.split(":")

  useEffect(() => {
    if (value !== undefined) return
    const form = hoursRef.current?.form
    const reset = () => setDraft(defaultValue)
    form?.addEventListener("reset", reset)
    return () => form?.removeEventListener("reset", reset)
  }, [defaultValue, value])

  function update(hour: string, minute: string) {
    const next = hour || minute ? `${hour}:${minute}` : ""
    if (value === undefined) setDraft(next)
    onValueChange?.(next)
  }

  return (
    <span
      className={cn(
        "inline-flex h-10 w-28 max-w-full min-w-0 items-center rounded-md border border-input bg-background focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/20",
        className
      )}
    >
      <Input
        {...props}
        ref={hoursRef}
        id={id}
        aria-label={`${label} hours`}
        className="h-full min-w-0 flex-1 rounded-none border-0 bg-transparent px-1 text-center focus-visible:ring-0"
        type="text"
        inputMode="numeric"
        maxLength={2}
        pattern="([01][0-9]|2[0-3])"
        placeholder="HH"
        title="Hours: 00–23"
        value={hours}
        required={required || Boolean(minutes)}
        disabled={disabled}
        readOnly={readOnly}
        onFocus={(event) => event.currentTarget.select()}
        onClick={(event) => event.currentTarget.select()}
        onChange={(event) => {
          const next = event.target.value.replace(/\D/g, "").slice(0, 2)
          update(next, minutes)
          if (next.length === 2) {
            minutesRef.current?.focus()
            minutesRef.current?.select()
          }
        }}
        onPaste={(event) => {
          const pasted = event.clipboardData.getData("text")
          if (pasted.replace(/\D/g, "").length !== 4) return
          event.preventDefault()
          const [hour = "", minute = ""] = formatTimeInput(pasted).split(":")
          update(hour, minute)
          minutesRef.current?.focus()
          minutesRef.current?.select()
        }}
      />
      <span aria-hidden="true">:</span>
      <Input
        {...props}
        ref={minutesRef}
        aria-label={`${label} minutes`}
        className="h-full min-w-0 flex-1 rounded-none border-0 bg-transparent px-1 text-center focus-visible:ring-0"
        type="text"
        inputMode="numeric"
        maxLength={2}
        pattern="[0-5][0-9]"
        placeholder="mm"
        title="Minutes: 00–59"
        value={minutes}
        required={required || Boolean(hours)}
        disabled={disabled}
        readOnly={readOnly}
        onFocus={(event) => event.currentTarget.select()}
        onClick={(event) => event.currentTarget.select()}
        onChange={(event) =>
          update(hours, event.target.value.replace(/\D/g, "").slice(0, 2))
        }
        onKeyDown={(event) => {
          if (event.key === "Backspace" && !minutes) {
            event.preventDefault()
            hoursRef.current?.focus()
            hoursRef.current?.select()
          }
        }}
      />
      <input type="hidden" name={name} value={current} disabled={disabled} />
    </span>
  )
}

export { TimeInput }

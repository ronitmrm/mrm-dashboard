"use client"

import type { ComponentProps } from "react"

import { Input } from "@workspace/ui/components/input"
import { formatTimeInput } from "@workspace/ui/lib/time-input"

function TimeInput({
  onChange,
  onKeyDown,
  title = "Use 24-hour time as HH:mm",
  ...props
}: Omit<ComponentProps<typeof Input>, "type">) {
  return (
    <Input
      {...props}
      type="text"
      inputMode="numeric"
      maxLength={5}
      pattern="([01][0-9]|2[0-3]):[0-5][0-9]"
      placeholder="HH:mm"
      title={title}
      onChange={(event) => {
        const input = event.currentTarget
        const position = input.selectionStart ?? input.value.length
        const digitsBeforeCursor = input.value
          .slice(0, position)
          .replace(/\D/g, "").length
        input.value = formatTimeInput(input.value)
        const cursor = Math.min(
          input.value.length,
          digitsBeforeCursor + (digitsBeforeCursor >= 2 ? 1 : 0)
        )
        input.setSelectionRange(cursor, cursor)
        onChange?.(event)
      }}
      onKeyDown={(event) => {
        onKeyDown?.(event)
        if (event.defaultPrevented) return
        const input = event.currentTarget
        if (
          input.selectionStart !== input.selectionEnd ||
          input.value[2] !== ":"
        )
          return
        // Delete the adjacent digit with the separator so it cannot trap the cursor.
        if (event.key === "Backspace" && input.selectionStart === 3)
          input.setSelectionRange(1, 3)
        if (event.key === "Delete" && input.selectionStart === 2)
          input.setSelectionRange(2, 4)
      }}
    />
  )
}

export { TimeInput }

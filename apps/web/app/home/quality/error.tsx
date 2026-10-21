"use client"
import { Button } from "@workspace/ui/components/button"
import { StandardState } from "@workspace/ui/components/standard-state"
export default function QualityReportError({ reset }: { reset: () => void }) {
  return (
    <StandardState
      variant="error"
      title="Quality report unavailable"
      description="Check the selected date range and try again."
      action={<Button onClick={reset}>Try again</Button>}
    />
  )
}

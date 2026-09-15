"use client"

import { StandardState } from "@workspace/ui/components/standard-state"
import { Button } from "@workspace/ui/components/button"

export default function RegistersError({ reset }: { reset: () => void }) {
  return (
    <StandardState
      variant="error"
      title="Register could not be loaded"
      description="Please try again."
      action={
        <Button variant="outline" onClick={reset}>
          Try Again
        </Button>
      }
    />
  )
}

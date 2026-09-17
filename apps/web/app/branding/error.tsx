"use client"
import { StandardState } from "@workspace/ui/components/standard-state"
import { Button } from "@workspace/ui/components/button"
export default function BrandingError({ reset }: { reset: () => void }) {
  return (
    <StandardState
      variant="error"
      title="Document Templates could not be loaded"
      description="Please try again. If this persists, contact your administrator."
      action={
        <Button variant="outline" onClick={reset}>
          Try Again
        </Button>
      }
    />
  )
}

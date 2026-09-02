"use client"

import { Button } from "@workspace/ui/components/button"
import {
 SectionCard,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"

export default function MasterSelectionError({ reset }: { reset: () => void }) {
  return (
 <SectionCard className="mx-auto max-w-xl">
      <CardHeader>
        <CardTitle>Master Selection could not be loaded</CardTitle>
        <CardDescription>
          The master relationships were not loaded, so no fallback selection was
          assumed.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Button onClick={reset} type="button">
          Retry
        </Button>
      </CardContent>
 </SectionCard>
  )
}

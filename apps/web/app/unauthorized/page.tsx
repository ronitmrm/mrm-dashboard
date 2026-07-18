import Link from "next/link"

import { Button } from "@workspace/ui/components/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"

export default function UnauthorizedPage() {
  return (
    <main className="grid min-h-svh place-items-center bg-muted/30 p-6">
      <Card className="w-full max-w-lg">
        <CardHeader>
          <CardTitle>Access not assigned</CardTitle>
          <CardDescription>
            Your account is valid, but it does not have the capability required
            for this area.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild variant="outline">
            <Link href="/">Return to operations</Link>
          </Button>
        </CardContent>
      </Card>
    </main>
  )
}

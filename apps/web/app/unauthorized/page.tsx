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
          <CardTitle>Access Not Assigned</CardTitle>
          <CardDescription>
            Your Account Is Valid, But It Does Not Have The Capability Required
            For This Area.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild variant="outline">
            <Link href="/">Return To Operations</Link>
          </Button>
        </CardContent>
      </Card>
    </main>
  )
}

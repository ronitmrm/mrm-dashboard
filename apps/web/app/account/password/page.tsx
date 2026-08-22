import { headers } from "next/headers"
import { KeyRound, ShieldCheck } from "lucide-react"

import { Badge } from "@workspace/ui/components/badge"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"

import { PasswordResetForm } from "@/components/password-reset-form"
import { getAuth } from "@/lib/auth/auth"
import { createPasswordResetService } from "@/lib/auth/password-reset"

export default async function PasswordPage() {
  const reset = createPasswordResetService({ auth: getAuth() })
  const context = await reset.getScreenContext(await headers())

  return (
    <div className="mx-auto grid w-full max-w-3xl gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="grid gap-1">
          <div className="flex items-center gap-2">
            <KeyRound className="size-5 text-primary" />
            <h2 className="text-2xl font-semibold tracking-tight">
              Password &amp; Security
            </h2>
          </div>
          <p className="text-sm text-muted-foreground">
            {context.isAdministrator
              ? "Reset any account password and sign that user out everywhere."
              : "Change your password after confirming your current password."}
          </p>
        </div>
        {context.isAdministrator ? (
          <Badge variant="outline">
            <ShieldCheck /> Administrator
          </Badge>
        ) : null}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>
            {context.isAdministrator
              ? "Reset Account Password"
              : "Change Password"}
          </CardTitle>
          <CardDescription>
            Use at least 6 characters. Passwords are never displayed or stored
            as plain text.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <PasswordResetForm
            currentUserId={context.currentUserId}
            isAdministrator={context.isAdministrator}
            users={context.users}
          />
        </CardContent>
      </Card>
    </div>
  )
}

import { headers } from "next/headers"
import { ShieldCheck } from "lucide-react"

import { Badge } from "@workspace/ui/components/badge"
import {
 SectionCard,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"

import { FullPageWorkspace } from "@/components/full-page-workspace"
import { PageHeader } from "@/components/ui/golden-patterns"
import { PasswordResetForm } from "@/components/password-reset-form"
import { getAuth } from "@/lib/auth/auth"
import { createPasswordResetService } from "@/lib/auth/password-reset"

export default async function PasswordPage() {
  const reset = createPasswordResetService({ auth: getAuth() })
  const context = await reset.getScreenContext(await headers())

  return (
    <FullPageWorkspace>
      <PageHeader
        title="Password & Security"
        badge={
          context.isAdministrator ? (
            <Badge variant="outline">
              <ShieldCheck /> Administrator
            </Badge>
          ) : null
        }
      />

 <SectionCard width="standard">
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
 </SectionCard>
    </FullPageWorkspace>
  )
}

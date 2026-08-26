import { redirect } from "next/navigation"

import { requireAuthenticatedSession } from "@/lib/auth/require-capability"
import { getUnifiedNavigationAccess } from "@/lib/auth/unified-navigation-access"

export const dynamic = "force-dynamic"

export default async function AdministrationPage() {
  const session = await requireAuthenticatedSession("/administration")
  const access = await getUnifiedNavigationAccess(session.user.id)

  if (access.artifacts) redirect("/administration/artifacts")
  if (access.administration) redirect("/administration/access")
  redirect("/unauthorized")
}

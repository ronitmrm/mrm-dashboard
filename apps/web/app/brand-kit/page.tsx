import { redirect } from "next/navigation"

import { requireAuthenticatedSession } from "@/lib/auth/require-capability"
import { getUnifiedNavigationAccess } from "@/lib/auth/unified-navigation-access"

export default async function BrandKitPage() {
  const session = await requireAuthenticatedSession("/brand-kit")
  const access = await getUnifiedNavigationAccess(session.user.id)
  redirect(access.brandKitHrefs?.[0] ?? "/unauthorized")
}

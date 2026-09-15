import { redirect } from "next/navigation"
import { requireAuthenticatedSession } from "@/lib/auth/require-capability"
import { getUnifiedNavigationAccess } from "@/lib/auth/unified-navigation-access"
import { publishedRegisterNavigation } from "@/lib/unified-navigation"

export default async function RegistersPage() {
  const session = await requireAuthenticatedSession("/registers")
  const access = await getUnifiedNavigationAccess(session.user.id)
  const first = publishedRegisterNavigation.find((item) =>
    access.brandingHrefs?.includes(`/branding/${item.type}`)
  )
  redirect(first?.href ?? "/home")
}

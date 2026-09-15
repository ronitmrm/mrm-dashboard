import { redirect } from "next/navigation"
import { requireAuthenticatedSession } from "@/lib/auth/require-capability"

export default async function RegistersPage() {
  await requireAuthenticatedSession("/registers")
  redirect("/registers/sop")
}

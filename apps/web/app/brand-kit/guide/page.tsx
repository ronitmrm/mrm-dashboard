import { readFile } from "node:fs/promises"
import path from "node:path"

import { PageHeader } from "@/components/ui/golden-patterns"
import { brandGuidePageAccess } from "@/lib/auth/brand-kit-capabilities"
import { requireCapability } from "@/lib/auth/require-capability"

export default async function BrandGuidePage() {
  await requireCapability(
    brandGuidePageAccess.readPermissionKey,
    brandGuidePageAccess.href
  )

  // Replace this file to publish a new guide version.
  const guide = await readFile(
    path.join(process.cwd(), "lib/brand-kit/brand-guide.html"),
    "utf8"
  )

  return (
    <div className="grid gap-6">
      <PageHeader
        description="How Mayank Raw Mint looks, sounds and behaves."
        title="Brand Guide"
      />
      <iframe
        className="h-[calc(100dvh-8rem)] min-h-[32rem] w-full rounded-lg border"
        sandbox="allow-scripts"
        srcDoc={guide}
        title="MRM Brand Guide"
      />
    </div>
  )
}

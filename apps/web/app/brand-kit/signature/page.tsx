import { createEmailSignatureRepository } from "@workspace/db"

import { SignatureGenerator } from "@/components/brand-kit/signature-generator"
import { PageHeader } from "@/components/ui/golden-patterns"
import { readAuthEnvironment } from "@/lib/auth/auth"
import { signaturePageAccess } from "@/lib/auth/brand-kit-capabilities"
import {
  listGrantedCapabilities,
  requireCapability,
} from "@/lib/auth/require-capability"
import { brand } from "@/lib/brand-kit/signature"

export default async function SignaturePage() {
  const session = await requireCapability(
    signaturePageAccess.readPermissionKey,
    signaturePageAccess.href
  )
  const repository = createEmailSignatureRepository({
    connectionString: readAuthEnvironment().connectionString,
  })
  const [saved, granted] = await Promise.all([
    repository.list().finally(() => repository.close()),
    listGrantedCapabilities(session.user.id, [
      signaturePageAccess.writePermissionKey,
    ]),
  ])

  return (
    <div className="grid gap-6">
      <PageHeader
        description="Make your company email signature, then copy it into your mail app."
        title="Signature"
      />
      <SignatureGenerator
        canSave={granted.length > 0}
        defaults={{
          name: session.user.name,
          designation: "",
          phone: "",
          email: session.user.email,
          linkedin: "",
          website: brand.website,
          company: brand.company,
          imageHost: process.env.NEXT_PUBLIC_APP_URL ?? "",
        }}
        saved={saved}
      />
    </div>
  )
}

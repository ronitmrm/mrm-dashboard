import { SignatureGenerator } from "@/components/brand-kit/signature-generator"
import { PageHeader } from "@/components/ui/golden-patterns"
import { signaturePageAccess } from "@/lib/auth/brand-kit-capabilities"
import { requireCapability } from "@/lib/auth/require-capability"
import { brand } from "@/lib/brand-kit/signature"

export default async function SignaturePage() {
  const session = await requireCapability(
    signaturePageAccess.readPermissionKey,
    signaturePageAccess.href
  )

  return (
    <div className="grid gap-6">
      <PageHeader
        description="Make your company email signature, then copy it into your mail app."
        title="Signature"
      />
      <SignatureGenerator
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
      />
    </div>
  )
}

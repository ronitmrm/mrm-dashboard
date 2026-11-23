"use server"

import { createEmailSignatureRepository } from "@workspace/db"
import { revalidatePath } from "next/cache"

import { readAuthEnvironment } from "@/lib/auth/auth"
import { signaturePageAccess } from "@/lib/auth/brand-kit-capabilities"
import { requireCapability } from "@/lib/auth/require-capability"
import type { SignatureDetails, MailApp } from "@/lib/brand-kit/signature"

async function withRepository<T>(
  operation: (
    repository: ReturnType<typeof createEmailSignatureRepository>,
    userId: string
  ) => Promise<T>
) {
  const session = await requireCapability(
    signaturePageAccess.writePermissionKey,
    signaturePageAccess.href
  )
  const repository = createEmailSignatureRepository({
    connectionString: readAuthEnvironment().connectionString,
  })
  try {
    return await operation(repository, session.user.id)
  } finally {
    await repository.close()
    revalidatePath(signaturePageAccess.href)
  }
}

export async function saveSignatureAction(input: {
  id?: string
  details: SignatureDetails
  mailApp: MailApp
}) {
  return withRepository((repository, userId) =>
    repository.save({
      id: input.id,
      fields: { ...input.details, mailApp: input.mailApp },
      userId,
    })
  )
}

export async function deleteSignatureAction(id: string) {
  await withRepository((repository) => repository.remove(id))
}

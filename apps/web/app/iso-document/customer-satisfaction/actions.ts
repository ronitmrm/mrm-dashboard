"use server"
import {
  createArtifactService,
  authorizeSatisfactionUpload,
} from "@workspace/db"
import { CustomerSatisfactionError } from "@workspace/db/customer-satisfaction-domain"
import { revalidatePath } from "next/cache"
import { unstable_rethrow } from "next/navigation"
import { withCustomerSatisfaction } from "@/lib/iso-document/customer-satisfaction-server"
import { createGoogleCloudArtifactProvider } from "@/lib/google-cloud-artifact-provider"
import { readAuthEnvironment } from "@/lib/auth/auth"
import {
  consumePendingArtifactUpload,
  pendingUploadAuthorizationForUser,
  pendingUploadId,
} from "@/lib/pending-artifact-upload-server"
function refresh() {
  revalidatePath("/iso-document/customer-satisfaction")
  revalidatePath("/iso-document/customer-satisfaction/[id]", "page")
}
function errorMessage(error: unknown) {
  unstable_rethrow(error)
  return error instanceof CustomerSatisfactionError
    ? error.message
    : "Report could not be saved. Check the details and try again."
}
export async function saveSatisfactionAction(data: FormData) {
  try {
    const id = await withCustomerSatisfaction(({ repository, access }) =>
      repository.save(access, {
        id: data.get("id")?.toString() || undefined,
        version: Number(data.get("version")),
        reason: data.get("reason")?.toString() ?? "",
        fields: Object.fromEntries(data.entries()),
      })
    )
    refresh()
    return { id }
  } catch (error) {
    return { error: errorMessage(error) }
  }
}
export async function decideSatisfactionAction(data: FormData) {
  try {
    const operation = data.get("operation")
    if (
      operation !== "submit" &&
      operation !== "approve" &&
      operation !== "return" &&
      operation !== "reopen"
    )
      throw new CustomerSatisfactionError("Choose a report action.")
    await withCustomerSatisfaction(({ repository, access }) =>
      repository.decide(access, {
        id: data.get("id")?.toString() ?? "",
        version: Number(data.get("version")),
        operation,
        notes: data.get("notes")?.toString() ?? "",
      })
    )
    refresh()
    return { success: true }
  } catch (error) {
    return { error: errorMessage(error) }
  }
}
export async function uploadSatisfactionAction(data: FormData) {
  try {
    return await withCustomerSatisfaction(async ({ access }) => {
      const id = data.get("id")?.toString() ?? ""
      const version = Number(data.get("version"))
      const uploadId = pendingUploadId(data, "report_file")
      if (!uploadId)
        throw new CustomerSatisfactionError("Choose a report file up to 10 MB.")
      const authorization = await pendingUploadAuthorizationForUser(
        access.userId
      )
      const target = {
        id,
        schema: "document_control",
        table: "customer_satisfaction_reports",
      }
      await consumePendingArtifactUpload({
        authorization,
        expectedIntent: { kind: "iso-customer-satisfaction", reportId: id },
        uploadId,
        recover: (binding) => {
          if (
            binding.target.id !== id ||
            binding.target.schema !== target.schema ||
            binding.target.table !== target.table ||
            binding.purpose !== "report"
          )
            throw new CustomerSatisfactionError(
              "Upload does not belong to this report."
            )
        },
        finalize: async (source) => {
          const artifacts = createArtifactService({
            connectionString: readAuthEnvironment().connectionString,
            provider: createGoogleCloudArtifactProvider(),
          })
          try {
            const file = await artifacts.store({
              actorUserId: access.userId,
              authorizeTarget: (client, { isRetry }) =>
                authorizeSatisfactionUpload(
                  client,
                  access,
                  id,
                  version,
                  isRetry
                ),
              bytes: source.bytes,
              fileName: source.fileName,
              mediaType: source.mediaType,
              organizationId: access.organizationId,
              origin: "uploaded",
              purpose: "report",
              target,
              pendingUploadId: source.pendingUploadId,
              idempotencyKey: `satisfaction-report:${id}:${uploadId}`,
            })
            return {
              binding: { artifactId: file.id, purpose: "report", target },
              value: undefined,
            }
          } finally {
            await artifacts.close()
          }
        },
      })
      refresh()
      return { success: true }
    })
  } catch (error) {
    unstable_rethrow(error)
    return {
      error:
        error instanceof CustomerSatisfactionError
          ? error.message
          : "Report upload failed. Retry the upload.",
    }
  }
}

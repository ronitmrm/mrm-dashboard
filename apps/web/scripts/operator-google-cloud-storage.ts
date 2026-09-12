import { execFile as execFileCallback } from "node:child_process"
import { promisify } from "node:util"

import { Storage } from "@google-cloud/storage"
import { OAuth2Client } from "google-auth-library"

const execFile = promisify(execFileCallback)

export async function createOperatorGoogleCloudStorage(projectIdInput: string) {
  const authClient = new OAuth2Client()
  authClient.refreshHandler = async () => {
    const { stdout } = await execFile(
      "gcloud",
      ["auth", "print-access-token", "--quiet"],
      { maxBuffer: 64 * 1024, timeout: 30_000 }
    )
    const accessToken = stdout.trim()
    if (!accessToken) throw new Error("gcloud returned an empty access token.")
    const { expiry_date: expiryDate } =
      await authClient.getTokenInfo(accessToken)
    return { access_token: accessToken, expiry_date: expiryDate }
  }
  const projectId = projectIdInput.trim()
  if (!projectId) throw new Error("GCS_PROJECT_ID is required.")
  return new Storage({ authClient, projectId })
}

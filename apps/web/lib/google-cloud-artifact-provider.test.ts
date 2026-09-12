import {
  access,
  mkdtemp,
  readFile,
  rm,
  stat,
  writeFile,
} from "node:fs/promises"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { parseEnv } from "node:util"

import { describe, expect, test, vi } from "vitest"

vi.mock("server-only", () => ({}))

import {
  createGoogleCloudArtifactProvider,
  googleCloudArtifactObjectKey,
  readGoogleCloudArtifactEnvironment,
} from "./google-cloud-artifact-provider"
import { refreshArtifactOidcEnvironment } from "../scripts/refresh-artifact-oidc"

const localEnvironment = {
  GCS_BUCKET_NAME: "mrm-artifacts-test",
  GCS_PROJECT_ID: "mrm-artifacts-test",
}

function googleFile(bytes = Buffer.from("drawing")) {
  return {
    createResumableUpload: vi.fn().mockResolvedValue(["https://session.test"]),
    delete: vi.fn().mockResolvedValue(undefined),
    download: vi.fn().mockResolvedValue([bytes]),
    getMetadata: vi.fn().mockResolvedValue([{ generation: "42" }]),
    save: vi.fn().mockResolvedValue(undefined),
  }
}

function storageWith(file: ReturnType<typeof googleFile>) {
  const fileFactory = vi.fn(() => file)
  return {
    fileFactory,
    storageClient: {
      bucket: vi.fn(() => ({ file: fileFactory })),
    },
  }
}

function developmentToken(expiresAt: Date) {
  const encode = (value: object) =>
    Buffer.from(JSON.stringify(value)).toString("base64url")
  return `${encode({ alg: "RS256", typ: "JWT" })}.${encode({
    aud: "https://vercel.com/mrm-general",
    environment: "development",
    exp: Math.floor(expiresAt.getTime() / 1000),
    iss: "https://oidc.vercel.com/mrm-general",
    owner: "mrm-general",
    project: "mrm-dashboard",
    sub: "owner:mrm-general:project:mrm-dashboard:environment:development",
  })}.test-signature`
}

describe("Google Cloud Artifact provider", () => {
  test("requires an operator client locally and validates Vercel workload identity", () => {
    expect(readGoogleCloudArtifactEnvironment(localEnvironment)).toMatchObject({
      bucketName: "mrm-artifacts-test",
      projectId: "mrm-artifacts-test",
      workloadIdentity: { kind: "operator-client-required" },
    })
    expect(() => createGoogleCloudArtifactProvider(localEnvironment)).toThrow(
      "pnpm artifact:auth:refresh"
    )
    expect(() =>
      readGoogleCloudArtifactEnvironment({
        GCS_BUCKET_NAME: "Invalid Bucket",
        GCS_PROJECT_ID: "mrm-artifacts-test",
      })
    ).toThrow("GCS_BUCKET_NAME must be a valid Google Cloud bucket name")
    expect(() =>
      readGoogleCloudArtifactEnvironment({ ...localEnvironment, VERCEL: "1" })
    ).toThrow("GCS_PROJECT_NUMBER is required")
    expect(
      readGoogleCloudArtifactEnvironment({
        ...localEnvironment,
        GCS_PROJECT_NUMBER: "123456789",
        GCS_SERVICE_ACCOUNT_EMAIL:
          "artifact-runtime@mrm-artifacts-test.iam.gserviceaccount.com",
        GCS_WORKLOAD_IDENTITY_POOL_ID: "mrm-artifact-pool",
        GCS_WORKLOAD_IDENTITY_PROVIDER_ID: "vercel-production",
        VERCEL: "1",
      })
    ).toMatchObject({
      workloadIdentity: {
        audience:
          "//iam.googleapis.com/projects/123456789/locations/global/workloadIdentityPools/mrm-artifact-pool/providers/vercel-production",
        kind: "vercel-oidc",
        vercelAudience:
          "https://iam.googleapis.com/projects/123456789/locations/global/workloadIdentityPools/mrm-artifact-pool/providers/vercel-production",
      },
    })
  })

  test("uses a local Development token through the existing custom-audience OIDC supplier", async () => {
    const target = googleFile()
    const { storageClient } = storageWith(target)
    const getOidcToken = vi.fn().mockResolvedValue("exchanged-subject-token")
    let getSubjectToken: (() => Promise<string>) | undefined
    const createExternalAccountClient = vi.fn((options: unknown) => {
      getSubjectToken = (
        options as {
          subject_token_supplier: { getSubjectToken(): Promise<string> }
        }
      ).subject_token_supplier.getSubjectToken
      return {} as never
    })
    const createStorageClient = vi.fn(() => storageClient)
    const environment = {
      ...localEnvironment,
      GCS_PROJECT_NUMBER: "123456789",
      GCS_SERVICE_ACCOUNT_EMAIL:
        "artifact-runtime@mrm-artifacts-test.iam.gserviceaccount.com",
      GCS_WORKLOAD_IDENTITY_POOL_ID: "mrm-artifact-pool",
      GCS_WORKLOAD_IDENTITY_PROVIDER_ID: "vercel-production",
      VERCEL_OIDC_TOKEN: "header.payload.signature",
    }

    expect(readGoogleCloudArtifactEnvironment(environment)).toMatchObject({
      workloadIdentity: { kind: "vercel-oidc" },
    })
    const provider = createGoogleCloudArtifactProvider(environment, {
      createExternalAccountClient: createExternalAccountClient as never,
      createStorageClient,
      getOidcToken,
    })

    await expect(provider.read({ key: "artifacts/local" })).resolves.toEqual(
      Buffer.from("drawing")
    )
    expect(createExternalAccountClient).toHaveBeenCalledOnce()
    expect(createStorageClient).toHaveBeenCalledOnce()
    await expect(getSubjectToken?.()).resolves.toBe("exchanged-subject-token")
    expect(getOidcToken).toHaveBeenCalledWith({
      audience:
        "https://iam.googleapis.com/projects/123456789/locations/global/workloadIdentityPools/mrm-artifact-pool/providers/vercel-production",
    })
  })

  test("refreshes only Artifact auth values and rejects an incomplete pull before writing", async () => {
    const appDirectory = await mkdtemp(join(tmpdir(), "mrm-oidc-test-"))
    const localPath = join(appDirectory, ".env.local")
    const now = new Date("2026-09-12T12:00:00.000Z")
    const expiresAt = new Date("2026-09-13T00:00:00.000Z")
    const token = developmentToken(expiresAt)
    const pulledContent = [
      'GCS_PROJECT_ID="project-b3e69f72-3e13-4f13-98b"',
      'GCS_BUCKET_NAME="mrm-erp-gcp-1"',
      'GCS_PROJECT_NUMBER="185282230283"',
      'GCS_WORKLOAD_IDENTITY_POOL_ID="mrm-vercel"',
      'GCS_WORKLOAD_IDENTITY_PROVIDER_ID="mrm-dashboard"',
      'GCS_SERVICE_ACCOUNT_EMAIL="mrm-artifacts@project-b3e69f72-3e13-4f13-98b.iam.gserviceaccount.com"',
      `VERCEL_OIDC_TOKEN="${token}"`,
      'VERCEL="1"',
      'WEB_DATABASE_URL="[SENSITIVE]"',
      "",
    ].join("\n")
    const output: string[] = []
    let pulledDirectory: string | undefined

    try {
      await writeFile(
        localPath,
        "# keep this comment\nCUSTOM_SETTING=preserved\nGCS_BUCKET_NAME=old-bucket\n",
        { mode: 0o600 }
      )
      await refreshArtifactOidcEnvironment({
        appDirectory,
        dependencies: {
          now: () => now,
          pullEnvironment: async (targetPath) => {
            pulledDirectory = dirname(targetPath)
            await writeFile(targetPath, pulledContent, { mode: 0o600 })
          },
          writeOutput: (message) => output.push(message),
        },
      })

      const updated = await readFile(localPath, "utf8")
      const parsed = parseEnv(updated)
      expect(updated).toContain("# keep this comment")
      expect(parsed.CUSTOM_SETTING).toBe("preserved")
      expect(parsed.GCS_BUCKET_NAME).toBe("mrm-erp-gcp-1")
      expect(parsed.VERCEL_OIDC_TOKEN).toBe(token)
      expect(parsed.VERCEL).toBeUndefined()
      expect(parsed.WEB_DATABASE_URL).toBeUndefined()
      expect(output.join("\n")).toContain(expiresAt.toISOString())
      expect(output.join("\n")).not.toContain(token)
      await expect(access(pulledDirectory!)).rejects.toMatchObject({
        code: "ENOENT",
      })
      if (process.platform !== "win32") {
        expect((await stat(localPath)).mode & 0o777).toBe(0o600)
      }

      await expect(
        refreshArtifactOidcEnvironment({
          appDirectory,
          dependencies: {
            now: () => now,
            pullEnvironment: (targetPath) =>
              writeFile(
                targetPath,
                pulledContent.replace(/^VERCEL_OIDC_TOKEN=.*\n/m, ""),
                { mode: 0o600 }
              ),
            writeOutput: (message) => output.push(message),
          },
        })
      ).rejects.toThrow("VERCEL_OIDC_TOKEN is missing")
      expect(await readFile(localPath, "utf8")).toBe(updated)
    } finally {
      await rm(appDirectory, { force: true, recursive: true })
    }
  })

  test("stores and verifies exact bytes under an opaque immutable key", async () => {
    const bytes = Buffer.from("drawing")
    const target = googleFile(bytes)
    const { storageClient } = storageWith(target)
    const provider = createGoogleCloudArtifactProvider(localEnvironment, {
      storageClient,
    })

    const uploaded = await provider.upload({
      bytes,
      customId: "organization-id:sha256:7",
      mediaType: "application/pdf",
      name: "customer-name.pdf",
    })

    expect(uploaded).toEqual({
      key: googleCloudArtifactObjectKey("organization-id:sha256:7"),
    })
    expect(uploaded.key).not.toContain("organization-id")
    expect(uploaded.key).not.toContain("customer-name")
    expect(target.save).toHaveBeenCalledWith(bytes, {
      gzip: false,
      metadata: { contentType: "application/pdf" },
      preconditionOpts: { ifGenerationMatch: 0 },
      resumable: false,
      validation: "crc32c",
    })
    expect(target.download).toHaveBeenCalledWith({
      decompress: false,
      validation: "crc32c",
    })
  })

  test("reuses matching immutable bytes and rejects a deterministic-key mismatch", async () => {
    const target = googleFile(Buffer.from("drawing"))
    target.save.mockRejectedValue({ code: 412 })
    const { storageClient } = storageWith(target)
    const provider = createGoogleCloudArtifactProvider(localEnvironment, {
      storageClient,
    })
    const upload = {
      bytes: Buffer.from("drawing"),
      customId: "organization-id:sha256:7",
      mediaType: "application/pdf",
      name: "drawing.pdf",
    }

    await expect(provider.upload(upload)).resolves.toEqual({
      key: googleCloudArtifactObjectKey(upload.customId),
    })
    target.download.mockResolvedValueOnce([Buffer.from("different")])
    await expect(provider.upload(upload)).rejects.toThrow(
      "Google Cloud Storage found different bytes at the retained file key."
    )
  })

  test("reads exact bytes and deletes only the observed generation", async () => {
    const bytes = Buffer.from([0, 255, 1, 2])
    const target = googleFile(bytes)
    const { fileFactory, storageClient } = storageWith(target)
    const provider = createGoogleCloudArtifactProvider(localEnvironment, {
      storageClient,
    })

    await expect(provider.read({ key: "artifacts/key" })).resolves.toEqual(
      bytes
    )
    await expect(
      provider.delete({ key: "artifacts/key" })
    ).resolves.toBeUndefined()
    expect(fileFactory).toHaveBeenLastCalledWith("artifacts/key", {
      generation: "42",
    })
    expect(target.delete).toHaveBeenCalledWith({ ignoreNotFound: true })
  })

  test("treats an absent delete as success and translates SDK failures", async () => {
    const target = googleFile()
    target.getMetadata.mockRejectedValueOnce({ code: 404 })
    const { storageClient } = storageWith(target)
    const provider = createGoogleCloudArtifactProvider(localEnvironment, {
      storageClient,
    })

    await expect(
      provider.delete({ key: "artifacts/missing" })
    ).resolves.toBeUndefined()
    expect(target.delete).not.toHaveBeenCalled()

    target.download.mockRejectedValueOnce({ code: 404 })
    await expect(
      provider.read({ key: "artifacts/missing" })
    ).rejects.toMatchObject({ code: "not-found" })

    target.download.mockRejectedValueOnce(new Error("bucket/key unavailable"))
    await expect(
      provider.read({ key: "artifacts/private-key" })
    ).rejects.toMatchObject({
      code: "provider-failure",
      message: "Google Cloud Storage could not read the retained file.",
    })
  })

  test("inspects resumable 308 manually and treats cancelled 499 as terminal", async () => {
    const { storageClient } = storageWith(googleFile())
    const fetchImplementation = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(null, {
          headers: { Range: "bytes=0-262143" },
          status: 308,
        })
      )
      .mockResolvedValueOnce(new Response(null, { status: 499 }))
    const provider = createGoogleCloudArtifactProvider(localEnvironment, {
      fetchImplementation,
      storageClient,
    })

    await expect(
      provider.getResumableStatus({
        expectedByteSize: 1024 * 1024,
        session: "https://session.test" as never,
      })
    ).resolves.toEqual({ complete: false, nextOffset: 262144 })
    expect(fetchImplementation).toHaveBeenNthCalledWith(
      1,
      "https://session.test",
      expect.objectContaining({ method: "PUT", redirect: "manual" })
    )
    await expect(
      provider.getResumableStatus({
        expectedByteSize: 1024 * 1024,
        session: "https://session.test" as never,
      })
    ).rejects.toMatchObject({ code: "not-found" })
  })

  test("streams 25 MiB through one session in sequential chunks up to 4 MiB", async () => {
    const { storageClient } = storageWith(googleFile())
    const total = 25 * 1024 * 1024
    const chunkSize = 4 * 1024 * 1024
    const fetchImplementation = vi.fn(async (_session, init) => {
      const range = new Headers(init?.headers).get("Content-Range")!
      const match = /^bytes (\d+)-(\d+)\/(\d+)$/.exec(range)
      if (!match) return new Response(null, { status: 308 })
      const end = Number(match[2])
      return end + 1 === total
        ? new Response(null, { status: 200 })
        : new Response(null, {
            headers: { Range: `bytes=0-${end}` },
            status: 308,
          })
    })
    const provider = createGoogleCloudArtifactProvider(localEnvironment, {
      fetchImplementation,
      storageClient,
    })
    const session = "https://session.test" as never
    let offset = 0
    while (offset < total) {
      const bytes = Buffer.alloc(Math.min(chunkSize, total - offset), 7)
      const progress = await provider.uploadResumableChunk({
        bytes,
        expectedByteSize: total,
        offset,
        session,
      })
      expect(progress.nextOffset).toBe(offset + bytes.byteLength)
      offset = progress.nextOffset
    }

    expect(fetchImplementation).toHaveBeenCalledTimes(7)
    for (const [, init] of fetchImplementation.mock.calls) {
      expect((init?.body as Uint8Array).byteLength).toBeLessThanOrEqual(
        chunkSize
      )
      expect(init).toMatchObject({ method: "PUT", redirect: "manual" })
    }
  })
})

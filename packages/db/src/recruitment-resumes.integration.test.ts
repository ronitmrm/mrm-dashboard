import { randomUUID } from "node:crypto"

import { Pool } from "pg"
import { afterAll, beforeAll, describe, expect, test } from "vitest"

import {
  createArtifactService,
  type ArtifactStorageProvider,
} from "./artifacts"
import { migrateDatabase } from "./migrate"
import {
  authorizeRecruitmentCandidateArtifactTarget,
  createRecruitmentRepository,
} from "./recruitment"

const connectionString =
  process.env.TEST_DATABASE_URL ??
  "postgresql://mrmpl:mrmpl@127.0.0.1:5434/mrmpl_test"

const pool = new Pool({ connectionString })
const repository = createRecruitmentRepository({ connectionString })

class CandidateResumeArtifactProvider implements ArtifactStorageProvider {
  readonly uploads: Array<{ bytes: Buffer; name: string }> = []

  async delete() {}

  async upload(input: Parameters<ArtifactStorageProvider["upload"]>[0]) {
    this.uploads.push({ bytes: input.bytes, name: input.name })
    const key = `candidate-resume-${randomUUID()}`
    return { key, url: `https://files.example.test/${key}` }
  }
}

async function createOrganization(name: string) {
  const suffix = randomUUID()
  const organization = await pool.query<{ id: string }>(
    `
      INSERT INTO core.organizations (code, name)
      VALUES ($1, $2)
      RETURNING id
    `,
    [`REC-RESUME-${suffix}`, name]
  )
  return organization.rows[0]!.id
}

async function createCandidate(organizationId: string, name: string) {
  return repository.upsertCandidate({
    name,
    organizationId,
    phone: `PHONE-${randomUUID()}`,
  })
}

beforeAll(async () => {
  await migrateDatabase({ connectionString })
})

afterAll(async () => {
  await repository.close()
  await pool.end()
})

describe("Candidate resume Artifacts", () => {
  test("retains replacement history and deduplicates exact bytes without merging Candidate links or filenames", async () => {
    const organizationId = await createOrganization("Resume Artifact Test")
    const firstCandidate = await createCandidate(
      organizationId,
      "First Candidate"
    )
    const secondCandidate = await createCandidate(
      organizationId,
      "Second Candidate"
    )
    const provider = new CandidateResumeArtifactProvider()
    const artifacts = createArtifactService({ connectionString, provider })
    const firstBytes = Buffer.from("%PDF-1.7\nshared candidate resume")
    const replacementBytes = Buffer.from(
      "%PDF-1.7\nreplacement candidate resume"
    )

    const store = (input: {
      bytes: Buffer
      candidateId: string
      fileName: string
      idempotencyKey: string
    }) =>
      artifacts.store({
        actorUserId: null,
        authorizeTarget: (client) =>
          authorizeRecruitmentCandidateArtifactTarget(client, {
            candidateId: input.candidateId,
            organizationId,
          }),
        bytes: input.bytes,
        fileName: input.fileName,
        idempotencyKey: input.idempotencyKey,
        mediaType: "application/pdf",
        organizationId,
        origin: "uploaded",
        purpose: "resume",
        target: {
          id: input.candidateId,
          schema: "recruitment",
          table: "candidates",
        },
      })

    try {
      const first = await store({
        bytes: firstBytes,
        candidateId: firstCandidate.id,
        fileName: "first-name.pdf",
        idempotencyKey: `resume:${firstCandidate.id}:first`,
      })
      const duplicate = await store({
        bytes: firstBytes,
        candidateId: secondCandidate.id,
        fileName: "second-name.pdf",
        idempotencyKey: `resume:${secondCandidate.id}:first`,
      })
      const replacement = await store({
        bytes: replacementBytes,
        candidateId: firstCandidate.id,
        fileName: "replacement.pdf",
        idempotencyKey: `resume:${firstCandidate.id}:replacement`,
      })

      expect(first.id).not.toBe(duplicate.id)
      expect(first.providerKey).toBe(duplicate.providerKey)
      expect(provider.uploads).toHaveLength(2)
      expect(provider.uploads.map((upload) => upload.name)).toEqual([
        "first-name.pdf",
        "replacement.pdf",
      ])
      await expect(
        artifacts.listHistory({
          organizationId,
          purpose: "resume",
          target: {
            id: firstCandidate.id,
            schema: "recruitment",
            table: "candidates",
          },
        })
      ).resolves.toMatchObject([
        {
          fileName: "replacement.pdf",
          isCurrent: true,
          lifecycleState: "current",
          version: 2,
        },
        {
          fileName: "first-name.pdf",
          isCurrent: false,
          lifecycleState: "superseded",
          version: 1,
        },
      ])
      await expect(
        repository.getCandidateResume(organizationId, firstCandidate.id)
      ).resolves.toMatchObject({
        fileName: "replacement.pdf",
        mediaType: "application/pdf",
        publicUrl: replacement.publicUrl,
        storageKey: replacement.providerKey,
      })
    } finally {
      await artifacts.close()
    }
  })

  test("enforces Organization access before upload and keeps legacy local resumes readable", async () => {
    const organizationId = await createOrganization("Resume Access Test")
    const otherOrganizationId = await createOrganization("Other Resume Org")
    const candidate = await createCandidate(organizationId, "Scoped Candidate")
    const provider = new CandidateResumeArtifactProvider()
    const artifacts = createArtifactService({ connectionString, provider })

    try {
      await expect(
        artifacts.store({
          actorUserId: null,
          authorizeTarget: (client) =>
            authorizeRecruitmentCandidateArtifactTarget(client, {
              candidateId: candidate.id,
              organizationId: otherOrganizationId,
            }),
          bytes: Buffer.from("%PDF-1.7\nnot authorized"),
          fileName: "forbidden.pdf",
          idempotencyKey: `resume:${candidate.id}:forbidden`,
          mediaType: "application/pdf",
          organizationId: otherOrganizationId,
          origin: "uploaded",
          purpose: "resume",
          target: {
            id: candidate.id,
            schema: "recruitment",
            table: "candidates",
          },
        })
      ).rejects.toThrow("Candidate was not found")
      expect(provider.uploads).toHaveLength(0)

      const sourceId = randomUUID()
      const storageKey = `attachments/candidate-resumes/${candidate.id}/${sourceId}/legacy.pdf`
      await repository.recordCandidateResume({
        byteSize: 17,
        candidateId: candidate.id,
        fileName: "legacy.pdf",
        mediaType: "application/pdf",
        organizationId,
        sha256: "legacy-resume-sha",
        sourceId,
        storageKey,
      })
      await expect(
        repository.getCandidateResume(organizationId, candidate.id)
      ).resolves.toEqual({
        byteSize: 17,
        fileName: "legacy.pdf",
        mediaType: "application/pdf",
        publicUrl: null,
        sha256: "legacy-resume-sha",
        storageKey,
      })
    } finally {
      await artifacts.close()
    }
  })
})

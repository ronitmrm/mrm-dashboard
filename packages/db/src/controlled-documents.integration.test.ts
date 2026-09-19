import { randomUUID } from "node:crypto"
import { Pool } from "pg"
import { afterAll, beforeAll, expect, test, vi } from "vitest"
import { migrateDatabase } from "./migrate"
import { createBrandingRepository } from "./branding"
import { parseBrandingContent } from "./branding-domain"

const connectionString =
  process.env.TEST_DATABASE_URL ??
  "postgresql://mrmpl:mrmpl@127.0.0.1:5434/mrmpl_test"
const pool = new Pool({ connectionString })
const repository = createBrandingRepository({ pool })
let organizationId: string
let userId: string
beforeAll(async () => {
  await migrateDatabase({ connectionString })
  organizationId = (
    await pool.query<{ id: string }>(
      "INSERT INTO core.organizations(code,name) VALUES ($1,'Document test') RETURNING id",
      [`DOC-${randomUUID()}`]
    )
  ).rows[0]!.id
  userId = (
    await pool.query<{ id: string }>(
      "INSERT INTO identity.users(name,email) VALUES ('Document author',$1) RETURNING id",
      [`${randomUUID()}@example.test`]
    )
  ).rows[0]!.id
})
afterAll(async () => {
  await pool.end()
})

test("a generated PDF failure rolls back the draft and first-issue number", async () => {
  const context = {
    organizationId,
    userId,
    userName: "Author",
    type: "notice" as const,
  }
  const content = parseBrandingContent(
    {
      title: "Safety notice",
      department: "Quality",
      effectiveDate: "2026-09-19",
      inputs: {},
      languages: ["en"],
      translations: [
        {
          language: "en",
          title: "Safety notice",
          sections: [{ heading: "", body: "Check the machine guards." }],
        },
      ],
    },
    context.type
  )
  const documentId = await repository.save({ ...context, content })
  const before = (await repository.get(
    organizationId,
    context.type,
    documentId
  ))!
  const draft = before.revisions[0]!
  const render = vi.fn().mockRejectedValue(new Error("PDF generation failed"))
  await expect(
    repository.issue(
      {
        ...context,
        documentId,
        revisionId: draft.id,
        version: draft.version,
      },
      render
    )
  ).rejects.toThrow("PDF generation failed")
  expect(render).toHaveBeenCalledOnce()
  expect(
    await repository.get(organizationId, context.type, documentId)
  ).toEqual(before)
  expect(
    await repository.pdf(organizationId, context.type, documentId, draft.id)
  ).toBeNull()
  expect(
    (
      await pool.query(
        "SELECT value FROM branding.counters WHERE organization_id = $1 AND type = $2",
        [organizationId, context.type]
      )
    ).rows
  ).toEqual([])
})

test("uploads, releases and revises without replacing the current PDF until release", async () => {
  const context = {
    organizationId,
    userId,
    userName: "Author",
    type: "controlled-document" as const,
  }
  const content = parseBrandingContent(
    {
      title: "Quality Plan",
      department: "Quality",
      effectiveDate: "2026-09-18",
      inputs: { "Document number": "QP/001" },
    },
    context.type
  )
  const original = Buffer.from("%PDF-1.7 original")
  const replacement = Buffer.from("%PDF-1.7 replacement")
  const render = vi.fn()
  const documentId = await repository.save({
    ...context,
    content,
    uploadedPdf: original,
  })
  expect(await repository.listPublished(organizationId, context.type)).toEqual(
    []
  )
  let draft = (await repository.get(organizationId, context.type, documentId))!
    .revisions[0]!
  await repository.issue(
    { ...context, documentId, revisionId: draft.id, version: draft.version },
    render
  )
  const originalId = draft.id
  await repository.revise({ ...context, documentId })
  await repository.revise({ ...context, documentId })
  draft = (await repository.get(organizationId, context.type, documentId))!
    .revisions[0]!
  expect(draft).toMatchObject({ revision: 1, state: "draft", hasUpload: false })
  await expect(
    repository.issue(
      { ...context, documentId, revisionId: draft.id, version: draft.version },
      render
    )
  ).rejects.toThrow("reason")
  await repository.save({
    ...context,
    documentId,
    version: draft.version,
    content: { ...content, changeReason: "Inspection limits revised" },
    uploadedPdf: replacement,
  })
  expect(
    (await repository.publishedPdf(organizationId, context.type, documentId))
      ?.pdf
  ).toEqual(original)
  await expect(
    repository.issue(
      { ...context, documentId, revisionId: draft.id, version: draft.version },
      render
    )
  ).rejects.toThrow("changed")
  draft = (await repository.get(organizationId, context.type, documentId))!
    .revisions[0]!
  await repository.issue(
    { ...context, documentId, revisionId: draft.id, version: draft.version },
    render
  )
  expect(
    await repository.listPublished(organizationId, context.type)
  ).toMatchObject([{ number: "QP/001", revision: 1 }])
  expect(
    (await repository.publishedPdf(organizationId, context.type, documentId))
      ?.pdf
  ).toEqual(replacement)
  expect(
    (await repository.pdf(organizationId, context.type, documentId, originalId))
      ?.pdf
  ).toEqual(original)
  expect(render).not.toHaveBeenCalled()
  await expect(
    pool.query("UPDATE branding.revisions SET content = '{}' WHERE id = $1", [
      originalId,
    ])
  ).rejects.toThrow("immutable")
})

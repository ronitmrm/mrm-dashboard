import { randomUUID } from "node:crypto"
import { Pool } from "pg"
import { afterAll, beforeAll, expect, test } from "vitest"
import { migrateDatabase } from "./migrate"
import { createCommercialWorkflowRepository } from "./commercial-workflow"
import { captureQuotation, ensureQuotationDraft } from "./quotation-versions"

const connectionString =
  process.env.TEST_DATABASE_URL ??
  "postgresql://mrmpl:mrmpl@127.0.0.1:5434/mrmpl_test"
const pool = new Pool({ connectionString, max: 2 })
const repository = createCommercialWorkflowRepository({ pool })
beforeAll(async () => {
  await migrateDatabase({ connectionString })
})
afterAll(async () => {
  await pool.end()
})

test("saved customer selections survive reload, reject unrelated files, and stay pinned on issued quotations", async () => {
  const code = `DRAW-${randomUUID()}`
  const organizationId = (
    await pool.query<{ id: string }>(
      "INSERT INTO core.organizations(code,name) VALUES($1,$1) RETURNING id",
      [code]
    )
  ).rows[0]!.id
  const actorId = (
    await pool.query<{ id: string }>(
      "INSERT INTO identity.users(name,email) VALUES('Drawing salesperson',$1) RETURNING id",
      [`${code}@example.test`]
    )
  ).rows[0]!.id
  const customerId = (
    await pool.query<{ id: string }>(
      `INSERT INTO sales.customers(organization_id,customer_uid,company_name,source_system,source_table,source_id)
    VALUES($1,$2,'Drawing customer','test','customers',$2) RETURNING id`,
      [organizationId, code]
    )
  ).rows[0]!.id
  const enquiryId = (
    await pool.query<{ id: string }>(
      `INSERT INTO sales.enquiries(organization_id,customer_id,enquiry_number,received_on,currency,created_by_user_id,source_system,source_table,source_id)
    VALUES($1,$2,$3,current_date,'USD',$4,'test','enquiries',$3) RETURNING id`,
      [organizationId, customerId, code, actorId]
    )
  ).rows[0]!.id
  const itemId = (
    await pool.query<{ id: string }>(
      `INSERT INTO sales.enquiry_items(organization_id,enquiry_id,line_number,description,quantity,technical_review_status,source_system,source_table,source_id)
    VALUES($1,$2,1,'Test drawing part',100,'Feasible','test','enquiry_items',$3) RETURNING id`,
      [organizationId, enquiryId, code]
    )
  ).rows[0]!.id
  await repository.startDesignWork({
    enquiryItemId: itemId,
    actorUserId: actorId,
  })
  const task = (await repository.getDesignTask(code, itemId))!
  const fileId = (
    await pool.query<{ id: string }>(
      `INSERT INTO core.files(organization_id,file_name,media_type,storage_key,byte_size,source_system,source_table,source_id)
    VALUES($1,'customer.pdf','application/pdf','test/customer.pdf',10,'test','files',$2) RETURNING id`,
      [organizationId, code]
    )
  ).rows[0]!.id
  await pool.query(
    `INSERT INTO core.file_links(organization_id,file_id,target_schema,target_table,target_id,purpose)
    VALUES($1,$2,'sales','design_tasks',$3,'internal_drawing')`,
    [organizationId, fileId, task.designId]
  )
  const save = {
    enquiryItemId: itemId,
    actorUserId: actorId,
    designStatus: "Pending Design",
    itemType: "List",
    quotedPartUid: null,
    portfolioMatchStatus: "New Quoted Part",
  }
  await repository.saveDesign({ ...save, customerDrawingFileIds: [fileId] })
  expect((await repository.getDesignTask(code, itemId))!.attachments).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ id: fileId, customerSelected: true }),
    ])
  )
  await expect(
    repository.saveDesign({ ...save, customerDrawingFileIds: [randomUUID()] })
  ).rejects.toThrow("Select available drawings")
  expect(
    (
      await repository.getQuotationDrawings(enquiryId, actorId, { draft: true })
    ).map((file) => file.fileId)
  ).toEqual([fileId])
  await expect(
    repository.getQuotationDrawings(enquiryId, randomUUID())
  ).rejects.toThrow("Enquiry was not found")

  const client = await pool.connect()
  try {
    await client.query("BEGIN")
    const version = await ensureQuotationDraft(client, enquiryId)
    await captureQuotation(client, version.id, null)
    await client.query("COMMIT")
  } catch (error) {
    await client.query("ROLLBACK")
    throw error
  } finally {
    client.release()
  }
  await repository.saveDesign({ ...save, customerDrawingFileIds: [] })
  expect(
    await repository.getQuotationDrawings(enquiryId, actorId, { draft: true })
  ).toEqual([])
  expect(
    (
      await repository.getQuotationDrawings(enquiryId, actorId, { revision: 0 })
    ).map((file) => file.fileId)
  ).toEqual([fileId])
})

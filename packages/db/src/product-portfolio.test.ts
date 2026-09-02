import type { Pool } from "pg"
import { describe, expect, it, vi } from "vitest"

import { createProductPortfolioRepository } from "./product-portfolio"

const orderedProduct = {
  category: "Hydraulics",
  item_type: "List",
  mrmpl_description: "Ordered hose fitting",
  product_type: "Barstock",
  product_size: "1/4 inch",
  rod_size: "12.7 Hex",
  sub_category: "Hose Barb",
  uid: "M100",
  design_revision: "00",
}

const quotedProduct = {
  category: "Hydraulics",
  item_type: "List",
  mrmpl_description: "Customer quoted fitting",
  product_type: "Forging",
  product_size: "3/8 inch",
  rod_size: "16 Round",
  sub_category: "Hose Barb",
  uid: "Q200",
  design_revision: null,
}

describe("Product Portfolio repository", () => {
  it("returns each Product UID once with separate Product and Rod sizes", async () => {
    const query = vi.fn(
      async (_statement: string, values: readonly unknown[]) => ({
        rows:
          values[1] === "CUST-001"
            ? [orderedProduct, { ...orderedProduct }, quotedProduct]
            : [orderedProduct],
      })
    )
    const repository = createProductPortfolioRepository({
      pool: { query } as unknown as Pool,
    })

    await expect(
      repository.listForOrganization("MRMPL", {
        customerUid: " CUST-001 ",
      })
    ).resolves.toEqual([
      {
        category: "Hydraulics",
        itemType: "List",
        mrmplDescription: "Ordered hose fitting",
        productType: "Barstock",
        productSize: "1/4 inch",
        rodSize: "12.7 Hex",
        subCategory: "Hose Barb",
        uid: "M100",
        designRevision: "00",
      },
      {
        category: "Hydraulics",
        itemType: "List",
        mrmplDescription: "Customer quoted fitting",
        productType: "Forging",
        productSize: "3/8 inch",
        rodSize: "16 Round",
        subCategory: "Hose Barb",
        uid: "Q200",
        designRevision: null,
      },
    ])
    await expect(repository.listForOrganization("MRMPL")).resolves.toEqual([
      expect.objectContaining({ uid: "M100" }),
    ])
  })

  it("returns the released Product dossier with BOM, pricing, drawing, and ECN evidence", async () => {
    const query = vi.fn(async (statement: string) => {
      if (statement.includes("WITH RECURSIVE hierarchy")) {
        return {
          rows: [
            {
              depth: 1,
              parent_uid: "M100",
              component_uid: "M101",
              description: "Nut",
              quantity: "2",
            },
          ],
        }
      }
      return {
        rows: [
          {
            uid: "M100",
            description: "Assembly",
            item_type: "List",
            production_type: "Barstock",
            source_payload: { processesRequired: ["Machining", "Washing"] },
            design_revision: "01",
            design_status: "Released",
            design_released_at: new Date("2026-09-01T00:00:00Z"),
            product_cost_inr: "42.5",
            machining_cost: "10",
            washing: "2",
            checking: "0",
            marking: "0",
            plating: "0",
            annealing: "0",
            deburring: "0",
            buffing: "0",
            sealant: "0",
            assembly_operation_cost: "0",
            drawing_revision: "01",
            drawing_number: "M100",
            drawing_status: "Released",
            drawing_requirement: "Required",
            drawing_file_id: "file-1",
            drawing_file_name: "M100.pdf",
            drawing_media_type: "application/pdf",
            latest_ecn_number: "ECN-9",
            latest_ecn_status: "Completed",
            latest_ecn_reason: "Thread update",
          },
        ],
      }
    })
    const repository = createProductPortfolioRepository({
      pool: { query } as unknown as Pool,
    })

    await expect(
      repository.getDossierForOrganization("MRMPL", "M100")
    ).resolves.toEqual(
      expect.objectContaining({
        uid: "M100",
        processesRequired: ["Machining", "Washing"],
        design: expect.objectContaining({ revision: "01" }),
        drawing: expect.objectContaining({ fileName: "M100.pdf" }),
        latestEcn: expect.objectContaining({ number: "ECN-9" }),
        bom: [expect.objectContaining({ componentUid: "M101", depth: 1 })],
      })
    )
  })

  it("lists immutable drawing revisions with their approval evidence", async () => {
    const query = vi.fn(async () => ({
      rows: [
        {
          approved_at: new Date("2026-09-01T00:00:00Z"),
          approved_by: "Design HOD",
          change_reason: "Initial release",
          created_at: new Date("2026-08-31T00:00:00Z"),
          drawing_id: "drawing-1",
          drawing_number: "M100",
          effective_on: "2026-09-01",
          ecn_number: null,
          file_id: "file-1",
          file_name: "M100.pdf",
          is_current: true,
          item_description: "Assembly",
          item_id: "item-1",
          media_type: "application/pdf",
          raised_by: "Designer",
          requirement_status: "Required",
          revision_label: "00",
          status: "Released",
          uid: "M100",
          uploaded_by: "Designer",
        },
      ],
    }))
    const repository = createProductPortfolioRepository({
      pool: { query } as unknown as Pool,
    })

    await expect(
      repository.listDrawingRevisionsForOrganization("MRMPL", { uid: "M100" })
    ).resolves.toEqual([
      expect.objectContaining({
        approvedBy: "Design HOD",
        current: true,
        revision: "00",
        uid: "M100",
      }),
    ])
  })
})

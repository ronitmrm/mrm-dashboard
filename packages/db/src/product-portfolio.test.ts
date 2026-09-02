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

  it("returns a design-only Product BOM summary with detailed hierarchy and revision history", async () => {
    const query = vi.fn(async (statement: string) => {
      if (
        statement.includes("FROM catalog.product_design_revisions revision")
      ) {
        return {
          rows: [
            {
              approved_at: new Date("2026-09-01T00:00:00Z"),
              approved_by: "Design HOD",
              change_reason: "Thread update",
              ecn_id: "ecn-9",
              ecn_number: "ECN-9",
              effective_on: "2026-09-01",
              is_current: true,
              released_at: new Date("2026-09-01T00:00:00Z"),
              revision_label: "01",
              status: "Released",
            },
            {
              approved_at: new Date("2026-08-01T00:00:00Z"),
              approved_by: "Design HOD",
              change_reason: "Initial Release",
              ecn_id: null,
              ecn_number: null,
              effective_on: "2026-08-01",
              is_current: false,
              released_at: new Date("2026-08-01T00:00:00Z"),
              revision_label: "00",
              status: "Superseded",
            },
          ],
        }
      }
      if (statement.includes("WITH RECURSIVE hierarchy")) {
        return {
          rows: [
            {
              blank_piece_weight: "18.5",
              category: "Hardware",
              depth: 1,
              parent_uid: "M100",
              component_uid: "M101",
              description: "Nut",
              item_type: "List",
              process_required: ["Machining"],
              product_size: "M8",
              product_type: "Barstock",
              production_type: "CNC",
              quantity: "2",
              rod_size: "12 Hex",
              rod_type: "Solid",
              subcategory: "Nut",
              total_quantity: "2",
              weight: "10",
            },
          ],
        }
      }
      return {
        rows: [
          {
            uid: "M100",
            description: "Assembly",
            item_type: "Package",
            production_type: "Barstock",
            production_process: "CNC",
            weight_100_pcs: "20",
            casting: "22",
            rod_size: "16 Round",
            rod_type: "Solid",
            die_code: "D-100",
            category: "Hydraulics",
            subcategory: "Assembly",
            product_size: "1/4 inch",
            source_payload: { processesRequired: ["Machining", "Washing"] },
            design_revision: "01",
            design_status: "Released",
            design_released_at: new Date("2026-09-01T00:00:00Z"),
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

    const dossier = await repository.getDossierForOrganization("MRMPL", "M100")
    expect(dossier).toEqual(
      expect.objectContaining({
        blankPieceWeight: 22,
        category: "Hydraulics",
        dieCode: "D-100",
        itemType: "Package",
        productSize: "1/4 inch",
        productType: "Barstock",
        productionType: "CNC",
        productWeight: 20,
        processesRequired: ["Machining", "Washing"],
        revisionHistory: [
          expect.objectContaining({ current: true, revision: "01" }),
          expect.objectContaining({ current: false, revision: "00" }),
        ],
        rodSize: "16 Round",
        rodType: "Solid",
        uid: "M100",
        bom: [
          expect.objectContaining({
            componentUid: "M101",
            depth: 1,
            productType: "Barstock",
            productionType: "CNC",
            totalQuantity: 2,
          }),
        ],
      })
    )
    expect(dossier).not.toHaveProperty("pricing")
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

  it("reads an old BOM summary only from its immutable revision snapshot", async () => {
    let issuedStatement = ""
    const query = vi.fn(async (statement: string) => {
      issuedStatement = statement
      return {
        rows: [
          {
            approved_at: new Date("2026-08-01T00:00:00Z"),
            approved_by: "Design HOD",
            bom_snapshot: [
              {
                componentUid: "M101-OLD",
                notes: "Original component",
                quantity: 2,
                sequence: 1,
              },
            ],
            change_reason: "Initial Release",
            design_snapshot: {
              casting: 23,
              description: "Original package",
              itemType: "Package",
              processesRequired: ["Machining"],
              productionType: "Barstock",
              rodSize: "16 Round",
              sourcePayload: {
                category: "Historic category",
                productSize: "1/4 inch",
                subcategory: "Historic subcategory",
              },
              uid: "M100",
              weight100Pcs: 21,
            },
            drawing_file_id: null,
            drawing_file_name: null,
            drawing_media_type: null,
            drawing_number: null,
            drawing_requirement: null,
            drawing_revision: null,
            drawing_status: null,
            ecn_number: null,
            ecn_reason: null,
            ecn_status: null,
            effective_on: "2026-08-01",
            item_uid: "M100",
            released_at: new Date("2026-08-01T00:00:00Z"),
            revision_label: "00",
            source_payload: {},
            status: "Superseded",
          },
        ],
      }
    })
    const repository = createProductPortfolioRepository({
      pool: { query } as unknown as Pool,
    })

    const summary = await repository.getDesignRevisionSummaryForOrganization(
      "MRMPL",
      "M100",
      "00"
    )

    expect(summary).toEqual(
      expect.objectContaining({
        blankPieceWeight: 23,
        category: "Historic category",
        description: "Original package",
        productWeight: 21,
        revisionHistory: [],
        bom: [
          expect.objectContaining({
            componentUid: "M101-OLD",
            quantity: 2,
          }),
        ],
      })
    )
    expect(issuedStatement).not.toContain("AND drawing.is_current")
    expect(summary).not.toHaveProperty("pricing")
  })
})

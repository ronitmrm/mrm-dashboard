import Link from "next/link"

import { createCommercialWorkflowRepository } from "@workspace/db"
import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@workspace/ui/components/field"
import { Input } from "@workspace/ui/components/input"
import {
  NativeSelect,
  NativeSelectOption,
} from "@workspace/ui/components/native-select"
import { Separator } from "@workspace/ui/components/separator"
import { Textarea } from "@workspace/ui/components/textarea"

import { readAuthEnvironment } from "@/lib/auth/auth"
import { requireCapability } from "@/lib/auth/require-capability"

import {
  prepareCostingAction,
  requestDesignClarificationAction,
  saveDesignAction,
} from "../enquiries/actions"

export const dynamic = "force-dynamic"

function designItemIsEditable(nextStageStatus: string) {
  return ["Not Started", "Changes Required"].includes(nextStageStatus)
}

function ChoiceField({
  defaultValue,
  label,
  name,
  options,
}: {
  defaultValue: string
  label: string
  name: string
  options: readonly string[]
}) {
  return (
    <Field>
      <FieldLabel>
        {label}
        <NativeSelect name={name} defaultValue={defaultValue}>
          {options.map((option) => (
            <NativeSelectOption key={option} value={option}>
              {option}
            </NativeSelectOption>
          ))}
        </NativeSelect>
      </FieldLabel>
    </Field>
  )
}

function TextField({
  defaultValue,
  label,
  name,
  type = "text",
}: {
  defaultValue: number | string
  label: string
  name: string
  type?: string
}) {
  return (
    <Field>
      <FieldLabel>
        {label}
        <Input
          name={name}
          type={type}
          min={type === "number" ? "0" : undefined}
          step={type === "number" ? "0.000001" : undefined}
          defaultValue={defaultValue}
        />
      </FieldLabel>
    </Field>
  )
}

export default async function DesignPage() {
  await requireCapability("pricing.design.read", "/commercial/design")
  const workflow = createCommercialWorkflowRepository({
    connectionString: readAuthEnvironment().connectionString,
  })
  const { items, products } = await (async () => {
    try {
      const queue = await workflow.listDesignQueue("MRMPL")
      const portfolioProducts = queue.some((item) =>
        designItemIsEditable(item.nextStageStatus)
      )
        ? await workflow.listDesignPortfolioProducts("MRMPL")
        : []
      const withFiles = await Promise.all(
        queue.map(async (item) => ({
          ...item,
          attachments: item.designId
            ? await workflow.listAttachments({
                organizationId: item.organizationId,
                targetId: item.designId,
                targetTable: "design_tasks",
              })
            : [],
        }))
      )
      return { items: withFiles, products: portfolioProducts }
    } finally {
      await workflow.close()
    }
  })()

  return (
    <div className="grid gap-6">
      <section className="grid gap-2">
        <h2 className="text-2xl font-semibold tracking-tight">Design</h2>
        <p className="max-w-4xl text-sm text-muted-foreground">
          Feasible Technical lines arrive here for portfolio matching or a
          controlled Q/C design. Package children may nest only below Assembly
          rows; identifiers are allocated atomically when the dossier is saved.
        </p>
      </section>

      {items.length ? (
        items.map((item) => {
          const editable = designItemIsEditable(item.nextStageStatus)
          const rows = Array.from(
            { length: Math.max(4, item.bomLines.length) },
            (_, index) => item.bomLines[index]
          )
          return (
            <Card key={item.enquiryItemId}>
              <CardHeader>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <CardTitle>
                      {item.enquiryNumber} / Line {item.lineNumber}
                    </CardTitle>
                    <CardDescription>
                      {item.customerUid} · {item.companyName} ·{" "}
                      {item.customerPartCode} · {item.description}
                    </CardDescription>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline">{item.designStatus}</Badge>
                    <Badge variant="outline">{item.nextStageStatus}</Badge>
                    <Button asChild size="sm" variant="ghost">
                      <Link href={"/commercial/enquiries/" + item.enquiryId}>
                        Open enquiry
                      </Link>
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="grid gap-6">
                {item.latestClarificationMessage ? (
                  <p className="rounded-2xl border bg-muted/40 p-3 text-sm">
                    Product Costing requested: {item.latestClarificationMessage}
                  </p>
                ) : null}

                <form action={saveDesignAction}>
                  <input
                    type="hidden"
                    name="enquiry_id"
                    value={item.enquiryId}
                  />
                  <input
                    type="hidden"
                    name="enquiry_item_id"
                    value={item.enquiryItemId}
                  />
                  <input
                    type="hidden"
                    name="organization_id"
                    value={item.organizationId}
                  />
                  <fieldset className="grid gap-6" disabled={!editable}>
                    <FieldSet>
                      <FieldLegend>Portfolio and allocation</FieldLegend>
                      <FieldDescription>
                        Existing matches must be ordered internal products. New
                        List and Package work receives Q and C numbers.
                      </FieldDescription>
                      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                        <ChoiceField
                          defaultValue={item.portfolioMatchStatus}
                          label="Portfolio decision"
                          name="portfolio_match_status"
                          options={[
                            "New Design Required",
                            "Matches Existing Portfolio",
                          ]}
                        />
                        <Field>
                          <FieldLabel>
                            Matched product
                            {editable ? (
                              <NativeSelect
                                name="matched_product_id"
                                defaultValue={item.matchedProductId ?? ""}
                              >
                                <NativeSelectOption value="">
                                  No portfolio match
                                </NativeSelectOption>
                                {products.map((product) => (
                                  <NativeSelectOption
                                    key={product.id}
                                    value={product.id}
                                  >
                                    {product.uid} · {product.description}
                                  </NativeSelectOption>
                                ))}
                              </NativeSelect>
                            ) : (
                              <Input
                                disabled
                                value={
                                  item.matchedProductUid
                                    ? `${item.matchedProductUid} · ${item.matchedProductDescription ?? ""}`
                                    : "No portfolio match"
                                }
                              />
                            )}
                          </FieldLabel>
                        </Field>
                        <ChoiceField
                          defaultValue={item.itemType}
                          label="Item type"
                          name="item_type"
                          options={["List", "Package"]}
                        />
                        <TextField
                          defaultValue={item.quotedPartUid ?? ""}
                          label="Allocated Q / C number"
                          name="quoted_part_uid"
                        />
                      </div>
                    </FieldSet>

                    <FieldSet>
                      <FieldLegend>Design dossier</FieldLegend>
                      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                        <ChoiceField
                          defaultValue={item.designStatus}
                          label="Design status"
                          name="design_status"
                          options={[
                            "Pending Design",
                            "Design In Progress",
                            "Need Clarification",
                            "Changes Required",
                            "Design Complete",
                          ]}
                        />
                        <TextField
                          defaultValue={item.designerName ?? ""}
                          label="Designer"
                          name="designer_name"
                        />
                        <TextField
                          defaultValue={item.targetCompletionDate ?? ""}
                          label="Target completion"
                          name="target_completion_date"
                          type="date"
                        />
                        <TextField
                          defaultValue={item.revisionNo}
                          label="Revision"
                          name="revision_no"
                        />
                        <TextField
                          defaultValue={item.internalPartSize ?? ""}
                          label="Internal part size"
                          name="internal_part_size"
                        />
                        <TextField
                          defaultValue={item.internalPartSubCategory ?? ""}
                          label="Internal subcategory"
                          name="internal_part_sub_category"
                        />
                        <TextField
                          defaultValue={item.internalPartCategory ?? ""}
                          label="Internal category"
                          name="internal_part_category"
                        />
                        <TextField
                          defaultValue={item.manufacturingProcess ?? ""}
                          label="Manufacturing process"
                          name="manufacturing_process"
                        />
                        <TextField
                          defaultValue={item.packageProcessRequired ?? ""}
                          label="Package process"
                          name="package_process_required"
                        />
                        {(
                          [
                            [
                              "design_bom_required",
                              "BOM required",
                              item.designBomRequired,
                            ],
                            [
                              "design_bom_completed",
                              "BOM complete",
                              item.designBomCompleted,
                            ],
                            [
                              "assembly_required",
                              "Assembly required",
                              item.assemblyRequired,
                            ],
                            [
                              "tooling_required",
                              "Tooling required",
                              item.toolingRequired,
                            ],
                            [
                              "fixture_required",
                              "Fixture required",
                              item.fixtureRequired,
                            ],
                            [
                              "gauges_required",
                              "Gauges required",
                              item.gaugesRequired,
                            ],
                          ] as const
                        ).map(([name, label, value]) => (
                          <ChoiceField
                            key={name}
                            defaultValue={value}
                            label={label}
                            name={name}
                            options={["No", "Yes"]}
                          />
                        ))}
                        <TextField
                          defaultValue={item.componentsRequired ?? ""}
                          label="Components required"
                          name="components_required"
                        />
                        <TextField
                          defaultValue={item.toolingApproxCost}
                          label="Tooling approximate cost"
                          name="tooling_approx_cost"
                          type="number"
                        />
                        <TextField
                          defaultValue={item.fixtureApproxCost}
                          label="Fixture approximate cost"
                          name="fixture_approx_cost"
                          type="number"
                        />
                        <TextField
                          defaultValue={item.inspectionApproxCost}
                          label="Inspection approximate cost"
                          name="inspection_approx_cost"
                          type="number"
                        />
                        <TextField
                          defaultValue={item.checkedBy ?? ""}
                          label="Checked by"
                          name="checked_by"
                        />
                        <ChoiceField
                          defaultValue={item.approvalStatus}
                          label="Approval"
                          name="approval_status"
                          options={["Pending", "Approved", "Rejected"]}
                        />
                      </div>
                      <div className="grid gap-4 md:grid-cols-2">
                        <Field>
                          <FieldLabel>
                            Operation notes
                            <Textarea
                              name="operation_notes"
                              defaultValue={item.operationNotes ?? ""}
                            />
                          </FieldLabel>
                        </Field>
                        <Field>
                          <FieldLabel>
                            Design remarks
                            <Textarea
                              name="design_remarks"
                              defaultValue={item.designRemarks ?? ""}
                            />
                          </FieldLabel>
                        </Field>
                      </div>
                    </FieldSet>

                    <FieldSet>
                      <FieldLegend>Package / Assembly BOM</FieldLegend>
                      <FieldDescription>
                        Parent lines must be Assembly rows. Existing rows must
                        select an ordered internal product.
                      </FieldDescription>
                      <div className="grid gap-3">
                        {rows.map((row, index) => (
                          <div
                            key={index}
                            className="grid gap-3 rounded-2xl border p-3 md:grid-cols-2 xl:grid-cols-7"
                          >
                            <TextField
                              defaultValue={row?.lineNumber ?? index + 1}
                              label="Line"
                              name="bom_line_number"
                              type="number"
                            />
                            <TextField
                              defaultValue={row?.parentLineNumber ?? ""}
                              label="Parent line"
                              name="bom_parent_line_number"
                              type="number"
                            />
                            <ChoiceField
                              defaultValue={row?.componentSource ?? "New"}
                              label="Source"
                              name="bom_component_source"
                              options={["New", "Existing"]}
                            />
                            <ChoiceField
                              defaultValue={row?.componentItemType ?? "List"}
                              label="Type"
                              name="bom_component_item_type"
                              options={["List", "Assembly"]}
                            />
                            <Field>
                              <FieldLabel>
                                Existing product
                                <NativeSelect
                                  name="bom_existing_product_id"
                                  defaultValue={row?.existingProductId ?? ""}
                                >
                                  <NativeSelectOption value="">
                                    None
                                  </NativeSelectOption>
                                  {products.map((product) => (
                                    <NativeSelectOption
                                      key={product.id}
                                      value={product.id}
                                    >
                                      {product.uid}
                                    </NativeSelectOption>
                                  ))}
                                </NativeSelect>
                              </FieldLabel>
                            </Field>
                            <TextField
                              defaultValue={row?.componentCode ?? ""}
                              label="Component code"
                              name="bom_component_code"
                            />
                            <TextField
                              defaultValue={Number(row?.quantity ?? 1)}
                              label="Quantity"
                              name="bom_quantity"
                              type="number"
                            />
                            <div className="xl:col-span-3">
                              <TextField
                                defaultValue={row?.packagePart ?? ""}
                                label="Part / BOM item"
                                name="bom_package_part"
                              />
                            </div>
                          </div>
                        ))}
                      </div>
                    </FieldSet>

                    <FieldSet>
                      <FieldLegend>Design files</FieldLegend>
                      <div className="grid gap-4 md:grid-cols-3">
                        {[
                          ["internal_drawing_file", "Internal drawing"],
                          ["customer_marked_file", "Customer marked drawing"],
                          ["cad_file", "CAD file"],
                        ].map(([name, label]) => (
                          <Field key={name}>
                            <FieldLabel>
                              {label}
                              <Input name={name} type="file" />
                            </FieldLabel>
                          </Field>
                        ))}
                      </div>
                    </FieldSet>
                    <Button className="w-fit" type="submit">
                      Save Design dossier
                    </Button>
                  </fieldset>
                </form>

                {item.attachments.length ? (
                  <div className="flex flex-wrap gap-2">
                    {item.attachments.map((attachment) => (
                      <Button
                        asChild
                        key={attachment.id}
                        size="sm"
                        variant="outline"
                      >
                        <Link
                          href={
                            "/commercial/design/" +
                            item.designId +
                            "/file/" +
                            attachment.purpose
                          }
                        >
                          {attachment.purpose}: {attachment.fileName}
                        </Link>
                      </Button>
                    ))}
                  </div>
                ) : null}

                <Separator />
                <div className="grid gap-4 lg:grid-cols-2">
                  <form action={requestDesignClarificationAction}>
                    <input
                      type="hidden"
                      name="enquiry_id"
                      value={item.enquiryId}
                    />
                    <input
                      type="hidden"
                      name="enquiry_item_id"
                      value={item.enquiryItemId}
                    />
                    <input
                      type="hidden"
                      name="direction"
                      value="Design to Technical"
                    />
                    <FieldGroup>
                      <Field>
                        <FieldLabel>
                          Ask Technical for clarification
                          <Textarea name="message" required />
                        </FieldLabel>
                      </Field>
                      <Button className="w-fit" type="submit" variant="outline">
                        Return to Technical
                      </Button>
                    </FieldGroup>
                  </form>
                  {["Design Complete", "Not Required"].includes(
                    item.designStatus
                  ) &&
                  ["Not Started", "Changes Required"].includes(
                    item.nextStageStatus
                  ) ? (
                    <form action={prepareCostingAction}>
                      <input
                        type="hidden"
                        name="enquiry_id"
                        value={item.enquiryId}
                      />
                      <input
                        type="hidden"
                        name="enquiry_item_id"
                        value={item.enquiryItemId}
                      />
                      <Button type="submit">Prepare Product Costing</Button>
                    </form>
                  ) : null}
                </div>
              </CardContent>
            </Card>
          )
        })
      ) : (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            No Technical Review lines are waiting for Design.
          </CardContent>
        </Card>
      )}
    </div>
  )
}

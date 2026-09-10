import type { WebsiteProductRow } from "@workspace/db"

export const websiteProductFields = [
  { header: "uid", label: "UID", key: "uid" },
  { header: "description", label: "Description", key: "description" },
  { header: "grade", label: "Grade", key: "grade" },
  { header: "material", label: "Material", key: "material" },
  { header: "size", label: "Size", key: "size" },
  { header: "category", label: "Category", key: "category" },
  { header: "sub_category", label: "Subcategory", key: "subCategory" },
  { header: "applications", label: "Applications", key: "applications" },
  { header: "certifications", label: "Certifications", key: "certifications" },
  { header: "connections", label: "Connections", key: "connections" },
  {
    header: "MATERIAL CONSTRUCTION",
    label: "Material Construction",
    key: "materialConstruction",
  },
  {
    header: "FINAL ASSEMBLIES CODE",
    label: "Final Assemblies Code",
    key: "finalAssembliesCode",
  },
  { header: "dimensions", label: "Dimensions", key: "dimensions" },
  {
    header: "drawing_category",
    label: "Drawing Category",
    key: "drawingCategory",
  },
  { header: "finish_plating", label: "Finish Plating", key: "finishPlating" },
  { header: "pressure", label: "Pressure", key: "pressure" },
  { header: "sealant", label: "Sealant", key: "sealant" },
  { header: "temperature", label: "Temperature", key: "temperature" },
  {
    header: "THREAD STANDARD",
    label: "Thread Standard",
    key: "threadStandard",
  },
  { header: "thread_size_1", label: "Thread Size 1", key: "threadSize1" },
  { header: "thread_size_2", label: "Thread Size 2", key: "threadSize2" },
  { header: "thread_size_3", label: "Thread Size 3", key: "threadSize3" },
  { header: "thread_size_4", label: "Thread Size 4", key: "threadSize4" },
  { header: "website_active", label: "Website Active", key: "isActive" },
  { header: "created_at", label: "Created At", key: "entryCreatedAt" },
  { header: "remark", label: "Remark", key: "remark" },
  {
    header: "additional_notes",
    label: "Additional Notes",
    key: "additionalNotes",
  },
] as const satisfies ReadonlyArray<{
  header: string
  label: string
  key: keyof WebsiteProductRow
}>

export function websiteProductValue(
  row: WebsiteProductRow,
  key: (typeof websiteProductFields)[number]["key"]
) {
  const value = row[key]
  return typeof value === "boolean" ? (value ? "TRUE" : "FALSE") : (value ?? "")
}

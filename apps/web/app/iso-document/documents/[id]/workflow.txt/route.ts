import { notFound } from "next/navigation"
import { withIsoWorkflows } from "@/lib/iso-document/workflows-server"
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  return withIsoWorkflows(async ({ repository, access }) => {
    const document = (await repository.documents(access.organizationId)).find(
      (row) => row.id === id
    )
    if (!document) notFound()
    const text = `${document.title} — Task Workflow\nVersion: ${document.version}\nDepartment: ${document.department || "Not assigned"}\nResponsible person: ${document.ownerName || "Not assigned"}\nTarget date: ${document.dueOn || "Not set"}\n\n${document.text}\n`
    return new Response(text, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Content-Disposition": `attachment; filename="task-workflow-${id.slice(0, 8)}.txt"`,
        "Cache-Control": "private, no-store",
      },
    })
  })
}

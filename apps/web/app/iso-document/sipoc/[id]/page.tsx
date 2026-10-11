import { notFound } from "next/navigation"
import Link from "next/link"
import { withSipoc } from "@/lib/iso-document/sipoc-server"
import { PageHeader, RecordDetails } from "@/components/ui/golden-patterns"
import { SipocForm, SipocDecision } from "@/components/iso-document/sipoc-forms"
import { SipocMap } from "@/components/iso-document/sipoc-map"
import { IsoRecordHistoryTable } from "@/components/iso-document/iso-record-history"
import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from "@workspace/ui/components/tabs"
import { Button } from "@workspace/ui/components/button"
import { StatusBadge } from "@workspace/ui/components/badge"
export default async function SipocDetail({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  return withSipoc(async ({ repository, access }) => {
    const dossier = await repository.dossier(access, id)
    if (!dossier) notFound()
    const { entry, revisions, history } = dossier
    const approved = revisions.find(
      (row) => row.revision === entry.approvedRevision
    )
    const owners = access.canManage
      ? await repository.owners(access.organizationId)
      : []
    return (
      <div className="grid min-w-0 gap-6">
        <PageHeader
          title={`SIPOC-${entry.number} · ${entry.fields.name}`}
          description={`Working revision ${entry.revision}. ${approved ? `Approved revision ${approved.revision} remains available.` : "Complete the draft and submit for QA approval."}`}
          actions={
            <Button asChild variant="outline">
              <Link href="/iso-document/sipoc">Back to register</Link>
            </Button>
          }
        />
        <RecordDetails
          items={[
            {
              label: "Working status",
              value: <StatusBadge value={entry.status} />,
            },
            {
              label: "Latest QA findings",
              value: entry.decisionNotes || "Not reviewed",
            },
          ]}
        />
        <Tabs defaultValue={approved ? "approved" : "working"}>
          <TabsList className="h-auto flex-wrap">
            <TabsTrigger value="working">Working map</TabsTrigger>
            {approved ? (
              <TabsTrigger value="approved">Approved map</TabsTrigger>
            ) : null}
            {access.canManage && entry.status !== "Submitted" ? (
              <TabsTrigger value="edit">
                {entry.status === "Approved"
                  ? "Prepare revision"
                  : "Edit draft"}
              </TabsTrigger>
            ) : null}
            <TabsTrigger value="versions">Approved revisions</TabsTrigger>
            <TabsTrigger value="history">History / source</TabsTrigger>
          </TabsList>
          <TabsContent value="working" className="grid gap-6">
            <SipocMap fields={entry.fields} ownerName={entry.ownerName} />
            <SipocDecision
              record={entry}
              canManage={access.canManage}
              canApprove={access.canApprove}
            />
          </TabsContent>
          {approved ? (
            <TabsContent value="approved" className="grid gap-5">
              <RecordDetails
                items={[
                  { label: "Approved by", value: approved.approvedBy },
                  {
                    label: "Approved at (India)",
                    value: new Date(approved.approvedAt).toLocaleString(
                      "en-IN",
                      { timeZone: "Asia/Kolkata" }
                    ),
                  },
                  { label: "QA findings", value: approved.notes },
                ]}
              />
              <SipocMap
                fields={approved.fields}
                ownerName={approved.ownerName}
              />
            </TabsContent>
          ) : null}
          {access.canManage && entry.status !== "Submitted" ? (
            <TabsContent value="edit">
              <SipocForm key={entry.version} record={entry} owners={owners} />
            </TabsContent>
          ) : null}
          <TabsContent value="versions" className="grid gap-5">
            {revisions.length ? (
              revisions.map((revision) => (
                <details
                  key={revision.revision}
                  className="rounded-xl border p-4"
                >
                  <summary className="cursor-pointer">
                    Revision {revision.revision} · {revision.approvedBy} ·{" "}
                    {new Date(revision.approvedAt).toLocaleDateString("en-IN", {
                      timeZone: "Asia/Kolkata",
                    })}
                  </summary>
                  <div className="grid gap-5 pt-5">
                    <p>{revision.notes}</p>
                    <SipocMap
                      fields={revision.fields}
                      ownerName={revision.ownerName}
                    />
                  </div>
                </details>
              ))
            ) : (
              <p>No approved revisions yet.</p>
            )}
          </TabsContent>
          <TabsContent value="history" className="grid gap-5">
            <IsoRecordHistoryTable
              history={history}
              filterStorageKey={`sipoc-history-${id}`}
            />
            {entry.source ? (
              <details>
                <summary className="cursor-pointer">
                  Original workbook evidence
                </summary>
                <pre className="text-sm break-words whitespace-pre-wrap">
                  {JSON.stringify(entry.source, null, 2)}
                </pre>
              </details>
            ) : null}
          </TabsContent>
        </Tabs>
      </div>
    )
  })
}

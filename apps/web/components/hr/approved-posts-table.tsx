"use client"

import type { RecruitmentPostRow, RecruitmentTemplateRow } from "@workspace/db"
import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
import { Field, FieldLabel } from "@workspace/ui/components/field"
import { Input } from "@workspace/ui/components/input"
import {
  NativeSelect,
  NativeSelectOption,
} from "@workspace/ui/components/native-select"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@workspace/ui/components/sheet"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@workspace/ui/components/table"
import { Pencil, Trash2 } from "lucide-react"
import { useState } from "react"

import { deletePostAction, updatePostAction } from "@/app/hr/actions"

type TemplateOption = Pick<
  RecruitmentTemplateRow,
  "id" | "name" | "templateCode"
>

function PostStatusBadge({ status }: { status: string }) {
  const variant =
    status === "Vacant" || status === "Occupied"
      ? "default"
      : status === "Resigned"
        ? "destructive"
        : status === "Appointed"
          ? "secondary"
          : "outline"
  return <Badge variant={variant}>{status}</Badge>
}

export function ApprovedPostsTable({
  canWrite = false,
  posts,
  templates = [],
}: {
  canWrite?: boolean
  posts: RecruitmentPostRow[]
  templates?: TemplateOption[]
}) {
  const [editingPost, setEditingPost] = useState<RecruitmentPostRow | null>(
    null
  )
  const columnCount = canWrite ? 8 : 7

  return (
    <Sheet
      onOpenChange={(open) => {
        if (!open) setEditingPost(null)
      }}
      open={editingPost !== null}
    >
      <Card>
        <CardHeader>
          <CardTitle>Approved posts</CardTitle>
          <CardDescription>
            {posts.length} sanctioned staffing positions
          </CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Post code</TableHead>
                <TableHead>Vacancy code</TableHead>
                <TableHead>Department</TableHead>
                <TableHead>Designation</TableHead>
                <TableHead>Template</TableHead>
                <TableHead>Employee</TableHead>
                <TableHead>Status</TableHead>
                {canWrite ? (
                  <TableHead className="text-right">Actions</TableHead>
                ) : null}
              </TableRow>
            </TableHeader>
            <TableBody>
              {posts.length ? (
                posts.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="font-mono">{row.postCode}</TableCell>
                    <TableCell className="font-mono">
                      {row.vacancyCode}
                    </TableCell>
                    <TableCell>{row.department}</TableCell>
                    <TableCell>{row.designation}</TableCell>
                    <TableCell className="font-mono">
                      {row.requirementTemplateCode ?? "—"}
                    </TableCell>
                    <TableCell>
                      {row.employeeName
                        ? `${row.employeeName}${row.employeeCode ? ` (${row.employeeCode})` : ""}`
                        : "—"}
                    </TableCell>
                    <TableCell>
                      <PostStatusBadge status={row.status} />
                    </TableCell>
                    {canWrite ? (
                      <TableCell>
                        <div className="flex justify-end gap-2">
                          <Button
                            aria-label={`Edit ${row.postCode}`}
                            onClick={() => setEditingPost(row)}
                            size="sm"
                            type="button"
                            variant="outline"
                          >
                            <Pencil data-icon="inline-start" />
                            Edit
                          </Button>
                          <form
                            action={deletePostAction}
                            onSubmit={(event) => {
                              if (
                                !window.confirm(
                                  `Delete approved post ${row.postCode}? This cannot be undone.`
                                )
                              ) {
                                event.preventDefault()
                              }
                            }}
                          >
                            <input
                              name="panel"
                              type="hidden"
                              value="approvedPostPanel"
                            />
                            <input
                              name="post_id"
                              type="hidden"
                              value={row.id}
                            />
                            <Button
                              size="sm"
                              type="submit"
                              variant="destructive"
                            >
                              <Trash2 data-icon="inline-start" />
                              Delete
                            </Button>
                          </form>
                        </div>
                      </TableCell>
                    ) : null}
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell
                    className="py-10 text-center text-muted-foreground"
                    colSpan={columnCount}
                  >
                    No approved posts found.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {editingPost ? (
        <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
          <form action={updatePostAction} className="flex min-h-full flex-col">
            <input name="panel" type="hidden" value="approvedPostPanel" />
            <input name="post_id" type="hidden" value={editingPost.id} />
            <SheetHeader>
              <SheetTitle>Edit approved post</SheetTitle>
              <SheetDescription>
                Update the job template linked to {editingPost.postCode}.
                Department and designation remain locked because they form the
                software-generated Post Code.
              </SheetDescription>
            </SheetHeader>
            <div className="grid flex-1 content-start gap-4 px-6">
              <Field>
                <FieldLabel htmlFor="edit-post-code">Post code</FieldLabel>
                <Input
                  id="edit-post-code"
                  readOnly
                  value={editingPost.postCode}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="edit-post-department">
                  Department
                </FieldLabel>
                <Input
                  id="edit-post-department"
                  readOnly
                  value={editingPost.department}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="edit-post-designation">
                  Designation
                </FieldLabel>
                <Input
                  id="edit-post-designation"
                  readOnly
                  value={editingPost.designation}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="edit-post-template">
                  Job template
                </FieldLabel>
                <NativeSelect
                  className="w-full"
                  defaultValue={editingPost.requirementTemplateCode ?? ""}
                  id="edit-post-template"
                  name="requirement_template_code"
                >
                  <NativeSelectOption value="">No template</NativeSelectOption>
                  {templates.map((template) => (
                    <NativeSelectOption
                      key={template.id}
                      value={template.templateCode}
                    >
                      {template.templateCode} / {template.name}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
              </Field>
            </div>
            <SheetFooter>
              <Button type="submit">Save changes</Button>
            </SheetFooter>
          </form>
        </SheetContent>
      ) : null}
    </Sheet>
  )
}

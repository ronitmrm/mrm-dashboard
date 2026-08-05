"use client"

import type {
  RecruitmentCombinedRoleRow,
  RecruitmentPostRow,
} from "@workspace/db"
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
import { Pencil } from "lucide-react"
import { useState } from "react"

import { updateCombinedRoleAction } from "@/app/hr/actions"

function CombinedStatusBadge({ status }: { status: string }) {
  return (
    <Badge variant={status === "Active" ? "default" : "outline"}>
      {status}
    </Badge>
  )
}

export function CombinedRolesTable({
  canWrite,
  combinedRoles,
  posts,
}: {
  canWrite: boolean
  combinedRoles: RecruitmentCombinedRoleRow[]
  posts: RecruitmentPostRow[]
}) {
  const [editingRole, setEditingRole] =
    useState<RecruitmentCombinedRoleRow | null>(null)
  const [name, setName] = useState("")
  const [primaryPostId, setPrimaryPostId] = useState("")
  const [search, setSearch] = useState("")
  const [selectedPostIds, setSelectedPostIds] = useState<Set<string>>(
    () => new Set()
  )

  function startEditing(role: RecruitmentCombinedRoleRow) {
    const memberCodes = new Set(role.postCodes)
    const memberPosts = posts.filter((post) => memberCodes.has(post.postCode))
    setEditingRole(role)
    setName(role.name)
    setPrimaryPostId(
      memberPosts.find((post) => post.postCode === role.primaryPostCode)?.id ??
        ""
    )
    setSearch("")
    setSelectedPostIds(new Set(memberPosts.map((post) => post.id)))
  }

  function closeEditor() {
    setEditingRole(null)
    setName("")
    setPrimaryPostId("")
    setSearch("")
    setSelectedPostIds(new Set())
  }

  function setPostSelected(postId: string, selected: boolean) {
    setSelectedPostIds((current) => {
      const next = new Set(current)
      if (selected) next.add(postId)
      else next.delete(postId)
      return next
    })
    if (!selected && primaryPostId === postId) setPrimaryPostId("")
  }

  const editingMemberCodes = new Set(editingRole?.postCodes ?? [])
  const otherActiveMemberCodes = new Set(
    combinedRoles
      .filter((role) => role.status === "Active" && role.id !== editingRole?.id)
      .flatMap((role) => role.postCodes)
  )
  const editablePosts = posts.filter(
    (post) =>
      post.status !== "Inactive" &&
      (editingMemberCodes.has(post.postCode) ||
        !otherActiveMemberCodes.has(post.postCode))
  )
  const normalizedSearch = search.trim().toLowerCase()
  const filteredPosts = normalizedSearch
    ? editablePosts.filter((post) =>
        [post.postCode, post.department, post.designation].some((value) =>
          value.toLowerCase().includes(normalizedSearch)
        )
      )
    : editablePosts
  const canSubmit =
    selectedPostIds.size >= 2 && selectedPostIds.has(primaryPostId)
  const columnCount = canWrite ? 6 : 5

  return (
    <Sheet
      onOpenChange={(open) => {
        if (!open) closeEditor()
      }}
      open={editingRole !== null}
    >
      <Card>
        <CardHeader>
          <CardTitle>Combined roles</CardTitle>
          <CardDescription>
            {combinedRoles.filter((role) => role.status === "Active").length}{" "}
            active groups
          </CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Combined code</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Post Codes</TableHead>
                <TableHead>Primary Post</TableHead>
                <TableHead>Status</TableHead>
                {canWrite ? (
                  <TableHead className="text-right">Actions</TableHead>
                ) : null}
              </TableRow>
            </TableHeader>
            <TableBody>
              {combinedRoles.length ? (
                combinedRoles.map((role) => (
                  <TableRow key={role.id}>
                    <TableCell className="font-mono">
                      {role.vacancyCode ?? "—"}
                    </TableCell>
                    <TableCell>{role.name}</TableCell>
                    <TableCell className="font-mono text-xs">
                      {role.postCodes.join(", ") || "—"}
                    </TableCell>
                    <TableCell className="font-mono">
                      {role.primaryPostCode ?? "—"}
                    </TableCell>
                    <TableCell>
                      <CombinedStatusBadge status={role.status} />
                    </TableCell>
                    {canWrite ? (
                      <TableCell className="text-right">
                        <Button
                          disabled={role.status !== "Active"}
                          onClick={() => startEditing(role)}
                          size="sm"
                          type="button"
                          variant="outline"
                        >
                          <Pencil data-icon="inline-start" />
                          Edit
                        </Button>
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
                    No combined roles found.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {editingRole ? (
        <SheetContent className="w-full overflow-y-auto sm:max-w-2xl">
          <form
            action={updateCombinedRoleAction}
            className="flex min-h-full flex-col"
          >
            <input name="panel" type="hidden" value="approvedPostPanel" />
            <input
              name="combined_role_id"
              type="hidden"
              value={editingRole.id}
            />
            {[...selectedPostIds].map((postId) => (
              <input
                key={postId}
                name="post_ids"
                type="hidden"
                value={postId}
              />
            ))}
            <input name="primary_post_id" type="hidden" value={primaryPostId} />
            <SheetHeader>
              <SheetTitle>Edit combined role</SheetTitle>
              <SheetDescription>
                Change the role name, member Post Codes, or primary
                responsibility. The combined vacancy code stays unchanged.
              </SheetDescription>
            </SheetHeader>
            <div className="grid flex-1 content-start gap-4 px-6">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field>
                  <FieldLabel htmlFor="edit-combined-name">
                    Combined role name
                  </FieldLabel>
                  <Input
                    id="edit-combined-name"
                    name="name"
                    onChange={(event) => setName(event.target.value)}
                    required
                    value={name}
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="edit-combined-code">
                    Combined vacancy code
                  </FieldLabel>
                  <Input
                    id="edit-combined-code"
                    readOnly
                    value={editingRole.vacancyCode ?? ""}
                  />
                </Field>
              </div>
              <Field>
                <FieldLabel htmlFor="edit-combined-search">
                  Search Post Codes
                </FieldLabel>
                <Input
                  id="edit-combined-search"
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search by Post Code, department, or designation"
                  value={search}
                />
              </Field>
              <div className="flex items-center justify-between gap-3 text-sm">
                <span>{selectedPostIds.size} posts selected</span>
                <span className="text-muted-foreground">
                  {primaryPostId
                    ? "Primary selected"
                    : "Choose one primary post"}
                </span>
              </div>
              <div className="max-h-[50vh] overflow-y-auto rounded-md border">
                {filteredPosts.length ? (
                  filteredPosts.map((post) => {
                    const selected = selectedPostIds.has(post.id)
                    return (
                      <div
                        className="grid grid-cols-[auto_1fr_auto] items-center gap-3 border-b px-3 py-2 last:border-b-0"
                        key={post.id}
                      >
                        <input
                          checked={selected}
                          className="size-4 accent-primary"
                          id={`edit-combine-post-${post.id}`}
                          onChange={(event) =>
                            setPostSelected(post.id, event.target.checked)
                          }
                          type="checkbox"
                        />
                        <label
                          className="min-w-0 cursor-pointer"
                          htmlFor={`edit-combine-post-${post.id}`}
                        >
                          <span className="block font-mono text-sm font-medium">
                            {post.postCode}
                          </span>
                          <span className="block truncate text-xs text-muted-foreground">
                            {post.department} / {post.designation} /{" "}
                            {post.status}
                          </span>
                        </label>
                        <label className="flex items-center gap-2 text-xs">
                          <input
                            checked={primaryPostId === post.id}
                            className="size-4 accent-primary"
                            disabled={!selected}
                            name="primary-post-choice"
                            onChange={() => setPrimaryPostId(post.id)}
                            type="radio"
                          />
                          Primary
                        </label>
                      </div>
                    )
                  })
                ) : (
                  <p className="p-6 text-center text-sm text-muted-foreground">
                    No available Post Codes match this search.
                  </p>
                )}
              </div>
            </div>
            <SheetFooter>
              <Button disabled={!canSubmit} type="submit">
                Save combined role
              </Button>
            </SheetFooter>
          </form>
        </SheetContent>
      ) : null}
    </Sheet>
  )
}

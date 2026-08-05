"use client"

import { nextRecruitmentCombinedRoleIdentity } from "@workspace/db/recruitment-codes"
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
import { useState } from "react"

import { createCombinedRoleAction } from "@/app/hr/actions"

type CombinedPostOption = {
  department: string
  designation: string
  id: string
  postCode: string
  status: string
}

export function CombinedRoleForm({
  existingVacancyCodes,
  posts,
}: {
  existingVacancyCodes: string[]
  posts: CombinedPostOption[]
}) {
  const [primaryPostId, setPrimaryPostId] = useState("")
  const [search, setSearch] = useState("")
  const [selectedPostIds, setSelectedPostIds] = useState<Set<string>>(
    () => new Set()
  )
  const identity = nextRecruitmentCombinedRoleIdentity(existingVacancyCodes)
  const normalizedSearch = search.trim().toLowerCase()
  const filteredPosts = normalizedSearch
    ? posts.filter((post) =>
        [post.postCode, post.department, post.designation].some((value) =>
          value.toLowerCase().includes(normalizedSearch)
        )
      )
    : posts

  function setPostSelected(postId: string, selected: boolean) {
    setSelectedPostIds((current) => {
      const next = new Set(current)
      if (selected) next.add(postId)
      else next.delete(postId)
      return next
    })
    if (!selected && primaryPostId === postId) setPrimaryPostId("")
  }

  const canSubmit =
    selectedPostIds.size >= 2 && selectedPostIds.has(primaryPostId)

  return (
    <Card>
      <CardHeader>
        <CardTitle>Combine approved posts</CardTitle>
        <CardDescription>
          Select at least two Post Codes and choose the primary responsibility.
          Posts already used by an active combined role are excluded.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form action={createCombinedRoleAction} className="grid gap-4">
          <input name="panel" type="hidden" value="approvedPostPanel" />
          {[...selectedPostIds].map((postId) => (
            <input key={postId} name="post_ids" type="hidden" value={postId} />
          ))}
          <input
            name="primary_post_id"
            type="hidden"
            value={primaryPostId}
          />
          <div className="grid gap-4 md:grid-cols-2">
            <Field>
              <FieldLabel htmlFor="combined-role-name">
                Combined role name
              </FieldLabel>
              <Input
                defaultValue={identity.defaultName}
                id="combined-role-name"
                name="name"
                required
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="combined-role-code">
                Combined vacancy code (auto-generated)
              </FieldLabel>
              <Input
                id="combined-role-code"
                readOnly
                value={identity.vacancyCode}
              />
            </Field>
          </div>
          <Field>
            <FieldLabel htmlFor="combined-role-search">
              Search Post Codes
            </FieldLabel>
            <Input
              id="combined-role-search"
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search by Post Code, department, or designation"
              value={search}
            />
          </Field>
          <div className="flex items-center justify-between gap-3 text-sm">
            <span>{selectedPostIds.size} posts selected</span>
            <span className="text-muted-foreground">
              {primaryPostId ? "Primary selected" : "Choose one primary post"}
            </span>
          </div>
          <div className="max-h-80 overflow-y-auto rounded-md border">
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
                      id={`combine-post-${post.id}`}
                      onChange={(event) =>
                        setPostSelected(post.id, event.target.checked)
                      }
                      type="checkbox"
                    />
                    <label
                      className="min-w-0 cursor-pointer"
                      htmlFor={`combine-post-${post.id}`}
                    >
                      <span className="block font-mono text-sm font-medium">
                        {post.postCode}
                      </span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {post.department} · {post.designation} · {post.status}
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
          <Button disabled={!canSubmit} type="submit">
            Create combined role
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}

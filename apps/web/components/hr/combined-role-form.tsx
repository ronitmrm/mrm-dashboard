"use client"

import { nextRecruitmentCombinedRoleIdentity } from "@workspace/db/recruitment-codes"
import { Button } from "@workspace/ui/components/button"
import {
 SectionCard,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
import { Field, FieldLabel } from "@workspace/ui/components/field"
import { Input } from "@workspace/ui/components/input"
import { useState } from "react"

import { createCombinedRoleAction } from "@/app/hr/actions"
import { CombinedPostPicker } from "@/components/hr/combined-post-picker"
import type { CombinedPostOption } from "@/components/hr/combined-post-picker-state"

export function CombinedRoleForm({
  existingVacancyCodes,
  masterView,
  posts,
}: {
  existingVacancyCodes: string[]
  masterView?: "dataEntry" | "masterTables"
  posts: CombinedPostOption[]
}) {
  const [primaryPostId, setPrimaryPostId] = useState("")
  const [selectedPostIds, setSelectedPostIds] = useState<Set<string>>(
    () => new Set()
  )
  const identity = nextRecruitmentCombinedRoleIdentity(existingVacancyCodes)

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
 <SectionCard>
      <CardHeader>
        <CardTitle>Combine Approved Posts</CardTitle>
        <CardDescription>
          Select At Least Two Post Codes And Choose The Primary Responsibility.
          Posts Already Used By An Active Combined Role Are Excluded.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form action={createCombinedRoleAction} className="grid gap-4">
          <input name="panel" type="hidden" value="combinedRolesPanel" />
          {masterView ? (
            <input name="master_view" type="hidden" value={masterView} />
          ) : null}
          {[...selectedPostIds].map((postId) => (
            <input key={postId} name="post_ids" type="hidden" value={postId} />
          ))}
          <input name="primary_post_id" type="hidden" value={primaryPostId} />
          <div className="grid gap-4 md:grid-cols-2">
            <Field>
              <FieldLabel htmlFor="combined-role-name">
                Combined Role Name
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
                Combined Vacancy Code (Auto-Generated)
              </FieldLabel>
              <Input
                id="combined-role-code"
                readOnly
                value={identity.vacancyCode}
              />
            </Field>
          </div>
          <div className="flex items-center justify-between gap-3 text-sm">
            <span>{selectedPostIds.size} Posts Selected</span>
            <span className="text-muted-foreground">
              {primaryPostId ? "Primary Selected" : "Choose One Primary Post"}
            </span>
          </div>
          <CombinedPostPicker
            idPrefix="combine-post"
            onPostSelected={setPostSelected}
            onPrimaryPostChange={setPrimaryPostId}
            posts={posts}
            primaryPostId={primaryPostId}
            selectedPostIds={selectedPostIds}
          />
          <Button disabled={!canSubmit} type="submit">
            Create Combined Role
          </Button>
        </form>
      </CardContent>
 </SectionCard>
  )
}

"use client"

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@workspace/ui/components/table"

import type { CombinedPostOption } from "@/components/hr/combined-post-picker-state"

export function CombinedPostPicker({
  idPrefix,
  onPostSelected,
  onPrimaryPostChange,
  posts,
  primaryPostId,
  selectedPostIds,
}: {
  idPrefix: string
  onPostSelected: (postId: string, selected: boolean) => void
  onPrimaryPostChange: (postId: string) => void
  posts: CombinedPostOption[]
  primaryPostId: string
  selectedPostIds: Set<string>
}) {
  return (
    <Table containerClassName="max-h-80 rounded-md border">
      <TableHeader className="sticky top-0 z-10 bg-muted/95">
        <TableRow>
          <TableHead className="w-14">Select</TableHead>
          <TableHead className="min-w-56">Department</TableHead>
          <TableHead className="min-w-48">Designation</TableHead>
          <TableHead className="min-w-28">Status</TableHead>
          <TableHead className="w-28 text-right">Primary</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {posts.map((post) => {
          const selected = selectedPostIds.has(post.id)
          const checkboxId = `${idPrefix}-select-${post.id}`
          return (
            <TableRow key={post.id}>
              <TableCell>
                <input
                  aria-label={`Select ${post.postCode}`}
                  checked={selected}
                  className="size-4 accent-primary"
                  id={checkboxId}
                  onChange={(event) =>
                    onPostSelected(post.id, event.target.checked)
                  }
                  type="checkbox"
                />
              </TableCell>
              <TableCell>{post.department}</TableCell>
              <TableCell>{post.designation}</TableCell>
              <TableCell>{post.status}</TableCell>
              <TableCell className="text-right">
                <label className="inline-flex items-center gap-2 text-xs">
                  <input
                    aria-label={`Make ${post.postCode} primary`}
                    checked={primaryPostId === post.id}
                    className="size-4 accent-primary"
                    disabled={!selected}
                    name={`${idPrefix}-primary-post-choice`}
                    onChange={() => onPrimaryPostChange(post.id)}
                    type="radio"
                  />
                  Primary
                </label>
              </TableCell>
            </TableRow>
          )
        })}
        {!posts.length ? (
          <TableRow>
            <TableCell
              className="h-24 text-center text-muted-foreground"
              colSpan={5}
            >
              No Available Approved Posts.
            </TableCell>
          </TableRow>
        ) : null}
      </TableBody>
    </Table>
  )
}

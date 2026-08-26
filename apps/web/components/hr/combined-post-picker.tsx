"use client"

import { ExcelColumnFilter } from "@workspace/ui/components/excel-column-filter"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@workspace/ui/components/table"
import { useMemo, useState } from "react"

import {
  combinedPostFilterOptions,
  departmentDesignation,
  emptyCombinedPostFilters,
  filterCombinedPosts,
  type CombinedPostFilters,
  type CombinedPostOption,
} from "@/components/hr/combined-post-picker-state"

type FilterKey = keyof CombinedPostFilters

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
  const [filters, setFilters] = useState<CombinedPostFilters>(
    emptyCombinedPostFilters
  )
  const options = useMemo(() => combinedPostFilterOptions(posts), [posts])
  const filteredPosts = useMemo(
    () => filterCombinedPosts(posts, filters),
    [filters, posts]
  )

  function applyFilter(key: FilterKey, selected: string[] | null) {
    setFilters((current) => ({ ...current, [key]: selected }))
  }

  return (
    <Table containerClassName="max-h-80 rounded-md border">
      <TableHeader className="sticky top-0 z-10 bg-muted/95">
        <TableRow>
          <TableHead className="w-14">Select</TableHead>
          <TableHead className="min-w-40">
            <div className="space-y-1 py-1">
              <span>Post Code</span>
              <ExcelColumnFilter
                label="Post Code"
                onApply={(selected) => applyFilter("postCode", selected)}
                options={options.postCode}
                selected={filters.postCode}
              />
            </div>
          </TableHead>
          <TableHead className="min-w-72">
            <div className="space-y-1 py-1">
              <span>Department / Designation</span>
              <ExcelColumnFilter
                label="Department / Designation"
                onApply={(selected) =>
                  applyFilter("departmentDesignation", selected)
                }
                options={options.departmentDesignation}
                selected={filters.departmentDesignation}
              />
            </div>
          </TableHead>
          <TableHead className="min-w-28">
            <div className="space-y-1 py-1">
              <span>Status</span>
              <ExcelColumnFilter
                label="Status"
                onApply={(selected) => applyFilter("status", selected)}
                options={options.status}
                selected={filters.status}
              />
            </div>
          </TableHead>
          <TableHead className="w-28 text-right">Primary</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {filteredPosts.map((post) => {
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
              <TableCell>
                <label
                  className="cursor-pointer font-mono font-medium"
                  htmlFor={checkboxId}
                >
                  {post.postCode}
                </label>
              </TableCell>
              <TableCell>{departmentDesignation(post)}</TableCell>
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
        {!filteredPosts.length ? (
          <TableRow>
            <TableCell
              className="h-24 text-center text-muted-foreground"
              colSpan={5}
            >
              No Available Post Codes Match The Current Filters.
            </TableCell>
          </TableRow>
        ) : null}
      </TableBody>
    </Table>
  )
}

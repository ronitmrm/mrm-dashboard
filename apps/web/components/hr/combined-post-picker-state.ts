import {
  matchesColumnFilter,
  uniqueFilterOptions,
} from "@workspace/ui/components/excel-column-filter"

export type CombinedPostOption = {
  department: string
  designation: string
  id: string
  postCode: string
  status: string
}

export type CombinedPostFilters = {
  departmentDesignation: string[] | null
  postCode: string[] | null
  status: string[] | null
}

export const emptyCombinedPostFilters: CombinedPostFilters = {
  departmentDesignation: null,
  postCode: null,
  status: null,
}

export function departmentDesignation(post: CombinedPostOption) {
  return `${post.department} / ${post.designation}`
}

export function combinedPostFilterOptions(posts: CombinedPostOption[]) {
  return {
    departmentDesignation: uniqueFilterOptions(
      posts.map(departmentDesignation)
    ),
    postCode: uniqueFilterOptions(posts.map((post) => post.postCode)),
    status: uniqueFilterOptions(posts.map((post) => post.status)),
  }
}

export function filterCombinedPosts(
  posts: CombinedPostOption[],
  filters: CombinedPostFilters
) {
  return posts.filter(
    (post) =>
      matchesColumnFilter(post.postCode, filters.postCode) &&
      matchesColumnFilter(
        departmentDesignation(post),
        filters.departmentDesignation
      ) &&
      matchesColumnFilter(post.status, filters.status)
  )
}

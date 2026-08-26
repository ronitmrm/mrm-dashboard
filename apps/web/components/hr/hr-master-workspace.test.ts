import { readFileSync } from "node:fs"

import { describe, expect, it } from "vitest"

describe("HR master workspace", () => {
  it("shows one selected master without recruitment metric cards", () => {
    const pageSource = readFileSync(
      new URL("../../app/hr/page.tsx", import.meta.url),
      "utf8"
    )
    const panelSource = readFileSync(
      new URL("./recruitment-panel.tsx", import.meta.url),
      "utf8"
    )
    const tablesSource = readFileSync(
      new URL("./master-tables.tsx", import.meta.url),
      "utf8"
    )

    expect(pageSource).toContain('activeItem.panelId !== "mastersPanel"')
    expect(pageSource).toContain('activeItem.panelId !== "postMasterPanel"')
    expect(pageSource).toContain('activeItem.panelId !== "approvedPostPanel"')
    expect(pageSource).toContain('activeItem.panelId !== "combinedRolesPanel"')
    expect(pageSource).toContain('activeItem.panelId !== "candidatesPanel"')
    expect(pageSource).toContain('activeItem.panelId !== "employeeMasterPanel"')
    expect(panelSource).not.toContain("<RecruitmentMasterKindSelect")

    expect(panelSource).toContain("function ApprovedPostPanel")
    expect(panelSource).toContain('showDataEntry = activeView === "dataEntry"')
    expect(panelSource).toContain(
      'showMasterTables = activeView === "masterTables"'
    )
    expect(panelSource).toContain(
      'dataEntryHref="/hr?panel=approvedPostPanel&masterView=dataEntry"'
    )
    expect(panelSource).toContain(
      'masterTablesHref="/hr?panel=approvedPostPanel&masterView=masterTables"'
    )
    expect(panelSource).toContain("function CombinedRolePanel")
    const combinedRolePanelSource = panelSource.slice(
      panelSource.indexOf("function CombinedRolePanel"),
      panelSource.indexOf("function EmployeePanel")
    )
    expect(combinedRolePanelSource).toContain("csvDownloadAction={")
    expect(combinedRolePanelSource).toContain(
      'fileName="combined-approved-posts-template.csv"'
    )
    expect(combinedRolePanelSource).toContain("csvImportAction={")
    expect(combinedRolePanelSource).toContain(
      "action={importCombinedRolesCsvAction}"
    )
    expect(panelSource).toContain(
      'dataEntryHref="/hr?panel=combinedRolesPanel&masterView=dataEntry"'
    )
    expect(panelSource).toContain(
      'masterTablesHref="/hr?panel=combinedRolesPanel&masterView=masterTables"'
    )
    expect(panelSource).toContain("action={importApprovedPostsCsvAction}")
    expect(panelSource).toContain('fileName="approved-posts-template.csv"')
    expect(panelSource).toContain('href="/hr/approved-posts/export"')

    expect(panelSource).toContain(
      'dataEntryHref="/hr?panel=candidatesPanel&masterView=dataEntry"'
    )
    expect(panelSource).toContain(
      'masterTablesHref="/hr?panel=candidatesPanel&masterView=masterTables"'
    )
    const candidatePanelSource = panelSource.slice(
      panelSource.indexOf("function LogCandidatePanel"),
      panelSource.indexOf("function CandidateSearchPanel")
    )
    expect(candidatePanelSource).toContain("csvDownloadAction={")
    expect(candidatePanelSource).toContain(
      'fileName="candidate-master-template.csv"'
    )
    expect(candidatePanelSource).toContain("csvImportAction={")
    expect(candidatePanelSource).toContain("action={importCandidatesCsvAction}")
    expect(panelSource).toContain('allMastersHref="/?tab=dataEntryTab"')
    expect(panelSource).toContain('"employee-assignment"')
    const employeePanelSource = panelSource.slice(
      panelSource.indexOf("function EmployeePanel"),
      panelSource.indexOf("function JobsPanel")
    )
    const approvedPostsTableSource = readFileSync(
      new URL("./approved-posts-table.tsx", import.meta.url),
      "utf8"
    )
    expect(employeePanelSource).toContain(
      "const standalone = masterView === undefined"
    )
    expect(employeePanelSource).toContain(
      'const activeView = masterView ?? "masterTables"'
    )
    expect(employeePanelSource).toContain("csvDownloadAction={")
    expect(employeePanelSource).toContain(
      'href="/hr/employee-assignments/template.csv"'
    )
    expect(employeePanelSource).toContain("csvImportAction={")
    expect(employeePanelSource).toContain(
      "action={importEmployeeAssignmentsCsvAction}"
    )
    expect(employeePanelSource).not.toContain("<SingleEmployeeAssignmentFields")
    expect(employeePanelSource).not.toContain("Single Employee Update")
    expect(employeePanelSource).toContain(
      "<CardTitle>Bulk Employee Assignment</CardTitle>"
    )
    expect(approvedPostsTableSource).toContain("allowIdentityCorrection")
    expect(approvedPostsTableSource).toContain(
      'employeeManagement ? "Employee Master" : "Approved Posts"'
    )
    expect(panelSource).toContain("showDataEntry && canManageEmployees")
    expect(panelSource).toContain("showMasterTables ? (")
    expect(tablesSource).toMatch(
      /const rows =\s+kind === "department" \? masters\.departments : masters\.designations/
    )
    expect(tablesSource).not.toContain('className="grid gap-6 xl:grid-cols-2"')
  })
})

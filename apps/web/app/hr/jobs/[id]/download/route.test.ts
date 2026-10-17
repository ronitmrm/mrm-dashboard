import { beforeEach, expect, it, vi } from "vitest"
import type { RecruitmentJobPostDocument } from "@workspace/db"

const mocks = vi.hoisted(() => ({
  close: vi.fn(),
  getJobPostDocument: vi.fn(),
  organizationIdForCode: vi.fn(),
  requireCapability: vi.fn(),
}))

vi.mock("@workspace/db", () => ({ createRecruitmentRepository: () => mocks }))
vi.mock("@/lib/auth/auth", () => ({
  readAuthEnvironment: () => ({ connectionString: "postgres://test" }),
}))
vi.mock("@/lib/auth/require-capability", () => ({
  requireCapability: mocks.requireCapability,
}))
vi.mock(
  "@/lib/attachment-viewer",
  async () => import("../../../../../lib/attachment-viewer")
)
vi.mock(
  "@/lib/hr/job-post-pdf",
  async () => import("../../../../../lib/hr/job-post-pdf")
)

import { GET } from "./route"

const job = {
  jobNumber: "CMB-2-3",
  title: "Production Operator",
  vacancyCode: "CMB-2",
  postCode: "POST-1",
  templateCode: "JRT-1",
  postDate: "2026-10-17",
  targetDate: null,
  status: "Open",
  employeeCount: 1,
  minimumSalary: "18000.00",
  maximumSalary: "25000.00",
  shiftType: "Night",
  shiftStartTime: "22:00",
  shiftEndTime: "06:00",
  gender: "Any",
  education: "ITI",
  experience: "2 years",
  description: `${"Set up machines and check dimensions.\n".repeat(45)}Final responsibility: report rejected parts.`,
} satisfies RecruitmentJobPostDocument
const context = { params: Promise.resolve({ id: "job-1" }) }
const url = "http://localhost/hr/jobs/job-1/download"

beforeEach(() => {
  vi.clearAllMocks()
  mocks.organizationIdForCode.mockResolvedValue("org-1")
  mocks.getJobPostDocument.mockResolvedValue(job)
})

it("previews and downloads the complete saved job with long descriptions", async () => {
  const response = await GET(new Request(url), context)
  expect(mocks.requireCapability).toHaveBeenCalledWith(
    "hr.jobs.read",
    "/hr/jobs/job-1"
  )
  expect(mocks.getJobPostDocument).toHaveBeenCalledWith("org-1", "job-1")
  expect(response.headers.get("Content-Type")).toBe("application/pdf")
  expect(response.headers.get("Cache-Control")).toBe("private, no-store")
  expect(response.headers.get("Content-Disposition")).toContain(
    'inline; filename="CMB-2-3-job-post.pdf"'
  )
  const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs")
  const document = await getDocument({
    data: new Uint8Array(await response.arrayBuffer()),
    useSystemFonts: true,
  }).promise
  try {
    expect(document.numPages).toBeGreaterThan(1)
    let text = ""
    for (let page = 1; page <= document.numPages; page++) {
      const content = await (await document.getPage(page)).getTextContent()
      text += content.items
        .map((item) => ("str" in item ? item.str : ""))
        .join(" ")
    }
    for (const value of [
      "Production Operator",
      "CMB-2-3",
      "POST-1",
      "JRT-1",
      "17 Oct 2026",
      "Not specified",
      "Rs. 18,000 - Rs. 25,000",
      "22:00",
      "06:00",
      "Night",
      "Any",
      "ITI",
      "2 years",
      "Final responsibility: report rejected parts.",
    ])
      expect(text).toContain(value)
  } finally {
    await document.destroy()
  }
  const download = await GET(new Request(`${url}?download=1`), context)
  expect(download.headers.get("Content-Disposition")).toContain("attachment;")
  expect(mocks.close).toHaveBeenCalledTimes(2)
})

it("returns 404 and closes the repository when the scoped job is missing", async () => {
  mocks.getJobPostDocument.mockResolvedValue(null)
  expect((await GET(new Request(url), context)).status).toBe(404)
  expect(mocks.close).toHaveBeenCalledOnce()
})

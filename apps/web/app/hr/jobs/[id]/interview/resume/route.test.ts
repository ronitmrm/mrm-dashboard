import { beforeEach, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  close: vi.fn(),
  deliver: vi.fn(),
  getCandidateResume: vi.fn(),
  getJobWorkspace: vi.fn(),
  organizationIdForCode: vi.fn(),
  requireCapability: vi.fn(),
}))

vi.mock("@workspace/db", () => ({
  createRecruitmentRepository: () => ({
    close: mocks.close,
    getCandidateResume: mocks.getCandidateResume,
    getJobWorkspace: mocks.getJobWorkspace,
    organizationIdForCode: mocks.organizationIdForCode,
  }),
}))
vi.mock("@/lib/artifact-delivery", () => ({
  artifactDeliveryErrorResponse: vi.fn(),
  createArtifactDeliveryResponse: mocks.deliver,
}))
vi.mock("@/lib/auth/auth", () => ({
  readAuthEnvironment: () => ({ connectionString: "postgres://test" }),
}))
vi.mock("@/lib/auth/require-capability", () => ({
  requireCapability: mocks.requireCapability,
}))
vi.mock("@/lib/auth/task-capabilities", () => ({
  hrTaskCapabilities: { recordInterview: "hr.interviews.record" },
}))

import { GET } from "./route"

const context = { params: Promise.resolve({ id: "job-1" }) }
const request = (application: string) =>
  new Request(`http://localhost/hr/jobs/job-1/interview/resume?application=${application}&preview`)

beforeEach(() => {
  for (const mock of Object.values(mocks)) mock.mockReset()
  mocks.organizationIdForCode.mockResolvedValue("organization-1")
  mocks.getJobWorkspace.mockResolvedValue({
    applications: [{ id: "application-1", candidateId: "candidate-1", scoreableRound: "Technical Round" }],
  })
})

it("previews the selected job applicant's resume", async () => {
  const resume = { fileName: "resume.pdf" }
  mocks.getCandidateResume.mockResolvedValue(resume)
  mocks.deliver.mockResolvedValue(new Response("pdf"))

  expect((await GET(request("application-1"), context)).status).toBe(200)
  expect(mocks.requireCapability).toHaveBeenCalledWith("hr.interviews.record", "/hr/jobs/job-1/interview")
  expect(mocks.getCandidateResume).toHaveBeenCalledWith("organization-1", "candidate-1")
  expect(mocks.deliver).toHaveBeenCalledWith(expect.any(Request), resume, { download: false })
  expect(mocks.close).toHaveBeenCalledOnce()
})

it("does not expose a resume for an application outside this job", async () => {
  expect((await GET(request("other-application"), context)).status).toBe(404)
  expect(mocks.getCandidateResume).not.toHaveBeenCalled()
  expect(mocks.close).toHaveBeenCalledOnce()
})

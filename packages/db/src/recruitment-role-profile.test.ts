import { it, expect } from "vitest"
import {
  defaultRoleQuestions,
  parseRoleQuestions,
  parseRoleProfile,
  roleProfileComplete,
} from "./recruitment-role-profile"
it("covers role, responsibility and authority with evidence prompts and confirmed delegation fields", () => {
  const questions = parseRoleQuestions(defaultRoleQuestions)
  expect(questions.map((q) => q.focus)).toEqual([
    "Role",
    "Responsibilities",
    "Authority",
  ])
  const profile = parseRoleProfile({
    purpose: "Inspection",
    reportsTo: "QA HOD",
    authority: "Hold suspect material",
    limits: "Release needs QA approval",
    escalation: "Notify QA HOD",
  })
  expect(roleProfileComplete(profile, "Check and record dimensions")).toBe(true)
  expect(roleProfileComplete({}, "Check dimensions")).toBe(false)
})
it("rejects a question bank missing authority coverage", () => {
  expect(() =>
    parseRoleQuestions(
      defaultRoleQuestions.filter((q) => q.focus !== "Authority")
    )
  ).toThrow("Authority question")
})

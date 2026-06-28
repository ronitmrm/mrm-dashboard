import { describe, expect, it } from "vitest";

import {
  browserImportPolicy,
  exportUnavailablePayload,
  maxBrowserImportRows,
} from "./dashboard-api-policy";

describe("dashboard API policy", () => {
  it("marks placeholder export endpoints as unavailable instead of successful", () => {
    expect(exportUnavailablePayload("data-export")).toEqual({
      status: 501,
      error: "Dashboard exports are not implemented yet. Use controlled workbook exports instead of placeholder files.",
    });
    expect(exportUnavailablePayload("export-workbook")).toEqual({
      status: 501,
      error: "Dashboard exports are not implemented yet. Use controlled workbook exports instead of placeholder files.",
    });
    expect(exportUnavailablePayload("dashboard")).toBeNull();
  });

  it("blocks browser imports above the bounded row limit", () => {
    expect(browserImportPolicy("route", maxBrowserImportRows)).toEqual({ ok: true });
    expect(browserImportPolicy("route", maxBrowserImportRows + 1)).toEqual({
      ok: false,
      status: 413,
      error: `Browser imports are limited to ${maxBrowserImportRows} rows. Use pnpm import:entry:dry-run followed by the controlled import script for bulk data.`,
    });
  });
});

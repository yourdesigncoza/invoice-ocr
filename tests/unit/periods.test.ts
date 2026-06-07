import { describe, it, expect } from "vitest";
import { bucketKey, bucketRange, rangeFor } from "@/lib/periods";

describe("bucketKey", () => {
  it("labels a week as a date range, not an ISO week number", () => {
    // 2026-07-15 is a Wednesday -> week is Mon 13 .. Sun 19 July
    expect(bucketKey("2026-07-15", "week")).toBe("Jul 13–19, 2026");
  });
  it("labels a cross-month week with both months", () => {
    // 2025-12-31 (Wed) -> Mon Dec 29 .. Sun Jan 4
    expect(bucketKey("2025-12-31", "week")).toBe("Dec 29 – Jan 4, 2026");
  });
  it("labels month / quarter / year", () => {
    expect(bucketKey("2026-05-27", "month")).toBe("May 2026");
    expect(bucketKey("2026-05-27", "quarter")).toBe("Q2 2026");
    expect(bucketKey("2026-05-27", "year")).toBe("2026");
  });
});

describe("bucketRange", () => {
  it("returns the Monday–Sunday window for a week", () => {
    expect(bucketRange("2026-07-15", "week")).toEqual({
      from: "2026-07-13",
      to: "2026-07-19",
    });
  });
  it("returns first–last day for a month", () => {
    expect(bucketRange("2026-05-27", "month")).toEqual({
      from: "2026-05-01",
      to: "2026-05-31",
    });
  });
  it("returns quarter bounds", () => {
    expect(bucketRange("2026-05-27", "quarter")).toEqual({
      from: "2026-04-01",
      to: "2026-06-30",
    });
  });
});

describe("rangeFor", () => {
  it("this_month relative to a reference date", () => {
    expect(rangeFor("this_month", new Date("2026-05-27"))).toEqual({
      from: "2026-05-01",
      to: "2026-05-31",
    });
  });
  it("all returns an open range", () => {
    expect(rangeFor("all", new Date("2026-05-27"))).toEqual({});
  });
});

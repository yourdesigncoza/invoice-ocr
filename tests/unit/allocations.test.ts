import { describe, it, expect } from "vitest";
import {
  defaultAllocation,
  deriveFromItems,
  manualSplit,
  sumsToTotal,
  type TaggableItem,
} from "@/lib/allocations/split";

const item = (id: string, line_total: number | null, project_id: string | null = null): TaggableItem =>
  ({ id, line_total, project_id });

const A = "site-a"; // default site in most tests
const B = "site-b";
const C = "site-c";

function entriesOf(r: ReturnType<typeof deriveFromItems>) {
  if (!r.ok) throw new Error(`expected ok, got: ${r.error}`);
  return r.entries;
}

describe("defaultAllocation", () => {
  it("mirrors the invoice site and total", () => {
    expect(defaultAllocation(A, 88.0)).toEqual([
      { project_id: A, amount: 88.0, source: "default" },
    ]);
  });
  it("no site → no rows; null total → 0 amount", () => {
    expect(defaultAllocation(null, 100)).toEqual([]);
    expect(defaultAllocation(A, null)[0].amount).toBe(0);
  });
});

describe("deriveFromItems — proportional gross-up", () => {
  it("3-way even split of 100.00 sums exactly (remainder to default)", () => {
    const items = [item("1", 10, B), item("2", 10, C), item("3", 10)];
    const entries = entriesOf(deriveFromItems(items, A, 100));
    expect(entries).toHaveLength(3);
    expect(sumsToTotal(entries, 100)).toBe(true);
    const b = entries.find((e) => e.project_id === B)!;
    const a = entries.find((e) => e.project_id === A)!;
    expect(b.amount).toBe(33.33);
    expect(a.amount).toBe(33.34); // default absorbs the cent
    expect(entries.every((e) => e.source === "items")).toBe(true);
  });

  it("18 items, 3 tagged → exceptions grossed up, default takes the rest", () => {
    const items: TaggableItem[] = [];
    for (let i = 0; i < 15; i++) items.push(item(`u${i}`, 10)); // 150 untagged
    items.push(item("t1", 20, B), item("t2", 20, B), item("t3", 10, B)); // 50 to B
    const total = 230.0; // items sum 200 ≠ total (VAT-incl total)
    const entries = entriesOf(deriveFromItems(items, A, total));
    expect(sumsToTotal(entries, total)).toBe(true);
    const b = entries.find((e) => e.project_id === B)!;
    expect(b.amount).toBe(57.5); // 50/200 × 230
  });

  it("item sums ≠ total: proportions applied to the invoice total", () => {
    const items = [item("1", 44.35, B), item("2", 44.35)];
    const entries = entriesOf(deriveFromItems(items, A, 102.0));
    expect(sumsToTotal(entries, 102.0)).toBe(true);
    expect(entries.find((e) => e.project_id === B)!.amount).toBe(51.0);
  });

  it("all items untagged → single default row", () => {
    const entries = entriesOf(deriveFromItems([item("1", 10), item("2", 5)], A, 20));
    expect(entries).toEqual([{ project_id: A, amount: 20, source: "default" }]);
  });

  it("tags equal to the default site count as untagged", () => {
    const entries = entriesOf(deriveFromItems([item("1", 10, A)], A, 20));
    expect(entries[0].source).toBe("default");
  });

  it("no items → default fallback", () => {
    const entries = entriesOf(deriveFromItems([], A, 50));
    expect(entries).toEqual([{ project_id: A, amount: 50, source: "default" }]);
  });

  it("negative Credit Note total splits and sums to the negative total", () => {
    const items = [item("1", 30, B), item("2", 70)];
    const entries = entriesOf(deriveFromItems(items, A, -500));
    expect(sumsToTotal(entries, -500)).toBe(true);
    expect(entries.find((e) => e.project_id === B)!.amount).toBe(-150);
    expect(entries.find((e) => e.project_id === A)!.amount).toBe(-350);
  });

  it("refuses mixed-sign weights (tagged site with net-negative sum)", () => {
    const r = deriveFromItems([item("1", -20, B), item("2", 120)], A, 100);
    expect(r.ok).toBe(false);
  });

  it("refuses zero/negative grand sum when tags exist", () => {
    expect(deriveFromItems([item("1", 0, B), item("2", 0)], A, 100).ok).toBe(false);
    expect(deriveFromItems([item("1", 50, B), item("2", -50)], A, 100).ok).toBe(false);
  });

  it("untagged negative discount line absorbed by default weight (net positive) derives normally", () => {
    const items = [item("1", 50, B), item("d", -10), item("2", 60)];
    const entries = entriesOf(deriveFromItems(items, A, 100));
    expect(sumsToTotal(entries, 100)).toBe(true);
    expect(entries.find((e) => e.project_id === B)!.amount).toBe(50); // 50/100 × 100
  });

  it("null total with tags → default fallback (no site → empty)", () => {
    expect(entriesOf(deriveFromItems([item("1", 10, B)], A, null))).toEqual([
      { project_id: A, amount: 0, source: "default" },
    ]);
    expect(entriesOf(deriveFromItems([item("1", 10, B)], null, null))).toEqual([]);
  });

  it("refuses partial tags when the invoice has no default site (untagged share must not fold into a tagged site)", () => {
    // Codex review finding: B=10 tagged, 90 untagged, no default site —
    // folding the 90 into B would persist B=100.
    const r = deriveFromItems([item("1", 10, B), item("2", 90)], null, 100);
    expect(r.ok).toBe(false);
  });

  it("all items tagged, no default site: remainder folds into largest-weight row", () => {
    const items = [item("1", 33.33, B), item("2", 66.67, C)];
    const entries = entriesOf(deriveFromItems(items, null, 100));
    expect(entries).toHaveLength(2);
    expect(sumsToTotal(entries, 100)).toBe(true);
  });

  it("null line_total items contribute zero weight without NaN", () => {
    const entries = entriesOf(deriveFromItems([item("1", null, B), item("2", 10, B), item("3", 10)], A, 40));
    expect(sumsToTotal(entries, 40)).toBe(true);
    expect(entries.every((e) => Number.isFinite(e.amount))).toBe(true);
  });
});

describe("manualSplit — amount fallback", () => {
  it("exception amount + remainder on default site", () => {
    const r = manualSplit([{ project_id: B, amount: 500 }], A, 1820);
    if (!r.ok) throw new Error(r.error);
    expect(sumsToTotal(r.entries, 1820)).toBe(true);
    expect(r.entries).toContainEqual({ project_id: A, amount: 1320, source: "manual" });
  });

  it("rejects amounts exceeding the total", () => {
    expect(manualSplit([{ project_id: B, amount: 2000 }], A, 1820).ok).toBe(false);
  });

  it("rejects the default site as an exception, duplicates, zero and wrong-sign amounts", () => {
    expect(manualSplit([{ project_id: A, amount: 5 }], A, 100).ok).toBe(false);
    expect(
      manualSplit([{ project_id: B, amount: 5 }, { project_id: B, amount: 5 }], A, 100).ok,
    ).toBe(false);
    expect(manualSplit([{ project_id: B, amount: 0 }], A, 100).ok).toBe(false);
    expect(manualSplit([{ project_id: B, amount: -5 }], A, 100).ok).toBe(false);
  });

  it("exact-total exceptions with null default site is ok; remainder with null default errors", () => {
    const exact = manualSplit(
      [{ project_id: B, amount: 60 }, { project_id: C, amount: 40 }],
      null,
      100,
    );
    expect(exact.ok).toBe(true);
    expect(manualSplit([{ project_id: B, amount: 60 }], null, 100).ok).toBe(false);
  });

  it("negative Credit Note total: negative exceptions, negative remainder", () => {
    const r = manualSplit([{ project_id: B, amount: -100 }], A, -500);
    if (!r.ok) throw new Error(r.error);
    expect(sumsToTotal(r.entries, -500)).toBe(true);
    expect(r.entries).toContainEqual({ project_id: A, amount: -400, source: "manual" });
    expect(manualSplit([{ project_id: B, amount: 100 }], A, -500).ok).toBe(false);
  });

  it("no exceptions → plain default allocation", () => {
    const r = manualSplit([], A, 100);
    if (!r.ok) throw new Error(r.error);
    expect(r.entries).toEqual([{ project_id: A, amount: 100, source: "default" }]);
  });

  it("null total refuses", () => {
    expect(manualSplit([{ project_id: B, amount: 5 }], A, null).ok).toBe(false);
  });
});

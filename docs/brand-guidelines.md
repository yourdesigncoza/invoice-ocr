# SpendSilo — Brand Guidelines

**SpendSilo** turns messy supplier invoices and receipts into clean, reviewed,
searchable spend data. The name and mark come from the core idea: every supplier
becomes its own **silo** of spend, stacked and organised.

> **Promise:** Snap a photo of an invoice. Review the extracted data. Get clean
> supplier spend reports by week, month, quarter, and year.

---

## 1. The mark

Three stacked rounded bars — **silos** of spend (blue, green, yellow). The stack
reads as organised, layered, and growing.

- Mark (transparent, for dark surfaces): `public/spendsilo_mark.png` — cropped
  from the master logo; used in the sidebar.
- Full lockup (mark + wordmark): `public/spendsilo_logo.png` (master).
- App / PWA icons: `public/icons/*`, `src/app/icon.png`, `src/app/apple-icon.png`
  (the mark composited on a white field).

**Clearspace:** keep at least the height of one bar of empty space around the mark.
**Minimum size:** 20px (mark) / readable wordmark above ~90px wide.

**Don't:** recolour the bars, reorder them, rotate the stack, add effects
(shadows/gradients beyond the logo's own), or place the white-field icon on a busy
photo. On dark surfaces the mark's colours stand on their own (no container needed).

---

## 2. Colour

### Brand colours — the three silos

| Token | Name | Hex | Use |
|---|---|---|---|
| `brand-blue` | Blue | **#30BCED** | Top silo; primary brand accent, highlights |
| `brand-green` | Green | **#4BD5B1** | Middle silo; positive / “captured” accents |
| `brand-yellow` | Yellow | **#FCBA04** | Bottom silo; attention / value accents |

Use brand colours for **identity and accents** — the mark, marketing, the odd
highlight. Keep the working UI calm (neutrals below); don't flood screens with the
brand trio.

### UI / neutral palette (PRD §10.1)

| Token | Hex | Use |
|---|---|---|
| `background` | #F8FAFC | App workspace background |
| `surface` | #FFFFFF | Cards, tables, inputs |
| `border` | #E2E8F0 | Hairline borders, dividers |
| `sidebar` / `foreground` | #0F172A | Navy sidebar, primary text/ink |
| `muted` | #64748B | Secondary text, labels |
| `primary` | #2563EB | Primary action (buttons, links) |
| `accent` | #06B6D4 | Cyan secondary accent |

### Status colours (PRD §10.2 — semantic, fixed)

| Status | Hex |
|---|---|
| Approved | #16A34A |
| Needs Review | #F59E0B |
| Low Confidence | #DC2626 |
| Duplicate | #EA580C |
| Processing | #3B82F6 |
| Rejected | #6B7280 |

All tokens are defined in `src/app/globals.css` (`:root` + `@theme`) and usable as
Tailwind utilities — e.g. `text-brand-blue`, `bg-brand-yellow`, `border-border`,
`bg-status-approved`. Status meta also lives in `src/lib/constants.ts`.

---

## 3. Typography

- **Typeface:** Inter (Google Fonts), loaded once in `src/app/layout.tsx`; the only
  font in the product (`--font-sans`).
- **Wordmark "SpendSilo":** Inter **Bold**, tight tracking.
- **UI:** Inter Regular/Medium for body and labels, Semibold for headings, tabular
  numerals for money/figures.

> The logo PNG wordmark is set in a heavier geometric display weight. To match it
> exactly in-app, a display font (e.g. Geist, Poppins, Space Grotesk) can be loaded
> for the wordmark only — optional.

---

## 4. UI direction

"Airtable structure + Xero polish + modern AI-tool clarity." Light off-white
workspace, dark navy sidebar, **flat** surfaces (1px borders, no drop shadows),
rounded corners, clean status badges, restrained chart colour. Avoid a cluttered
accounting-system feel and a neon startup palette.

---

## 5. Voice & tone

Plain, confident, and helpful. We speak to busy non-technical finance people:
short sentences, no jargon, action-first ("Take photo", "Open the review queue").
Trustworthy about money — we never overstate certainty; extraction is reviewed,
not assumed.

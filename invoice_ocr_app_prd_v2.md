# Invoice OCR & Supplier Spend Intelligence App

## Full Product Description & Product Requirements Document (PRD)

**Project type:** Internal business application  
**Primary purpose:** Extract, review, structure, and analyse fragmented invoice/receipt data  
**Recommended MVP approach:** Human-assisted OCR extraction  
**Recommended UX direction:** Airtable-style operational database UI + invoice review workflow + modern finance dashboard  
**Updated technical reference:** Lessons incorporated from the open-source `bhimrazy/receipt-ocr` project and Tesseract OCR pattern  

---

## 1. Executive Summary

The client receives invoices, receipts, cash slips, purchase notices, and supplier documents in inconsistent formats. These documents may arrive as WhatsApp photos, scanned images, PDFs, cropped photos, skewed images, handwritten notes, or thermal till slips.

The goal of this application is to convert these messy source documents into clean, structured, searchable invoice data. The system must extract key invoice information, allow a human user to review and correct the extracted data, group repeat suppliers into supplier “silos”, and present useful spend analytics by day, week, month, quarter, and year.

This is not simply an OCR tool. The real value is the operational intelligence layer: supplier grouping, duplicate detection, spend reporting, VAT summaries, and price trends over time.

---

## 2. Product Vision

To create a simple but powerful invoice intelligence system that turns messy supplier invoices and receipts into a trusted, searchable, time-based spend database.

The system should help the client answer questions such as:

- How much did we spend this week, month, quarter, or year?
- Which suppliers are we spending the most money with?
- Which invoices still need review?
- Are there possible duplicate invoices?
- Which suppliers repeat often?
- What VAT can be reported or reviewed?
- Are certain item prices increasing over time?
- Can we export clean invoice data to Excel or CSV?

---

## 3. Core MVP Principle

The MVP should follow a **human-assisted extraction model**.

The system should not immediately trust OCR output. Instead, it should:

1. Upload the document.
2. Extract text and structured fields using OCR/AI.
3. Assign confidence scores.
4. Show the original document and extracted data side by side.
5. Allow the user to correct the data.
6. Save only reviewed/approved data as trusted records.
7. Use approved records for dashboards and reports.

This approach is important because the sample invoices include:

- Thermal till slips
- Formal tax invoices
- Cropped images
- Skewed/rotated photos
- Partially covered documents
- Handwriting
- Repeat suppliers with inconsistent names
- Receipts that are not formal tax invoices
- Purchase notices, such as prepaid electricity
- Documents with missing or unclear VAT data

---

## 4. Recommended Technology Stack

### 4.1 MVP Stack

The first version should be built as a lightweight Python-based internal tool.

Recommended stack:

| Layer | Recommendation |
|---|---|
| App/UI | Streamlit first; Gradio acceptable for prototype; Next.js later only if needed |
| Core logic | Python extraction pipeline organised as reusable modules |
| Database | SQLite for prototype; PostgreSQL for production |
| File storage | Local storage for prototype; Supabase Storage or S3-compatible storage later |
| OCR baseline | Tesseract OCR for local raw text extraction and fallback testing |
| AI / vision extraction | OpenAI Vision, Gemini Vision, Google Document AI, Azure Document Intelligence, or AWS Textract |
| Structured extraction | LLM-based JSON extraction using strict schemas |
| Background processing | Simple Python queue first; Celery + Redis later if needed |
| Export | Excel / CSV |

### 4.2 Why Python First

Python is suitable because the app depends heavily on:

- OCR processing
- Image preprocessing
- AI extraction
- Data cleaning
- Fuzzy supplier matching
- Reporting and analytics
- Excel/CSV exports

A full API/backend can be added later if the product grows beyond an internal tool.

### 4.3 Technical Reference: Receipt OCR / Tesseract Pattern

The open-source `bhimrazy/receipt-ocr` project confirms a useful architecture for this product: split extraction into a **raw OCR layer** and a **structured data extraction layer**.

Reference patterns to adopt:

| Pattern | What to learn | How to apply in this app |
|---|---|---|
| Separate Tesseract OCR module | Tesseract is useful for raw text extraction, not final invoice intelligence | Use Tesseract as a local baseline/fallback and debugging tool |
| LLM-powered receipt processor | Raw OCR text/images can be converted into structured JSON | Use strict invoice schemas for supplier, totals, VAT, dates, line items, and warnings |
| CLI-first workflow | Extraction can be tested before building the full UI | Build `extract_invoice.py` to test real client invoices from the terminal |
| Programmatic processor class | Extraction logic should be reusable from CLI, UI, or future API | Create a reusable `InvoiceProcessor` class |
| Provider abstraction | Multiple LLM providers can be swapped with compatible interfaces | Support OpenAI first, but design for Gemini/Azure/Document AI later |
| Response format options | Different providers may support JSON object, JSON schema, or plain text | Prefer strict JSON schema where available; fallback to JSON object with validation |
| Docker service pattern | OCR/extraction can later run as a service | Keep API deployment as Phase 2/3, not MVP dependency |
| Troubleshooting rules | Poor image quality causes poor OCR | Add preprocessing and low-quality image warnings |

Important decision:

> The repo is a useful extraction reference, but this product must not become only a receipt OCR clone. The client app needs storage, review workflow, supplier matching, duplicate detection, dashboards, and exports.

### 4.4 Proposed Extraction Pipeline

Recommended pipeline:

```text
Uploaded File
    ↓
File Validation
    ↓
Image/PDF Preprocessing
    ↓
Raw OCR Pass
    ↓
Vision/LLM Structured Extraction
    ↓
JSON Schema Validation
    ↓
Business Rule Validation
    ↓
Confidence + Warning Generation
    ↓
Human Review Queue
    ↓
Approved Invoice Record
```

### 4.5 Image/PDF Preprocessing Requirements

Before OCR/AI extraction, the system should attempt to improve the uploaded file.

Required preprocessing steps:

- Convert PDFs into page images.
- Auto-rotate images where possible.
- Deskew photographed receipts.
- Crop to likely document boundaries where possible.
- Convert to grayscale for Tesseract/raw OCR testing.
- Improve contrast for faded thermal slips.
- Detect blur or poor image quality.
- Preserve the original uploaded file untouched.

The system must always keep both:

```text
original_file_path
processed_file_path
```

This allows later debugging when extraction fails.

### 4.6 Recommended Python Module Structure

Suggested internal structure:

```text
app/
  main.py                         # Streamlit app entry point
  pages/
    upload.py
    review_queue.py
    invoices.py
    suppliers.py
    dashboard.py
    reports.py

invoice_engine/
  __init__.py
  processor.py                    # Main InvoiceProcessor class
  schemas.py                      # JSON schemas / Pydantic models
  preprocessing.py                # rotate, deskew, contrast, PDF-to-image
  ocr_tesseract.py                # raw Tesseract OCR wrapper
  vision_extractors.py            # OpenAI/Gemini/Document AI wrappers
  validators.py                   # VAT, totals, dates, required fields
  supplier_matching.py            # fuzzy matching and supplier suggestions
  duplicate_detection.py          # duplicate scoring
  confidence.py                   # field and document confidence scoring
  exporters.py                    # Excel/CSV export helpers

database/
  models.py
  migrations/
  seed_data.py

tests/
  sample_invoices/
  test_extraction.py
  test_supplier_matching.py
  test_duplicate_detection.py
  test_vat_validation.py
```

### 4.7 CLI Extraction Prototype

Before building too much UI, create a CLI test command:

```bash
python extract_invoice.py ./samples/invoice_001.jpg
```

Expected output:

```json
{
  "document_type": "Receipt",
  "supplier": {
    "raw_name": "Kekkel en Kraai",
    "normalized_name": "Kekkel en Kraai",
    "match_confidence": 0.94
  },
  "invoice": {
    "invoice_number": "135790",
    "invoice_date": "2026-05-27",
    "total_incl_vat": 335.37,
    "vat_amount": 43.74,
    "currency_code": "ZAR"
  },
  "line_items": [],
  "warnings": [
    "Thermal receipt format",
    "Line items not fully reliable"
  ],
  "needs_review": true
}
```

This gives a practical development loop:

```text
Test extraction on real invoice sample
↓
Inspect JSON
↓
Improve schema/prompt/preprocessing
↓
Retest
↓
Only then wire into the review UI
```

### 4.8 Tesseract Role in This Product

Tesseract should be used carefully.

Recommended use:

- Cheap local OCR baseline.
- Debugging raw text extraction.
- Fallback when vision API is unavailable.
- Optional comparison against AI/vision output.
- Extracting searchable raw text for database indexing.

Not recommended:

- Do not rely on Tesseract alone for final invoice fields.
- Do not automatically approve invoices based only on Tesseract output.
- Do not expect high accuracy on skewed WhatsApp photos, handwriting, faded thermal slips, or cropped invoices.

The final extraction should come from a structured AI/vision layer plus human review.

### 4.9 Provider Strategy

Use provider abstraction from the start.

Phase 1 provider stack:

```text
Primary: OpenAI Vision / structured extraction
Baseline/Fallback: Tesseract OCR
Manual correction: Human review screen
```

Future provider options:

```text
Gemini Vision
Google Document AI
Azure Document Intelligence
AWS Textract
Local OCR/LLM experiments
```

The processor should expose one clean method regardless of provider:

```python
result = processor.process_invoice(
    file_path="invoice.jpg",
    extraction_schema=invoice_schema,
    provider="openai_vision"
)
```

---

## 5. Users & Roles

### 5.1 Admin User

Can:

- Upload documents
- Review extracted invoices
- Approve/reject invoices
- Manage suppliers
- Merge duplicate suppliers
- Export reports
- View dashboards
- Edit system settings

### 5.2 Reviewer / Data Capturer

Can:

- Upload invoices
- Review extracted fields
- Correct invoice data
- Link supplier records
- Mark duplicates
- Approve invoices

### 5.3 Management User

Can:

- View dashboards
- Filter reports by date/supplier/status
- Export summaries
- View supplier spend trends

---

## 6. Main Workflow

```text
Upload Documents
    ↓
OCR / AI Extraction
    ↓
Structured JSON Output
    ↓
Confidence Scoring
    ↓
Human Review Screen
    ↓
Supplier Matching / Creation
    ↓
Approve Invoice
    ↓
Save to Database
    ↓
Dashboard / Reports / Export
```

---

## 7. Core Features

## 7.1 Document Upload

The system must allow users to upload invoice documents.

### Supported file types

- JPG
- PNG
- PDF
- Scanned image files
- Mobile phone photos

### Upload modes

- Single document upload
- Batch upload
- Drag-and-drop upload

### Future upload sources

- Email inbox ingestion
- WhatsApp/photo mobile upload
- Supplier portal upload
- Accounting system import

---

## 7.2 OCR & AI Extraction

The system must extract invoice data from uploaded documents.

### Required extracted fields

| Field | Description |
|---|---|
| supplier_name_raw | Supplier name as detected from document |
| supplier_name_normalized | Cleaned supplier name |
| invoice_number | Invoice number, receipt number, or transaction number |
| invoice_date | Main invoice/transaction date |
| due_date | Due date, if available |
| document_type | Tax Invoice, Receipt, Purchase Notice, Cash Sale, Statement, Unknown |
| subtotal_excl_vat | Subtotal excluding VAT, if available |
| vat_amount | VAT amount, if available |
| total_incl_vat | Total amount payable/paid |
| payment_method | Cash, Card, EFT, Account, COD, Unknown |
| vat_number | Supplier VAT number, if available |
| address | Supplier address, if available |
| banking_details | Supplier bank details, if available |
| po_number | Purchase order number, if available |
| reference_number | Any other reference number |
| confidence_score | Overall extraction confidence |

### Optional line-item fields

| Field | Description |
|---|---|
| description | Item/service description |
| quantity | Quantity purchased |
| unit_price | Unit price |
| line_total | Total for that line |
| vat_rate | VAT rate, if detected |
| category | Optional manual or AI-suggested category |

---

## 7.3 Structured JSON Output

The extraction layer should return structured JSON before data is saved.

Example:

```json
{
  "document_type": "Receipt",
  "supplier": {
    "raw_name": "Hartenbos Spar & Tops",
    "normalized_name": "SPAR Hartenbos",
    "vat_number": null,
    "address": null
  },
  "invoice": {
    "invoice_number": "277/006779",
    "invoice_date": "2026-05-27",
    "subtotal_excl_vat": null,
    "vat_amount": null,
    "total_incl_vat": 231.90,
    "payment_method": "Card",
    "confidence_score": 0.88
  },
  "line_items": [
    {
      "description": "Carrier Bag",
      "quantity": 1,
      "unit_price": 2.00,
      "line_total": 2.00
    }
  ],
  "warnings": [
    "VAT amount not clearly detected",
    "Thermal receipt format"
  ]
}
```

---

## 7.3.1 Strict JSON Schema Requirements

The extraction layer must return predictable JSON. The app should reject malformed extraction output before it reaches the approval workflow.

Minimum schema rules:

- Required invoice object even when fields are unknown.
- Use `null` instead of invented values.
- Store confidence at document level and important field level.
- Store warnings as an array.
- Preserve raw OCR text separately from structured JSON.
- Validate money fields as numbers, not strings.
- Validate dates into ISO format where possible: `YYYY-MM-DD`.
- Keep the original detected value where normalisation changed the value.

Example field-confidence pattern:

```json
{
  "invoice_date": {
    "value": "2026-05-27",
    "raw_value": "27/05/26",
    "confidence": 0.91
  },
  "total_incl_vat": {
    "value": 335.37,
    "raw_value": "R335.37",
    "confidence": 0.97
  }
}
```

For the MVP UI, the user does not need to see all of this JSON complexity. The review screen should show the clean value, confidence, and warnings.

## 7.3.2 Business Rule Validation

After JSON extraction, the system must run deterministic checks before showing the invoice for review.

Required validation checks:

- Total amount exists.
- Invoice date exists or is flagged as missing.
- Supplier name exists or is flagged as missing.
- VAT calculation reconciles where subtotal and VAT are present.
- Invoice number exists for formal invoices or is flagged as missing.
- Currency defaults to `ZAR` unless another currency is detected.
- Negative totals are rejected unless document type is credit note/refund.
- Suspiciously high or low totals are flagged.
- Duplicate risk is calculated before approval.

Validation output should become user-friendly warnings in the review screen.

---

## 7.4 Human Review Screen

This is the most important MVP screen.

### Layout

```text
Left side: Original invoice image/PDF preview
Right side: Editable extracted invoice fields
Bottom/right: Approval actions
```

### Review table example

| Field | Extracted Value | Confidence | Action |
|---|---:|---:|---|
| Supplier | Hartenbos Spar & Tops | 92% | Edit |
| Invoice Date | 2026-05-27 | 96% | Edit |
| Invoice No | 277/006779 | 88% | Edit |
| Total | R231.90 | 97% | Edit |
| VAT | Unknown | 61% | Edit |
| Payment Method | Card | 84% | Edit |

### Required actions

- Save changes
- Approve invoice
- Mark as duplicate
- Reject document
- Mark as not an invoice
- Link to existing supplier
- Create new supplier
- Send back to review queue

### Review status values

- Processing
- Needs Review
- Approved
- Rejected
- Duplicate
- Low Confidence
- Not Invoice

---

## 7.5 Supplier Matching & Supplier Silos

The system must group repeat suppliers into supplier records.

This is important because the same supplier can appear under different names, such as:

```text
SPAR
Hartenbos Spar
Hartenbos Spar & Tops
Retail Spar Hartenbos
```

### Supplier matching logic

The system should compare detected supplier names against existing suppliers using:

- Exact match
- Normalized name match
- Fuzzy string matching
- VAT number match
- Phone number match
- Address similarity
- Historical user-approved matches

### Supplier matching UX

Example:

```text
Detected supplier: Hartenbos Spar & Tops
Suggested existing supplier: SPAR Hartenbos
Confidence: 91%

[Link to Existing Supplier] [Create New Supplier] [Search Supplier]
```

### Supplier profile / silo

Each supplier should have its own profile page with:

- Supplier name
- Normalized name
- VAT number
- Contact details
- Address
- Total spend
- Invoice count
- Average invoice value
- Last invoice date
- Spend by week/month/year
- Related invoices
- Related line items
- Duplicate warnings

---

## 7.6 Invoice Register

The invoice register should use an Airtable-style table interface.

Example columns:

| Status | Date | Supplier | Invoice No | Type | Total | VAT | Confidence | File |
|---|---|---|---|---|---:|---:|---:|---|
| Needs Review | 2026-05-27 | Kekkel en Kraai | 135790 | Receipt | R335.37 | R43.74 | 82% | View |
| Approved | 2026-05-26 | STAT Warehouse | INV292093 | Tax Invoice | R88.00 | R11.48 | 96% | View |

### Required views

- All Invoices
- Needs Review
- Approved
- Possible Duplicates
- Low Confidence
- This Week
- This Month
- By Supplier
- VAT Review
- Rejected

### Required filters

- Date range
- Supplier
- Document type
- Status
- Amount range
- VAT/no VAT
- Payment method
- Confidence score
- Duplicate warning

---

## 7.7 Dashboard & Reporting

The dashboard must organise data by time period and supplier.

### Main dashboard filters

```text
Period: Today | This Week | This Month | This Quarter | This Year | Custom Range
Group by: Day | Week | Month | Quarter | Year
Supplier: All / Selected Supplier
Document Type: Invoice / Receipt / Tax Invoice / Purchase Notice / Unknown
Status: Approved / Needs Review / Rejected / Duplicate
Payment Method: Cash / Card / EFT / Account / Unknown
```

### Main KPI cards

| Metric | Description |
|---|---|
| Total Spend | Total approved invoice value for selected period |
| Total VAT | VAT captured for selected period |
| Invoice Count | Number of processed invoices/receipts |
| Average Invoice Value | Total spend divided by invoice count |
| Pending Review | Documents waiting for review |
| Duplicate Warnings | Possible duplicate invoices |
| Top Supplier | Supplier with highest spend |
| Unmatched Suppliers | Suppliers not yet linked/siloed |

---

## 7.8 Time-Based Dashboard Views

### Daily View

Useful for cashflow and recent uploads.

| Date | Spend | VAT | Invoice Count | Pending Review |
|---|---:|---:|---:|---:|
| 2026-05-27 | R4,250.00 | R553.00 | 14 | 3 |

### Weekly View

Useful for operational spend.

| Week | Spend | VAT | Invoice Count | Top Supplier |
|---|---:|---:|---:|---|
| Week 21, 2026 | R12,450.00 | R1,623.91 | 38 | SPAR Hartenbos |

### Monthly View

Useful for management reporting.

| Month | Spend | VAT | Invoice Count | Top Supplier |
|---|---:|---:|---:|---|
| May 2026 | R48,920.00 | R5,840.00 | 124 | STAT Warehouse |
| June 2026 | R52,300.00 | R6,110.00 | 139 | Gasta’s Foods |

### Quarterly View

Useful for finance summaries.

| Quarter | Spend | VAT | Suppliers | Invoices |
|---|---:|---:|---:|---:|
| Q2 2026 | R146,750.00 | R18,450.00 | 42 | 391 |

### Yearly View

Useful for long-term trends.

| Year | Spend | VAT | Suppliers | Invoices |
|---|---:|---:|---:|---:|
| 2026 | R612,000.00 | R73,400.00 | 42 | 1,480 |

---

## 7.9 Supplier Dashboard

Each supplier needs a dedicated analytics page.

Example: **SPAR Hartenbos**

```text
Total Spend This Month: R4,920.00
Invoices: 18
Average Invoice: R273.33
VAT Captured: R641.74
Last Invoice: 27 May 2026
Most Bought Item: Carrier Bag
```

### Supplier dashboard tabs

- Overview
- Invoices
- Items Bought
- Monthly Trends
- Possible Duplicates
- Supplier Details

### Supplier period table

| Period | Invoice Count | Spend | VAT |
|---|---:|---:|---:|
| Week 22 | 7 | R1,824.32 | R214.80 |
| May 2026 | 18 | R4,920.00 | R641.74 |

### Item trend table

| Item | Qty Bought | Avg Price | Last Price | Price Change |
|---|---:|---:|---:|---:|
| Carrier Bag | 12 | R2.00 | R2.00 | 0% |
| Fillet <10kg | 7.44kg | R78.00/kg | R78.07/kg | +4.8% |

---

## 7.10 Duplicate Detection

The system must flag possible duplicate invoices.

### Duplicate matching rules

Primary duplicate check:

```text
Supplier + Invoice Number + Date + Total
```

Fallback duplicate check when invoice number is missing:

```text
Supplier + Date + Total + Image Similarity
```

### Duplicate warning example

```text
Possible duplicate detected:
Supplier: Absa Prepaid Electricity
Date: 2026-05-23
Total: R850.00
Reason: Same supplier, same date, same total
```

### Duplicate actions

- Confirm duplicate
- Keep both
- Merge records
- Reject duplicate upload

---

## 7.11 VAT Handling

VAT must be treated carefully because not all documents have clean VAT information.

### VAT fields

```text
subtotal_excl_vat
vat_amount
total_incl_vat
vat_rate
vat_detected: yes/no/unknown
vat_confidence
vat_warning
```

### VAT validation rules

The system should flag:

- Missing VAT amount
- VAT amount does not reconcile with total
- VAT number missing on tax invoice
- Document marked as tax invoice but VAT is unclear
- Total does not equal subtotal plus VAT

Example warning:

```text
VAT check failed: Total does not equal subtotal + VAT.
Manual review required.
```

---

## 7.12 Exporting

The system must support exports for reporting and bookkeeping.

### Required export formats

- Excel
- CSV

### Export types

- All approved invoices
- Filtered invoice list
- Supplier spend summary
- VAT summary
- Weekly report
- Monthly report
- Yearly report
- Duplicate report
- Pending review report

### Optional future exports

- PDF management summary
- Accounting software import file
- API export

---

## 8. Real-World Edge Cases

## 8.1 Bad Photos

Some invoices will be skewed, blurred, cropped, covered, or rotated.

The system should flag these as low confidence and require manual review.

Possible warning reasons:

- Image blurred
- Image cropped
- Total not found
- Supplier not found
- Date not found
- Handwriting detected
- Low OCR confidence

---

## 8.2 Handwritten Invoices

Handwritten invoices must never be assumed accurate.

The system should extract whatever it can and mark the document as:

```text
Handwriting detected. Manual review required.
```

---

## 8.3 Multiple Dates on One Document

Invoices may contain:

- Invoice date
- Transaction date
- Delivery date
- Printed date
- Due date

The system should store all detected dates where possible but use **invoice_date** as the primary reporting date.

---

## 8.4 Receipts vs Formal Tax Invoices

Not all uploaded documents will be formal invoices.

Document types should include:

- Tax Invoice
- Receipt
- Cash Sale
- Purchase Notice
- Prepaid Electricity
- Statement
- Unknown
- Not Invoice

This matters for VAT and reporting.

---

## 8.5 Same Supplier, Multiple Branches

Some suppliers may have different branches.

Example:

```text
SPAR Hartenbos
SPAR Mossel Bay
SPAR George
```

The system should allow either:

- Treat branches as separate suppliers, or
- Group them under a parent supplier.

Recommended database approach:

```text
Parent Supplier: SPAR
Branch Supplier: SPAR Hartenbos
```

This can be a Phase 2 feature unless needed immediately.

---

## 8.6 Missing Invoice Numbers

Till slips and receipts may not have clear invoice numbers.

The system should allow invoice_number to be blank but use fallback duplicate detection.

---

## 8.7 Paid vs Unpaid Documents

Some documents are receipts already paid. Others are supplier invoices still owing.

Payment status should support:

- Paid
- Unpaid
- Unknown
- COD
- Account

Payment method should support:

- Cash
- Card
- EFT
- Account
- Unknown

---

## 8.8 Multi-Page Documents

Some invoices may have multiple pages.

The system should support:

- Multi-page PDF upload
- Page-level OCR
- Combined extraction result
- Document preview by page

---

## 8.9 Foreign Currency

The MVP can default to South African Rand, but the schema should support currency.

Recommended field:

```text
currency_code: ZAR
```

Future support:

- USD
- EUR
- GBP
- Other currencies

---

## 9. UX / UI Direction

## 9.1 Overall UX Style

The interface should feel like:

```text
Airtable structure + Xero polish + modern AI tool clarity
```

The application should use an Airtable-inspired operational database interface, combined with a dedicated invoice review workflow.

The UX must prioritise:

- Fast document review
- Easy correction
- Supplier matching
- Duplicate detection
- Searchable invoice records
- Time-based reporting
- Clean Excel/CSV export

---

## 9.2 Main Navigation

Recommended left sidebar:

```text
Dashboard
Upload
Review Queue
Invoices
Suppliers
Duplicates
Reports
Exports
Settings
```

---

## 9.3 Core Screens

### Screen 1: Dashboard

Purpose: High-level overview of spend, VAT, pending reviews, and duplicate warnings.

### Screen 2: Upload

Purpose: Upload invoice images/PDFs.

### Screen 3: Review Queue

Purpose: Review OCR/AI extraction results before approval.

### Screen 4: Invoice Register

Purpose: Airtable-style invoice table with views, filters, and search.

### Screen 5: Supplier Profiles

Purpose: Supplier-level spend silos and trends.

### Screen 6: Duplicates

Purpose: Review and resolve possible duplicates.

### Screen 7: Reports

Purpose: Weekly/monthly/yearly reports.

### Screen 8: Exports

Purpose: Export data to Excel/CSV.

### Screen 9: Settings

Purpose: Manage document types, supplier categories, confidence thresholds, and export options.

---

## 10. Modern UI Colour Profile

The UI should be modern, clean, and suitable for a financial operations product.

### 10.1 Primary Palette

| Purpose | Colour | Hex |
|---|---|---|
| Background | Soft off-white | `#F8FAFC` |
| Surface / Cards | White | `#FFFFFF` |
| Border | Light slate | `#E2E8F0` |
| Primary Navigation | Deep slate/navy | `#0F172A` |
| Secondary Text | Muted slate | `#64748B` |
| Primary Action | Modern blue | `#2563EB` |
| Secondary Accent | Cyan | `#06B6D4` |

### 10.2 Status Colours

| Status | Colour | Hex |
|---|---|---|
| Approved | Green | `#16A34A` |
| Needs Review | Amber | `#F59E0B` |
| Low Confidence | Red | `#DC2626` |
| Duplicate | Orange | `#EA580C` |
| Processing | Blue | `#3B82F6` |
| Rejected | Grey | `#6B7280` |

### 10.3 UI Style Rules

- Light workspace
- Dark navy sidebar
- White cards and tables
- Subtle borders
- Rounded corners
- Clean status badges
- Minimal chart colours
- No cluttered accounting-system feel
- No playful/neon startup palette
- Use professional fonts such as Inter, Geist, or IBM Plex Sans

---

## 11. Data Model

## 11.1 suppliers

```text
id
supplier_name
normalized_name
parent_supplier_id
vat_number
phone
email
address
category
created_at
updated_at
```

## 11.2 invoices

```text
id
supplier_id
original_supplier_name
invoice_number
invoice_date
due_date
document_type
subtotal_excl_vat
vat_amount
total_incl_vat
currency_code
payment_status
payment_method
po_number
reference_number
confidence_score
status
original_file_path
created_at
updated_at
approved_at
approved_by
```

## 11.3 invoice_items

```text
id
invoice_id
description
quantity
unit_price
line_total
vat_rate
category
created_at
updated_at
```

## 11.4 document_uploads

```text
id
file_name
file_path
file_type
file_size
upload_status
uploaded_by
created_at
```

## 11.5 extraction_logs

```text
id
document_upload_id
invoice_id
provider_name
provider_model
raw_ocr_text
extracted_json
validated_json
confidence_score
warnings
errors
processing_duration_ms
created_at
```

## 11.5.1 extraction_fields

Optional but recommended for polished review UX and auditability.

```text
id
invoice_id
field_name
raw_value
normalized_value
confidence_score
source_type              # ocr / vision / manual
was_manually_corrected
corrected_by
created_at
updated_at
```

This allows the system to learn which fields are commonly corrected and where extraction quality is poor.

## 11.6 duplicate_checks

```text
id
invoice_id
possible_duplicate_invoice_id
match_score
match_reason
status
created_at
resolved_at
resolved_by
```

## 11.7 audit_logs

```text
id
user_id
action
entity_type
entity_id
old_value
new_value
created_at
```

---

## 12. Confidence Scoring

The system should calculate an overall confidence score based on:

- OCR clarity
- Supplier detection
- Date detection
- Invoice number detection
- Total amount detection
- VAT detection
- Supplier match confidence
- Duplicate risk

Suggested confidence thresholds:

| Score | Meaning | Action |
|---:|---|---|
| 90–100% | High confidence | Can be approved quickly |
| 70–89% | Medium confidence | Review required |
| Below 70% | Low confidence | Manual correction required |

No invoice should be treated as trusted until approved.

---

## 12.1 Extraction Quality Evaluation

The development team should create a small gold-standard test set from the client’s real invoices.

Recommended process:

1. Collect 30–50 representative invoice/receipt samples.
2. Manually capture the correct supplier, date, total, VAT, document type, and invoice number.
3. Run each extraction version against the test set.
4. Measure accuracy field by field.
5. Improve preprocessing, prompt/schema, provider selection, and validation rules.

Track these metrics:

| Metric | Target for MVP |
|---|---:|
| Supplier detected correctly | 85%+ before human correction |
| Total amount detected correctly | 90%+ before human correction |
| Invoice date detected correctly | 80%+ before human correction |
| Document type classified correctly | 80%+ before human correction |
| VAT detected/reconciled where present | 75%+ before human correction |
| Duplicate warnings on obvious duplicates | 90%+ |

These targets are not approval automation targets. They are extraction-quality targets before human review.

## 12.2 Regression Test Requirement

Every time the extraction prompt, schema, preprocessing, or provider changes, the team should rerun the sample invoice test set.

The app should avoid improving one invoice type while breaking another. The test set should include:

- Thermal till slips
- Formal A4 tax invoices
- Cropped WhatsApp photos
- Skewed photos
- Purchase notices
- Receipts with missing VAT
- Repeat suppliers
- Handwritten/partly handwritten documents

---

## 13. Non-Functional Requirements

## 13.1 Usability

The app must be simple enough for non-technical users.

Key usability requirements:

- Fast upload flow
- Clear review screen
- Editable fields
- Obvious status badges
- Search and filters
- Easy export
- Minimal clicks for approval

## 13.2 Performance

MVP should handle:

- 1–50 invoices per batch
- Hundreds to thousands of invoice records
- Fast filtering/searching of approved invoices

## 13.3 Reliability

The system should:

- Store original documents
- Store raw OCR text
- Store extracted JSON
- Keep audit logs of manual corrections
- Avoid deleting approved financial records accidentally

## 13.4 Security

For MVP/internal use:

- Login required
- Role-based access where practical
- File access restricted to authenticated users
- Database backups recommended

## 13.5 Data Quality

The system should clearly separate:

- Extracted/unreviewed data
- Corrected data
- Approved/trusted data

Dashboards should preferably use only approved invoices by default.

---

## 14. MVP Scope

## 14.1 Included in MVP

- Upload invoice images/PDFs
- OCR/AI extraction
- Structured JSON extraction
- Human review screen
- Supplier matching
- Supplier creation
- Invoice approval workflow
- Invoice register
- Basic supplier dashboard
- Weekly/monthly/yearly filtering
- Duplicate warnings
- Excel/CSV export
- Status badges and confidence scores

## 14.2 Excluded from MVP

- Full accounting software integration
- Automated payment reconciliation
- Bank statement matching
- WhatsApp direct ingestion
- Email inbox ingestion
- Advanced line-item price intelligence
- Multi-company tenant management
- Mobile app
- Fully automatic approval

---

## 15. Phase 2 Features

- Line-item extraction improvements
- Supplier parent/branch grouping
- Price trend analysis
- VAT reconciliation reports
- Email inbox ingestion
- WhatsApp/mobile upload flow
- Advanced duplicate image similarity
- Supplier category reporting
- Scheduled monthly reports
- User permissions and team roles
- PostgreSQL migration if MVP starts with SQLite

---

## 16. Phase 3 Features

- Accounting software integration
- API access
- Multi-client SaaS structure
- Automated supplier statement reconciliation
- Budget vs actual reporting
- Purchase order matching
- Predictive supplier spend alerts
- Anomaly detection
- Mobile capture app
- Role-based finance approval chains

---

## 17. Success Criteria

The MVP should be considered successful if:

- Users can upload messy invoice images and extract usable data.
- Users can review and correct extracted fields easily.
- Approved invoices are saved into a clean invoice register.
- Repeat suppliers are grouped correctly.
- The dashboard can show spend by week, month, quarter, and year.
- Duplicate invoices are flagged before approval.
- The client can export clean data to Excel/CSV.
- The client trusts the system more than manual folder/photo storage.

---

## 18. Recommended MVP Build Order

### Step 1: Data model and file upload

Build upload storage and basic database tables.

### Step 2: CLI extraction prototype

Build a command-line extraction workflow first so real sample invoices can be tested quickly without UI friction.

### Step 3: OCR/AI extraction prototype

Implement preprocessing, Tesseract raw OCR baseline, AI/vision structured extraction, schema validation, confidence scoring, and warnings.

### Step 4: Review screen

Build the split-screen invoice review interface.

### Step 5: Supplier matching

Add supplier creation and fuzzy matching.

### Step 6: Invoice register

Build Airtable-style invoice table and filters.

### Step 7: Dashboard

Add KPI cards, time filters, and supplier spend summaries.

### Step 8: Export

Add Excel/CSV export.

### Step 9: Edge-case hardening

Add duplicate warnings, low-confidence flags, VAT warnings, and audit logs.

---

## 19. Suggested MVP User Journey

```text
1. User opens the app.
2. User uploads 10 invoice photos.
3. App processes documents.
4. Documents appear in Review Queue.
5. User opens first document.
6. Original invoice appears on the left.
7. Extracted fields appear on the right.
8. App suggests supplier match.
9. User corrects total/VAT/date if needed.
10. User approves invoice.
11. Invoice appears in Invoice Register.
12. Supplier profile updates automatically.
13. Dashboard updates weekly/monthly/yearly totals.
14. User exports monthly report to Excel.
```

---

## 20. Final Product Positioning

The product should be positioned as:

> A modern invoice capture and supplier spend intelligence tool that converts messy invoice photos, receipts, and supplier documents into clean, reviewed, searchable financial data.

The core product promise:

> Upload messy invoices. Review the extracted data. Get clean supplier spend reports by week, month, quarter, and year.



---

## 21. Technical References Used

This PRD incorporates architecture lessons from:

- `bhimrazy/receipt-ocr` — open-source receipt OCR project demonstrating a split between raw Tesseract OCR and LLM-based structured JSON extraction.
- `tesseract-ocr/tesseract` — open-source OCR engine suitable as a local raw OCR baseline/fallback.

These are references only. The client product should be built as a custom invoice intelligence system with review workflow, supplier grouping, dashboarding, duplicate detection, and exports.

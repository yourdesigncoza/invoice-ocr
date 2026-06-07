// DB row shapes (PRD §11). These match supabase/migrations/0001_init.sql.
import type {
  InvoiceStatus,
  DocumentType,
  PaymentMethod,
  PaymentStatus,
} from "./constants";

export interface Supplier {
  id: string;
  supplier_name: string;
  normalized_name: string;
  parent_supplier_id: string | null;
  vat_number: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  category: string | null;
  created_at: string;
  updated_at: string;
}

export interface Project {
  id: string;
  name: string;
  color: string | null;
  archived: boolean;
  created_at: string;
  updated_at: string;
}

export interface Invoice {
  id: string;
  supplier_id: string | null;
  project_id: string | null;
  original_supplier_name: string | null;
  invoice_number: string | null;
  invoice_date: string | null; // ISO YYYY-MM-DD
  due_date: string | null;
  document_type: DocumentType;
  subtotal_excl_vat: number | null;
  vat_amount: number | null;
  total_incl_vat: number | null;
  currency_code: string;
  payment_status: PaymentStatus | null;
  payment_method: PaymentMethod | null;
  po_number: string | null;
  reference_number: string | null;
  vat_number: string | null;
  address: string | null;
  phone: string | null;
  confidence_score: number | null;
  status: InvoiceStatus;
  warnings: string[];
  original_file_path: string | null;
  processed_file_path: string | null;
  created_at: string;
  updated_at: string;
  approved_at: string | null;
  approved_by: string | null;
}

export interface InvoiceItem {
  id: string;
  invoice_id: string;
  description: string | null;
  quantity: number | null;
  unit_price: number | null;
  line_total: number | null;
  vat_rate: number | null;
  category: string | null;
  created_at: string;
  updated_at: string;
}

export interface DocumentUpload {
  id: string;
  file_name: string;
  file_path: string;
  file_type: string | null;
  file_size: number | null;
  upload_status: string;
  uploaded_by: string | null;
  invoice_id: string | null;
  created_at: string;
}

export interface ExtractionLog {
  id: string;
  document_upload_id: string | null;
  invoice_id: string | null;
  provider_name: string;
  provider_model: string | null;
  raw_ocr_text: string | null;
  extracted_json: unknown;
  validated_json: unknown;
  confidence_score: number | null;
  warnings: string[];
  errors: string[];
  processing_duration_ms: number | null;
  created_at: string;
}

export interface DuplicateCheck {
  id: string;
  invoice_id: string;
  possible_duplicate_invoice_id: string;
  match_score: number;
  match_reason: string;
  status: string;
  created_at: string;
  resolved_at: string | null;
  resolved_by: string | null;
}

// Joined shape used by the register & review screens
export type InvoiceWithSupplier = Invoice & {
  supplier: Supplier | null;
  project?: Project | null;
  // count of open duplicate_checks flagging this invoice (system-detected)
  duplicate_count?: number;
};

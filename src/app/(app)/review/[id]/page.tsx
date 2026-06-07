import { notFound } from "next/navigation";
import { getInvoice, isSupabaseConfigured } from "@/lib/data";
import { createServerSupabase } from "@/lib/supabase/server";
import { findSupplierMatches } from "@/lib/suppliers/matching";
import { STORAGE_BUCKET } from "@/lib/constants";
import { PageHeader, NotConfigured } from "@/components/ui";
import { ReviewClient } from "@/components/ReviewClient";
import type { Supplier, Invoice } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function ReviewDetailPage(
  props: PageProps<"/review/[id]">,
) {
  const { id } = await props.params;
  if (!isSupabaseConfigured()) {
    return (
      <>
        <PageHeader title="Review" />
        <NotConfigured />
      </>
    );
  }

  const result = await getInvoice(id);
  if (!result) notFound();
  const { invoice, items } = result;

  const supabase = (await createServerSupabase())!;

  // signed preview URL for the original (untouched) file
  let imageUrl: string | null = null;
  let isPdf = false;
  if (invoice.original_file_path) {
    isPdf = invoice.original_file_path.toLowerCase().endsWith(".pdf");
    const { data } = await supabase.storage
      .from(STORAGE_BUCKET)
      .createSignedUrl(invoice.original_file_path, 60 * 60);
    imageUrl = data?.signedUrl ?? null;
  }

  // supplier suggestions (PRD §7.5) + searchable list
  const matches = invoice.supplier_id
    ? []
    : await findSupplierMatches(supabase, {
        rawName: invoice.original_supplier_name,
        vatNumber: invoice.vat_number,
      });
  const { data: allSuppliers } = await supabase
    .from("suppliers")
    .select("*")
    .order("supplier_name");

  // possible duplicates flagged for this invoice
  const { data: dupes } = await supabase
    .from("duplicate_checks")
    .select("*, possible_duplicate:invoices!duplicate_checks_possible_duplicate_invoice_id_fkey(*)")
    .eq("invoice_id", id)
    .eq("status", "open");

  return (
    <ReviewClient
      invoice={invoice}
      items={items}
      imageUrl={imageUrl}
      isPdf={isPdf}
      supplierMatches={matches.map((m) => ({
        supplier: m.supplier,
        score: m.score,
        reason: m.reason,
      }))}
      allSuppliers={(allSuppliers ?? []) as Supplier[]}
      duplicates={(dupes ?? []).map((d) => ({
        reason: d.match_reason,
        score: Number(d.match_score),
        invoice: d.possible_duplicate as Invoice,
      }))}
    />
  );
}

import { PageHeader } from "@/components/ui";
import { UploadClient } from "@/components/UploadClient";

export default function UploadPage() {
  return (
    <>
      <PageHeader
        title="Upload"
        subtitle="Drop invoice photos, receipts, or PDFs. We extract, score, and queue them for review."
      />
      <UploadClient />
    </>
  );
}

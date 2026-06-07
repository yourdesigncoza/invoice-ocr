import { PageHeader } from "@/components/ui";
import { UploadClient } from "@/components/UploadClient";
import { getActiveProjects } from "@/lib/data";

export const dynamic = "force-dynamic";

export default async function UploadPage() {
  // adaptive: only offer a site picker once the user has 2+ sites
  const projects = await getActiveProjects();
  return (
    <>
      <PageHeader
        title="Upload"
        subtitle="Drop invoice photos, receipts, or PDFs. We extract, score, and queue them for review."
      />
      <UploadClient projects={projects.length >= 2 ? projects : []} />
    </>
  );
}

import { Suspense } from "react";
import { TenderWorkspace } from "@/components/tender-workspace";
export default async function TenderPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <Suspense>
      <TenderWorkspace key={id} id={id} />
    </Suspense>
  );
}

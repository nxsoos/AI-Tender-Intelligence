"use client";
import Link from "next/link";
import { useWorkspace } from "@/components/workspace-provider";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/icons";
export default function NotFoundPage() {
  const { t } = useWorkspace();
  return (
    <main className="workspace-unavailable">
      <span className="icon-tile">
        <Icon name="file" size={28} />
      </span>
      <h1>{t("tenderNotFound")}</h1>
      <p>{t("tenderNotFoundNote")}</p>
      <Button asChild>
        <Link href="/">{t("backDashboard")}</Link>
      </Button>
    </main>
  );
}

"use client";
import Link from "next/link";
import { useWorkspace } from "@/components/workspace-provider";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/icons";
export default function ErrorPage({ reset }: { reset: () => void }) {
  const { t } = useWorkspace();
  return (
    <main className="workspace-unavailable">
      <span className="icon-tile">
        <Icon name="alert" size={28} />
      </span>
      <h1>{t("errorTitle")}</h1>
      <p>{t("loadFailed")}</p>
      <Button onClick={reset}>{t("tryAgain")}</Button>
      <Link className="back-link" href="/">
        {t("backDashboard")}
      </Link>
    </main>
  );
}

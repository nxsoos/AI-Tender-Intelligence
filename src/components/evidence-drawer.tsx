"use client";
import { useState } from "react";
import type { Evidence } from "@/lib/types";
import { authenticatedFetch } from "@/lib/client";
import { formatNumber } from "@/lib/i18n";
import { useWorkspace } from "./workspace-provider";
import { Icon } from "./icons";
import { Button } from "./ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "./ui/dialog";

export function EvidenceLinks({
  evidence,
  onSelect,
}: {
  evidence: Evidence[];
  onSelect: (evidence: Evidence) => void;
}) {
  const { t, locale } = useWorkspace();
  return (
    <div className="evidence-links">
      {evidence.map((item, index) => (
        <button
          type="button"
          className="evidence-link"
          key={`${item.page}-${index}`}
          onClick={() => onSelect(item)}
        >
          <Icon name="link" size={14} />
          {t("page")} {formatNumber(item.page, locale)}
        </button>
      ))}
    </div>
  );
}
export function EvidenceDrawer({
  tenderId,
  evidence,
  onClose,
}: {
  tenderId: string;
  evidence: Evidence | null;
  onClose: () => void;
}) {
  const { t, locale } = useWorkspace();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  async function openDocument() {
    if (!evidence) return;
    setBusy(true);
    setError(false);
    // Open synchronously to retain the browser's user activation for popup safety.
    const tab = window.open("about:blank", "_blank");
    if (tab) tab.opener = null;
    try {
      const { url } = await authenticatedFetch<{ url: string }>(
        `/api/tenders/${tenderId}/document`,
      );
      if (tab) tab.location.href = `${url}#page=${evidence.page}`;
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- Signed storage PDFs are external resources, not application routes.
      else window.location.assign(`${url}#page=${evidence.page}`);
    } catch {
      tab?.close();
      setError(true);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog
      open={!!evidence}
      onOpenChange={(open) => {
        if (!open) {
          setError(false);
          onClose();
        }
      }}
    >
      <DialogContent sheet className="evidence-sheet">
        <div className="sheet-header">
          <span className="eyebrow">{t("source")}</span>
          <DialogClose className="icon-button" aria-label={t("close")}>
            <Icon name="close" />
          </DialogClose>
        </div>
        <DialogTitle>{t("sourceEvidence")}</DialogTitle>
        <DialogDescription>{t("evidenceDescription")}</DialogDescription>
        <div className="evidence-page-label">
          <Icon name="file" size={18} />
          {t("page")} {formatNumber(evidence?.page || 1, locale)}
        </div>
        <div className="evidence-quote-box">
          <span>{t("originalExcerpt")}</span>
          <blockquote dir="auto">{evidence?.quote}</blockquote>
        </div>
        <div className="evidence-trust-note">
          <Icon name="info" size={18} />
          <p>{t("sourceNote")}</p>
        </div>
        <Button
          className="full-width"
          onClick={() => void openDocument()}
          disabled={busy}
        >
          {busy ? (
            <span className="spinner" />
          ) : (
            <Icon name="external" size={18} />
          )}{" "}
          {t("openPdf")}
        </Button>
        {error && (
          <p className="inline-error" role="alert">
            {t("sourceUnavailable")}
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}

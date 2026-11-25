"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { authenticatedFetch, getBrowserSupabase } from "@/lib/client";
import type { Tender } from "@/lib/types";
import { useWorkspace, errorText } from "./workspace-provider";
import { Button } from "./ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogClose,
} from "./ui/dialog";
import { Icon } from "./icons";

export async function uploadTender(file: File, onStep: (step: string) => void) {
  onStep("creating");
  const created = await authenticatedFetch<{
    tender: Tender;
    uploadPath: string;
    bucket: string;
  }>("/api/tenders", {
    method: "POST",
    body: JSON.stringify({ filename: file.name, fileSize: file.size }),
  });
  onStep("uploading");
  try {
    const { error } = await getBrowserSupabase()
      .storage.from(created.bucket)
      .upload(created.uploadPath, file, {
        contentType: "application/pdf",
        upsert: false,
      });
    if (error) throw error;
  } catch (issue) {
    // Release an unused reservation so a failed upload does not consume the tender quota.
    await authenticatedFetch(`/api/tenders/${created.tender.id}`, {
      method: "DELETE",
    }).catch(() => undefined);
    throw issue;
  }
  return created.tender;
}

export function UploadDialog() {
  const { uploadOpen, setUploadOpen, t, locale, config, reload } =
    useWorkspace();
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const router = useRouter();
  function choose(selected?: File) {
    if (!selected) return;
    setError(null);
    if (
      !selected.name.toLowerCase().endsWith(".pdf") ||
      (selected.type && selected.type !== "application/pdf")
    ) {
      setError(t("invalidPdf"));
      return;
    }
    if (selected.size > 10 * 1024 * 1024) {
      setError(t("fileTooLarge"));
      return;
    }
    setFile(selected);
  }
  async function submit() {
    if (!file || !config?.configured) return;
    setError(null);
    try {
      const tender = await uploadTender(file, setStep);
      setUploadOpen(false);
      setFile(null);
      setStep(null);
      void reload();
      router.push(`/tenders/${tender.id}?analyze=1`);
    } catch (issue) {
      setError(errorText(issue, locale, "uploadFailed"));
      setStep(null);
    }
  }
  return (
    <Dialog
      open={uploadOpen}
      onOpenChange={(open) => {
        if (!step) {
          setUploadOpen(open);
          setError(null);
        }
      }}
    >
      <DialogContent aria-describedby="upload-description">
        <div className="dialog-heading">
          <span className="icon-tile">
            <Icon name="upload" size={24} />
          </span>
          <DialogClose
            className="icon-button"
            aria-label={t("close")}
            disabled={!!step}
          >
            <Icon name="close" />
          </DialogClose>
        </div>
        <DialogTitle>{t("uploadTitle")}</DialogTitle>
        <DialogDescription id="upload-description">
          {t("uploadDescription")}
        </DialogDescription>
        <input
          ref={input}
          type="file"
          accept="application/pdf,.pdf"
          className="sr-only"
          aria-label={t("chooseFile")}
          onChange={(event) => choose(event.target.files?.[0])}
          disabled={!!step}
        />
        <button
          type="button"
          className={`upload-dropzone ${dragging ? "dragging" : ""} ${file ? "has-file" : ""}`}
          disabled={!!step}
          onClick={() => input.current?.click()}
          onDragOver={(event) => {
            event.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(event) => {
            event.preventDefault();
            setDragging(false);
            choose(event.dataTransfer.files[0]);
          }}
        >
          <span className="dropzone-icon">
            <Icon name={file ? "file" : "upload"} size={28} />
          </span>
          {file ? (
            <>
              <strong>
                <bdi>{file.name}</bdi>
              </strong>
              <span>
                {(file.size / (1024 * 1024)).toFixed(2)} MB · {t("replaceFile")}
              </span>
            </>
          ) : (
            <>
              <strong>{t("dropTitle")}</strong>
              <span>{t("dropOr")}</span>
            </>
          )}
          <small>{t("uploadHint")}</small>
        </button>
        {step && (
          <p className="inline-status" role="status">
            <span className="spinner" />
            {t(step as "uploading" | "creating")}
          </p>
        )}
        {error && (
          <p className="inline-error" role="alert">
            <Icon name="alert" size={18} />
            {error}
          </p>
        )}
        {!config?.configured && (
          <p className="muted-note">{t("setupDescription")}</p>
        )}
        <div className="dialog-footer">
          <Button
            variant="outline"
            onClick={() => setUploadOpen(false)}
            disabled={!!step}
          >
            {t("cancel")}
          </Button>
          <Button
            onClick={() => void submit()}
            disabled={!file || !!step || !config?.configured}
          >
            {step ? (
              <span className="spinner" />
            ) : (
              <Icon name="upload" size={18} />
            )}
            {t("startAnalysis")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

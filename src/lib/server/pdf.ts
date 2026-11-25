import "server-only";
import { extractText, getDocumentProxy, inspectPages } from "unpdf";
import { LIMITS } from "@/lib/constants";
import { AppError } from "@/lib/server/http";
import type { DocumentPage } from "@/lib/types";

export function validatePdfBytes(bytes: Uint8Array) {
  if (!bytes.length || bytes.length > LIMITS.maxBytes)
    throw new AppError("PDF_TOO_LARGE", "Choose a PDF up to 10 MB");
  if (!new TextDecoder().decode(bytes.slice(0, 1024)).includes("%PDF-"))
    throw new AppError("INVALID_PDF", "This file is not a valid PDF document");
}
export async function extractDocumentPages(
  bytes: Uint8Array,
): Promise<DocumentPage[]> {
  validatePdfBytes(bytes);
  let pdf: Awaited<ReturnType<typeof getDocumentProxy>> | undefined;
  try {
    pdf = await getDocumentProxy(bytes, {
      maxImageSize: 16_777_216,
      stopAtErrors: true,
    });
    if (pdf.numPages > LIMITS.maxPages)
      throw new AppError(
        "TOO_MANY_PAGES",
        "Choose a PDF with 50 pages or fewer",
      );
    const { text } = await extractText(pdf, { mergePages: false });
    const texts = Array.isArray(text) ? text : [text];
    const pages = texts.map((value, index) => ({
      page: index + 1,
      text: value.replace(/\u0000/g, "").trim(),
    }));
    if (
      pages.reduce((sum, page) => sum + page.text.length, 0) >
      LIMITS.maxCharacters
    )
      throw new AppError(
        "TOO_MUCH_TEXT",
        "This document exceeds the 120,000 character text limit. Upload a shorter tender",
      );
    if (pages.every((page) => page.text.length < 20))
      throw new AppError(
        "SCANNED_PDF",
        "This PDF has no readable text. Upload a PDF with selectable text",
      );
    const inspection = await inspectPages(pdf);
    if (
      inspection.pages.some(
        (page) =>
          page.textLength - page.invisibleTextLength < 150 &&
          page.imageCoverage > 0.8,
      )
    )
      throw new AppError(
        "SCANNED_PDF",
        "This PDF contains scanned pages. Upload a PDF with selectable text on all content pages",
      );
    return pages;
  } catch (error) {
    if (error instanceof AppError) throw error;
    if (error instanceof Error && /password/i.test(error.name + error.message))
      throw new AppError(
        "ENCRYPTED_PDF",
        "Remove the PDF password and upload it again",
      );
    throw new AppError(
      "INVALID_PDF",
      "The PDF could not be read. Try exporting it again with selectable text",
    );
  } finally {
    await pdf?.loadingTask.destroy();
  }
}

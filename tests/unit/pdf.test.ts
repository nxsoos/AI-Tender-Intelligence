import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { extractDocumentPages, validatePdfBytes } from "@/lib/server/pdf";

describe("document extraction", () => {
  it("extracts the actual sample as four separate physical pages", async () => {
    const bytes = new Uint8Array(await readFile("public/sample-tender.pdf"));
    const pages = await extractDocumentPages(bytes);
    expect(pages).toHaveLength(4);
    expect(pages[0].text).toContain("15 December 2026");
    expect(pages[1].text).toContain("bid bond");
    expect(pages[2].text).toContain("Saudi Arabia");
    expect(pages[3].text).toContain("not specified");
  });
  it("rejects wrong magic bytes and excessive actual file size", () => {
    expect(() =>
      validatePdfBytes(new TextEncoder().encode("Not a PDF")),
    ).toThrow();
    expect(() =>
      validatePdfBytes(new Uint8Array(10 * 1024 * 1024 + 1)),
    ).toThrow();
  });
  it("rejects a textless document rather than creating an empty success", async () => {
    const doc = await PDFDocument.create();
    doc.addPage();
    await expect(extractDocumentPages(await doc.save())).rejects.toMatchObject({
      code: "SCANNED_PDF",
    });
  });
  it("rejects a scanned body even when a selectable header exceeds 20 characters", async () => {
    const doc = await PDFDocument.create();
    const font = await doc.embedFont(StandardFonts.Helvetica);
    const image = await doc.embedPng(
      Uint8Array.from(
        Buffer.from(
          "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jf0kAAAAASUVORK5CYII=",
          "base64",
        ),
      ),
    );
    const page = doc.addPage([600, 800]);
    page.drawImage(image, { x: 0, y: 0, width: 600, height: 800 });
    page.drawText("Tender document scanned page header", {
      x: 20,
      y: 770,
      size: 12,
      font,
    });
    await expect(extractDocumentPages(await doc.save())).rejects.toMatchObject({
      code: "SCANNED_PDF",
    });
  });
  it("checks the page count before extracting an oversized document", async () => {
    const doc = await PDFDocument.create();
    for (let i = 0; i < 51; i++) doc.addPage();
    await expect(extractDocumentPages(await doc.save())).rejects.toMatchObject({
      code: "TOO_MANY_PAGES",
    });
  });
});

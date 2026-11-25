import { describe, expect, it } from "vitest";
import {
  analysisSchema,
  checklistUpdateSchema,
  uploadSchema,
} from "@/lib/analysis-schema";
import {
  normalizeEvidenceText,
  validCitation,
  validateAnalysisEvidence,
} from "@/lib/citations";
import { complianceProgress } from "@/lib/progress";
import type { TenderAnalysis } from "@/lib/types";

const pages = [
  {
    page: 1,
    text: "The submission deadline is 15 December 2026.\nA bid bond is mandatory.",
  },
];
const analysis = (): TenderAnalysis => ({
  title: { en: "Tender", ar: "مناقصة" },
  issuer: null,
  reference: null,
  summary: { en: "Summary", ar: "ملخص" },
  deadline: {
    date: "2026-12-15",
    raw: "15 December 2026",
    status: "found",
    evidence: [
      { page: 1, quote: "The submission deadline is 15 December 2026." },
    ],
  },
  requirements: [
    {
      id: "R1",
      title: { en: "Bid bond", ar: "ضمان ابتدائي" },
      description: { en: "Provide a bid bond", ar: "تقديم ضمان ابتدائي" },
      category: "administrative",
      mandatory: true,
      evidence: [{ page: 1, quote: "A bid bond is mandatory." }],
    },
  ],
  risks: [],
});
describe("source verification", () => {
  it("accepts exact quotes with normalized line breaks and Arabic Unicode", () => {
    expect(validCitation({ page: 1, quote: "2026. A bid bond" }, pages)).toBe(
      true,
    );
    expect(normalizeEvidenceText("أصل\n\t النص")).toBe("أصل النص");
  });
  it("rejects invented quotes and wrong physical pages", () => {
    expect(
      validCitation({ page: 2, quote: "A bid bond is mandatory." }, pages),
    ).toBe(false);
    expect(
      validCitation({ page: 1, quote: "A bid bond is optional." }, pages),
    ).toBe(false);
  });
  it("requires evidence for requirements and explicit risks, but allows labelled missing information", () => {
    const value = analysis();
    expect(validateAnalysisEvidence(value, pages)).toEqual(value);
    value.requirements[0].evidence = [];
    expect(() => validateAnalysisEvidence(value, pages)).toThrow();
    const second = analysis();
    second.risks.push({
      id: "K1",
      title: { en: "Budget missing", ar: "الميزانية غير محددة" },
      description: { en: "Not stated", ar: "غير مذكورة" },
      action: { en: "Clarify", ar: "طلب توضيح" },
      severity: "medium",
      kind: "missing_information",
      evidence: [],
    });
    expect(() => validateAnalysisEvidence(second, pages)).not.toThrow();
    second.risks[0].kind = "explicit";
    expect(() => validateAnalysisEvidence(second, pages)).toThrow();
  });
  it("rejects impossible dates and clears ambiguous dates", () => {
    const value = analysis();
    value.deadline.date = "2026-02-30";
    expect(() => validateAnalysisEvidence(value, pages)).toThrow();
    value.deadline.status = "ambiguous";
    validateAnalysisEvidence(value, pages);
    expect(value.deadline.date).toBeNull();
  });
});
describe("API input boundaries", () => {
  it("accepts a bilingual analysis and rejects malformed structured output", () => {
    expect(analysisSchema.safeParse(analysis()).success).toBe(true);
    expect(
      analysisSchema.safeParse({
        ...analysis(),
        summary: "text instead of localized object",
      }).success,
    ).toBe(false);
  });
  it("does not accept changes to generated checklist content", () => {
    expect(checklistUpdateSchema.safeParse({ completed: true }).success).toBe(
      true,
    );
    expect(
      checklistUpdateSchema.safeParse({
        completed: true,
        title: "Forged requirement",
      }).success,
    ).toBe(false);
  });
  it("rejects non-PDF and oversized upload metadata", () => {
    expect(
      uploadSchema.safeParse({ filename: "Tender.PDF", fileSize: 500 }).success,
    ).toBe(true);
    expect(
      uploadSchema.safeParse({ filename: "Tender.exe", fileSize: 500 }).success,
    ).toBe(false);
    expect(
      uploadSchema.safeParse({
        filename: "Tender.pdf",
        fileSize: 10 * 1024 * 1024 + 1,
      }).success,
    ).toBe(false);
  });
});
describe("manual completion progress", () => {
  it("never reports empty requirements as complete", () => {
    expect(complianceProgress([])).toEqual({
      total: 0,
      completed: 0,
      percentage: 0,
    });
  });
  it("uses actual saved completion values", () => {
    expect(
      complianceProgress([
        { completed: true },
        { completed: false },
        { completed: true },
      ]),
    ).toEqual({ total: 3, completed: 2, percentage: 67 });
  });
});

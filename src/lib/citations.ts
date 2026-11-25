import type { DocumentPage, Evidence, TenderAnalysis } from "@/lib/types";

export function normalizeEvidenceText(text: string) {
  return text.normalize("NFC").replace(/\s+/gu, " ").trim();
}
export function validCitation(citation: Evidence, pages: DocumentPage[]) {
  const page = pages.find((item) => item.page === citation.page);
  return (
    !!page &&
    normalizeEvidenceText(citation.quote).length >= 8 &&
    normalizeEvidenceText(page.text).includes(
      normalizeEvidenceText(citation.quote),
    )
  );
}
export function validateAnalysisEvidence(
  analysis: TenderAnalysis,
  pages: DocumentPage[],
) {
  for (const requirement of analysis.requirements) {
    if (
      !requirement.evidence.length ||
      requirement.evidence.some((item) => !validCitation(item, pages))
    )
      throw new Error(
        "An extracted requirement has an unverified source quotation",
      );
  }
  for (const risk of analysis.risks) {
    if (
      (risk.kind === "explicit" && !risk.evidence.length) ||
      risk.evidence.some((item) => !validCitation(item, pages))
    )
      throw new Error("An extracted risk has an unverified source quotation");
  }
  if (analysis.deadline.evidence.some((item) => !validCitation(item, pages)))
    throw new Error("The deadline has an unverified source quotation");
  if (analysis.deadline.status === "found") {
    const date = analysis.deadline.date;
    if (
      !date ||
      !analysis.deadline.raw ||
      !analysis.deadline.evidence.length ||
      Number.isNaN(Date.parse(`${date}T00:00:00Z`)) ||
      new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) !== date
    )
      throw new Error("The submission deadline is not a valid sourced date");
  } else {
    analysis.deadline.date = null;
  }
  return analysis;
}

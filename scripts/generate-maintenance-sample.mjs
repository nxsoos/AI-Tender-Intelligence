import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { mkdir, writeFile } from "node:fs/promises";

const outputDirectory = "artifacts/tenders";
const pages = [
  {
    title: "Municipal facilities maintenance",
    subtitle: "Invitation and submission | RFP-FM-2026-017",
    sections: [
      ["Fictional procurement notice", "Al Waha Municipal Facilities Authority is a fictional organization. This tender is an original testing document, not a real procurement opportunity. All organizations, buildings and submission channels described here are fictional."],
      ["Scope and contract period", "The Authority invites proposals for preventive and corrective facilities maintenance at three municipal buildings. The contract period is 12 months from the contract commencement date."],
      ["Bid submission deadline", "The bid submission deadline is 28 December 2026 at 15:00 Arabia Standard Time (UTC+03:00). Late bids will not be accepted."],
      ["Clarification deadline", "Requests for clarification must be received by 10 December 2026. This clarification deadline is not the bid submission deadline."],
      ["Submission format", "Submit the technical proposal and financial proposal as separate PDF documents through the Authority's fictional procurement portal. Both proposals must reference RFP-FM-2026-017. No working portal URL is provided because this is a fictional test tender."],
    ],
  },
  {
    title: "Eligibility and bid security",
    subtitle: "Mandatory qualification documents | Page 2",
    sections: [
      ["Registration and tax compliance", "Bidders must submit a valid commercial registration certificate and a current tax compliance certificate. Include copies with the technical proposal."],
      ["Relevant experience", "Bidders must demonstrate at least five years of relevant building-maintenance experience. Provide a company experience statement and client references for comparable facilities."],
      ["Public liability insurance", "Public liability insurance with coverage of at least SAR 2,000,000 is mandatory. Submit a valid insurance certificate with the technical proposal."],
      ["Mandatory bid bond", "A bid bond equal to 2 percent of the total proposal value is mandatory. The bond must remain valid for 120 days from the bid submission deadline. Failure to include the bond will result in disqualification."],
      ["Qualification assessment", "The Authority will assess eligibility against the submitted certificates, references and proposal. These requirements alone do not establish whether any particular company qualifies; that depends on the company's submitted evidence."],
    ],
  },
  {
    title: "Service requirements and deliverables",
    subtitle: "Response times, reporting and optional services | Page 3",
    sections: [
      ["Response times", "Respond to emergency maintenance incidents within two hours of notification. Respond to routine maintenance requests within 24 hours of notification."],
      ["Mobilization", "Hold the service kickoff meeting and submit the mobilization plan within 14 calendar days of contract award."],
      ["Monthly inspections and reporting", "Complete one scheduled inspection of each covered building every month. Submit one consolidated inspection and maintenance report each month, for a total of 12 monthly reports during the 12-month contract."],
      ["Report languages", "All service reports must be supplied in both Arabic and English."],
      ["Preferred certification", "ISO 9001 certification is preferred, not mandatory. A bidder must not be rejected solely because it does not hold this certification."],
      ["Optional training", "Additional on-site training for Authority staff is optional and may be proposed as a separately priced enhancement. It is not a mandatory deliverable."],
    ],
  },
  {
    title: "Commercial terms and open information",
    subtitle: "Payment, pricing assumptions and clarifications | Page 4",
    sections: [
      ["Payment terms", "Payment will be monthly in arrears, within 30 days of an accepted invoice. The invoice must be supported by the accepted monthly inspection and maintenance report."],
      ["Budget ceiling", "The budget ceiling is not specified in this document. Bidders should request clarification before assuming that any budget value applies."],
      ["Project management contact", "The personal name and personal telephone number of the Authority's project manager are not specified in this document. Clarification requests must use the fictional procurement portal described on page 1."],
      ["Pricing and service assumptions", "The financial proposal must state the price for the complete 12-month base maintenance service. Price any optional additional on-site training separately, and identify all exclusions and assumptions."],
      ["Acceptance of monthly services", "The Authority will review the consolidated monthly report against completed inspections and recorded maintenance requests before accepting that month's services and associated invoice."],
    ],
  },
];

const answerKey = `FACILITIES MAINTENANCE TENDER — ANSWER KEY
Fictional test document: facilities-maintenance-tender.pdf
Reference: RFP-FM-2026-017
Upload only the PDF to the dashboard. Keep this answer key outside the app.
Page references below mean physical PDF pages, numbered 1 through 4.

1. Who issued the tender and what is its reference?
   Al Waha Municipal Facilities Authority (fictional); RFP-FM-2026-017. Page 1.
2. What does the base contract cover, and for how long?
   Preventive and corrective facilities maintenance at three municipal buildings for 12 months. Page 1.
3. What is the bid submission deadline?
   28 December 2026 at 15:00 Arabia Standard Time (UTC+03:00). Page 1.
   10 December is the clarification deadline, not the bid deadline.
4. How should the proposals be submitted?
   Separate technical and financial PDFs through the fictional procurement portal, both referencing RFP-FM-2026-017. Page 1.
5. Which qualification evidence is mandatory?
   Valid commercial registration, current tax compliance certificate, at least five years of relevant building-maintenance experience, and supporting references. Page 2.
6. Is public liability insurance required, and how much coverage?
   Yes; at least SAR 2,000,000, supported by a valid certificate. Page 2.
7. What bid bond is required and what happens if it is omitted?
   2 percent of total proposal value, valid 120 days from the submission deadline. Omission results in disqualification. Page 2.
   Do not reuse the first IT sample's 1 percent / 90-day answer.
8. What maintenance response times apply?
   Emergency: within two hours of notification. Routine: within 24 hours. Page 3.
9. When are the kickoff meeting and mobilization plan due?
   Within 14 calendar days of contract award. Page 3.
10. What recurring inspections and reports are required?
    Inspect each building monthly; one consolidated report per month, 12 reports total. Reports must be in Arabic and English. Page 3.
11. Is ISO 9001 certification mandatory? Is additional training mandatory?
    No. ISO 9001 is preferred, not mandatory. Additional on-site training is optional and separately priced. Page 3.
12. What are the payment terms?
    Monthly in arrears, within 30 days of an accepted invoice supported by the accepted monthly report. Page 4.
13. What is the budget ceiling? Who is the project manager and what is their personal telephone number?
    None of those details is specified. The app should acknowledge missing information and not invent a budget, person or phone number. Page 4.
14. Can the app conclude that our company is eligible without reviewing our company documents?
    No. Eligibility depends on the submitted company evidence; the tender alone does not establish it. Page 2.

USEFUL RISKS TO EXPECT
- Omission of the mandatory bid bond causes disqualification (Page 2).
- Failure to meet mandatory qualification/insurance requirements needs attention (Page 2).
- The two-hour emergency response is a service-delivery obligation (Page 3).
- The unspecified budget requires clarification; no numerical budget can be extracted (Page 4).
- Optional ISO certification or additional training must not become mandatory checklist obligations (Page 3).

CHECKING THE DASHBOARD
Ask the questions above in English or Arabic and inspect the cited page and original quotation.
Exact wording and checklist grouping may vary; facts, mandatory/optional status and page evidence should agree.
Mark a requirement complete, reload, and confirm the mark and dashboard progress remain saved.
If an answer gives the first sample's 1 percent bid bond, the assistant is using the wrong tender context.
`;

const pdf = await PDFDocument.create();
pdf.setTitle("Fictional Facilities Maintenance Tender — RFP-FM-2026-017");
pdf.setAuthor("AI Tender Intelligence — original fictional testing document");
pdf.setCreationDate(new Date("2026-11-25T00:00:00Z"));
pdf.setModificationDate(new Date("2026-11-25T00:00:00Z"));
const regular = await pdf.embedFont(StandardFonts.Helvetica);
const medium = await pdf.embedFont(StandardFonts.HelveticaBold);
const ink = rgb(0.09, 0.14, 0.13);
const teal = rgb(0.09, 0.25, 0.23);
const muted = rgb(0.34, 0.39, 0.37);

function wrap(text, font, size, width) {
  const lines = [];
  let line = "";
  for (const word of text.split(" ")) {
    const candidate = line ? `${line} ${word}` : word;
    if (line && font.widthOfTextAtSize(candidate, size) > width) {
      lines.push(line);
      line = word;
    } else line = candidate;
  }
  if (line) lines.push(line);
  return lines;
}

for (const [index, content] of pages.entries()) {
  const page = pdf.addPage([595.28, 841.89]);
  page.drawRectangle({ x: 0, y: 799, width: 595.28, height: 43, color: teal });
  page.drawText("Fictional tender for dashboard testing / RFP-FM-2026-017", { x: 48, y: 816, size: 10, font: regular, color: rgb(1, 1, 1) });
  let y = 756;
  for (const line of wrap(content.title, medium, 21, 499)) {
    page.drawText(line, { x: 48, y, size: 21, font: medium, color: ink });
    y -= 27;
  }
  page.drawText(content.subtitle, { x: 48, y: y - 9, size: 10, font: regular, color: muted });
  y -= 48;
  for (const [heading, body] of content.sections) {
    page.drawText(heading, { x: 48, y, size: 12, font: medium, color: teal });
    y -= 21;
    for (const line of wrap(body, regular, 11, 499)) {
      if (y < 82) throw new Error(`Content overflows physical page ${index + 1}`);
      page.drawText(line, { x: 48, y, size: 11, font: regular, color: ink });
      y -= 16;
    }
    y -= 22;
  }
  page.drawLine({ start: { x: 48, y: 58 }, end: { x: 547, y: 58 }, thickness: 0.5, color: rgb(0.79, 0.82, 0.8) });
  page.drawText(`Fictional sample / Not a real procurement notice / Page ${index + 1} of 4`, { x: 48, y: 38, size: 9, font: regular, color: muted });
}

await mkdir(outputDirectory, { recursive: true });
await writeFile(`${outputDirectory}/facilities-maintenance-tender.pdf`, await pdf.save());
await writeFile(`${outputDirectory}/facilities-maintenance-answer-key.txt`, answerKey, "utf8");
console.log(`Created ${outputDirectory}/facilities-maintenance-tender.pdf (4 selectable-text pages)`);
console.log(`Created ${outputDirectory}/facilities-maintenance-answer-key.txt`);

import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { mkdir, writeFile } from "node:fs/promises";

const pages = [
  {
    title: "Digital citizen services platform",
    subtitle: "Fictional sample tender | RFP-MDA-2026-041",
    sections: [
      [
        "Issuer and invitation",
        "The fictional Madar Development Authority invites qualified technology suppliers to deliver a secure digital citizen services platform. This sample document is for assessment demonstrations only and is not a real procurement notice.",
      ],
      [
        "Submission deadline",
        "The bid submission deadline is 15 December 2026 at 14:00 Arabia Standard Time (UTC+03:00). Late submissions will not be accepted.",
      ],
      [
        "Submission method",
        "Submit the technical proposal and financial proposal as separate PDF documents through the Authority procurement portal. Both proposals must reference RFP-MDA-2026-041.",
      ],
      [
        "Clarification deadline",
        "Requests for clarification must be submitted by 5 December 2026. This is not the bid submission deadline.",
      ],
    ],
  },
  {
    title: "Eligibility and mandatory documents",
    subtitle: "Supplier qualification | Page 2",
    sections: [
      [
        "Commercial registration",
        "Bidders must provide a valid commercial registration certificate and a current tax compliance certificate.",
      ],
      [
        "Relevant experience",
        "Bidders must demonstrate at least three completed public-sector digital transformation projects within the previous five years. Include client references and project completion certificates.",
      ],
      [
        "Bid bond",
        "A bid bond equal to 1 percent of the total proposal value is mandatory. The bid bond must remain valid for 90 days from the submission deadline. Failure to include the bid bond will result in disqualification.",
      ],
      [
        "Authorized signatory",
        "The proposal must be signed by an authorized representative. Include documentary evidence of the representative's signing authority.",
      ],
    ],
  },
  {
    title: "Technical requirements",
    subtitle: "Platform capabilities | Page 3",
    sections: [
      [
        "Language and accessibility",
        "The platform must support English and Arabic, including right-to-left Arabic layouts. The service must meet WCAG 2.2 AA accessibility requirements.",
      ],
      [
        "Security and data location",
        "All production data must be hosted within Saudi Arabia. Encrypt data in transit and at rest. Role-based access control and auditable administrative actions are mandatory.",
      ],
      [
        "Integrations and availability",
        "Provide documented REST APIs for integration with the Authority identity service. The production service must achieve 99.9 percent monthly availability.",
      ],
      [
        "Optional capability",
        "A native mobile application is optional and may be proposed as a separately priced enhancement. It is not a mandatory deliverable.",
      ],
    ],
  },
  {
    title: "Deliverables and commercial conditions",
    subtitle: "Implementation and handover | Page 4",
    sections: [
      [
        "Delivery milestones",
        "Deliver a discovery report within 2 weeks of contract award, an interactive prototype within 6 weeks, and the production platform within 16 weeks.",
      ],
      [
        "Handover and support",
        "Provide source code, deployment documentation, administrator training, and 12 months of post-launch support. Conduct two administrator training workshops before handover.",
      ],
      [
        "Acceptance",
        "Final acceptance requires successful completion of security testing, accessibility testing, and user acceptance testing approved by the Authority.",
      ],
      [
        "Budget and payment information",
        "The project budget and payment schedule are not specified in this document. Bidders should request clarification from the Authority before finalizing commercial assumptions.",
      ],
      [
        "Proposal validity",
        "Proposals must remain valid for 90 days from the bid submission deadline.",
      ],
    ],
  },
];
const pdf = await PDFDocument.create();
pdf.setTitle("Sample Tender - Digital Citizen Services Platform");
pdf.setAuthor("AI Tender Intelligence - fictional demonstration document");
const regular = await pdf.embedFont(StandardFonts.Helvetica);
const medium = await pdf.embedFont(StandardFonts.HelveticaBold);
function wrap(text, width, font, size) {
  const lines = [];
  let line = "";
  for (const word of text.split(" ")) {
    const candidate = line ? `${line} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) > width && line) {
      lines.push(line);
      line = word;
    } else line = candidate;
  }
  if (line) lines.push(line);
  return lines;
}
for (const [index, content] of pages.entries()) {
  const page = pdf.addPage([595.28, 841.89]);
  page.drawRectangle({
    x: 0,
    y: 805,
    width: 595.28,
    height: 37,
    color: rgb(0.09, 0.25, 0.23),
  });
  page.drawText("Madar Development Authority / Demonstration RFP", {
    x: 48,
    y: 818,
    size: 10,
    font: regular,
    color: rgb(1, 1, 1),
  });
  let y = 756;
  for (const line of wrap(content.title, 500, medium, 22)) {
    page.drawText(line, {
      x: 48,
      y,
      size: 22,
      font: medium,
      color: rgb(0.09, 0.14, 0.13),
    });
    y -= 28;
  }
  page.drawText(content.subtitle, {
    x: 48,
    y: y - 10,
    size: 10,
    font: regular,
    color: rgb(0.36, 0.4, 0.38),
  });
  y -= 56;
  for (const [title, body] of content.sections) {
    page.drawText(title, {
      x: 48,
      y,
      size: 12,
      font: medium,
      color: rgb(0.09, 0.25, 0.23),
    });
    y -= 24;
    for (const line of wrap(body, 495, regular, 11)) {
      page.drawText(line, {
        x: 48,
        y,
        size: 11,
        font: regular,
        color: rgb(0.12, 0.15, 0.14),
      });
      y -= 18;
    }
    y -= 28;
  }
  page.drawLine({
    start: { x: 48, y: 55 },
    end: { x: 547, y: 55 },
    thickness: 0.5,
    color: rgb(0.8, 0.82, 0.81),
  });
  page.drawText(
    `Fictional assessment sample / RFP-MDA-2026-041 / ${index + 1} of 4`,
    { x: 48, y: 36, size: 9, font: regular, color: rgb(0.36, 0.4, 0.38) },
  );
}
await mkdir("public", { recursive: true });
await writeFile("public/sample-tender.pdf", await pdf.save());
console.log("Created public/sample-tender.pdf (4 pages, selectable text)");

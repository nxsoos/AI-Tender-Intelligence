import { z } from "zod";

export const localizedTextSchema = z.object({
  en: z.string().min(1).max(4000),
  ar: z.string().min(1).max(4000),
});
export const evidenceSchema = z.object({
  page: z.number().int().min(1).max(50),
  quote: z.string().min(8).max(1500),
});
export const requirementSchema = z.object({
  id: z.string().min(1).max(80),
  title: localizedTextSchema,
  description: localizedTextSchema,
  category: z.enum([
    "eligibility",
    "deliverable",
    "technical",
    "administrative",
  ]),
  mandatory: z.boolean(),
  evidence: z.array(evidenceSchema).min(1).max(4),
});
export const riskSchema = z.object({
  id: z.string().min(1).max(80),
  title: localizedTextSchema,
  description: localizedTextSchema,
  action: localizedTextSchema,
  severity: z.enum(["critical", "high", "medium", "low"]),
  kind: z.enum(["explicit", "inferred", "missing_information"]),
  evidence: z.array(evidenceSchema).max(4),
});
export const analysisSchema = z.object({
  title: localizedTextSchema,
  issuer: z.string().max(500).nullable(),
  reference: z.string().max(200).nullable(),
  summary: localizedTextSchema,
  deadline: z.object({
    date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .nullable(),
    raw: z.string().max(500).nullable(),
    status: z.enum(["found", "not_found", "ambiguous"]),
    evidence: z.array(evidenceSchema).max(4),
  }),
  requirements: z.array(requirementSchema).max(80),
  risks: z.array(riskSchema).max(30),
});
export const answerSchema = z.object({
  answer: z.string().min(1).max(10000),
  supported: z.boolean(),
  citations: z.array(evidenceSchema).max(8),
});
export const uploadSchema = z
  .object({
    filename: z
      .string()
      .min(1)
      .max(200)
      .refine((v) => v.toLowerCase().endsWith(".pdf"), "Choose a PDF document"),
    fileSize: z
      .number()
      .int()
      .positive()
      .max(10 * 1024 * 1024, "PDF must be 10 MB or smaller"),
  })
  .strict();
export const checklistUpdateSchema = z
  .object({ completed: z.boolean() })
  .strict();
export const chatInputSchema = z
  .object({
    message: z.string().trim().min(1).max(2000),
    locale: z.enum(["en", "ar"]).default("en"),
  })
  .strict();

export type Locale = "en" | "ar";
export type LocalizedText = { en: string; ar: string };
export type Evidence = { page: number; quote: string };
export type TenderStatus =
  | "uploaded"
  | "extracting"
  | "analyzing"
  | "ready"
  | "failed";
export type RequirementCategory =
  | "eligibility"
  | "deliverable"
  | "technical"
  | "administrative";
export type Severity = "critical" | "high" | "medium" | "low";
export type Requirement = {
  id: string;
  title: LocalizedText;
  description: LocalizedText;
  category: RequirementCategory;
  mandatory: boolean;
  evidence: Evidence[];
};
export type Risk = {
  id: string;
  title: LocalizedText;
  description: LocalizedText;
  action: LocalizedText;
  severity: Severity;
  kind: "explicit" | "inferred" | "missing_information";
  evidence: Evidence[];
};
export type TenderAnalysis = {
  title: LocalizedText;
  issuer: string | null;
  reference: string | null;
  summary: LocalizedText;
  deadline: {
    date: string | null;
    raw: string | null;
    status: "found" | "not_found" | "ambiguous";
    evidence: Evidence[];
  };
  requirements: Requirement[];
  risks: Risk[];
};
export type ChecklistItem = Requirement & {
  completed: boolean;
  completed_at: string | null;
};
export type Tender = {
  id: string;
  filename: string;
  title: string;
  storage_path: string;
  file_size: number;
  status: TenderStatus;
  analysis: TenderAnalysis | null;
  deadline: string | null;
  page_count: number | null;
  error_code: string | null;
  error_message: string | null;
  created_at: string;
  updated_at: string;
  completed_count: number;
  requirement_count: number;
  risk_count: number;
};
export type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  locale: Locale;
  citations: Evidence[];
  supported: boolean;
  created_at: string;
};
export type DocumentPage = { page: number; text: string };
export type TenderDetail = {
  tender: Tender;
  requirements: ChecklistItem[];
  messages: ChatMessage[];
};
export type AppConfig = {
  configured: boolean;
  aiConfigured: boolean;
  supabaseConfigured: boolean;
  missing: string[];
  limits: { maxBytes: number; maxPages: number; maxCharacters: number };
};
export type ApiErrorBody = { error: { code: string; message: string } };

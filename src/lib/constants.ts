export const STORAGE_BUCKET = "tender-documents";
export const LIMITS = {
  maxBytes: 10 * 1024 * 1024,
  maxPages: 50,
  maxCharacters: 120_000,
} as const;
export const ANALYSIS_LEASE_MS = 180_000;
export const MAX_TENDERS_PER_USER = 25;
export const MAX_CHAT_MESSAGES_PER_TENDER = 100;

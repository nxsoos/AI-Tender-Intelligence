import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { AppError, dbError, validateId } from "@/lib/server/http";
import type {
  ChatMessage,
  ChecklistItem,
  DocumentPage,
  Requirement,
  Tender,
  TenderAnalysis,
} from "@/lib/types";

type TenderRow = Omit<
  Tender,
  "completed_count" | "requirement_count" | "risk_count"
> & { owner_id: string };
type ChecklistRow = {
  id: string;
  requirement: Requirement;
  completed: boolean;
  completed_at: string | null;
};
export function mapChecklist(row: ChecklistRow): ChecklistItem {
  return {
    ...row.requirement,
    id: row.id,
    completed: row.completed,
    completed_at: row.completed_at,
  };
}
export async function requireTender(
  db: SupabaseClient,
  userId: string,
  tenderId: string,
): Promise<TenderRow> {
  validateId(tenderId);
  const { data, error } = await db
    .from("tenders")
    .select("*")
    .eq("id", tenderId)
    .eq("owner_id", userId)
    .maybeSingle();
  dbError(error);
  if (!data) throw new AppError("NOT_FOUND", "Tender not found", 404);
  return data as TenderRow;
}
export async function getRequirements(
  db: SupabaseClient,
  userId: string,
  tenderId: string,
): Promise<ChecklistItem[]> {
  const { data, error } = await db
    .from("checklist_items")
    .select("id,requirement,completed,completed_at")
    .eq("tender_id", tenderId)
    .eq("owner_id", userId)
    .order("position");
  dbError(error);
  return (data || []).map((row) => mapChecklist(row as ChecklistRow));
}
export async function getMessages(
  db: SupabaseClient,
  userId: string,
  tenderId: string,
): Promise<ChatMessage[]> {
  const { data, error } = await db
    .from("chat_messages")
    .select("id,role,content,locale,citations,supported,created_at")
    .eq("tender_id", tenderId)
    .eq("owner_id", userId)
    .order("created_at")
    .limit(100);
  dbError(error);
  return (data || []) as ChatMessage[];
}
export async function getPages(
  db: SupabaseClient,
  userId: string,
  tenderId: string,
): Promise<DocumentPage[]> {
  const { data, error } = await db
    .from("document_pages")
    .select("page,text")
    .eq("tender_id", tenderId)
    .eq("owner_id", userId)
    .order("page");
  dbError(error);
  return (data || []) as DocumentPage[];
}
export function publicTender(
  row: TenderRow,
  requirements: { completed: boolean }[] = [],
): Tender {
  const analysis = row.analysis as TenderAnalysis | null;
  return {
    id: row.id,
    filename: row.filename,
    title: row.title,
    storage_path: row.storage_path,
    file_size: row.file_size,
    status: row.status,
    analysis,
    deadline: row.deadline,
    page_count: row.page_count,
    error_code: row.error_code,
    error_message: row.error_message,
    created_at: row.created_at,
    updated_at: row.updated_at,
    completed_count: requirements.filter((item) => item.completed).length,
    requirement_count: requirements.length,
    risk_count: analysis?.risks.length || 0,
  };
}
export async function reserveAiCall(db: SupabaseClient, userId: string) {
  const { data, error } = await db.rpc("reserve_ai_call", { p_owner: userId });
  dbError(error);
  if (data !== "ok")
    throw new AppError(
      "RATE_LIMITED",
      data === "daily_limit"
        ? "Your workspace has reached its 100-request daily AI limit"
        : "Please wait a few seconds before another AI request",
      429,
    );
}

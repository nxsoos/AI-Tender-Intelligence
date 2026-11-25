import { uploadSchema } from "@/lib/analysis-schema";
import { MAX_TENDERS_PER_USER, STORAGE_BUCKET } from "@/lib/constants";
import {
  AppError,
  dbError,
  handleError,
  json,
  readBody,
} from "@/lib/server/http";
import { publicTender } from "@/lib/server/repository";
import { requireUser } from "@/lib/server/supabase";
export const runtime = "nodejs";
export async function GET(request: Request) {
  try {
    const { db, userId } = await requireUser(request);
    const { data, error } = await db
      .from("tenders")
      .select("*")
      .eq("owner_id", userId)
      .order("created_at", { ascending: false })
      .limit(100);
    dbError(error);
    const ids = (data || []).map((row) => row.id as string);
    const checklist = ids.length
      ? await db
          .from("checklist_items")
          .select("tender_id,completed")
          .eq("owner_id", userId)
          .in("tender_id", ids)
      : { data: [], error: null };
    dbError(checklist.error);
    return json({
      tenders: (data || []).map((row) =>
        publicTender(
          row,
          (checklist.data || []).filter((item) => item.tender_id === row.id),
        ),
      ),
    });
  } catch (error) {
    return handleError(error);
  }
}
export async function POST(request: Request) {
  try {
    const { db, userId } = await requireUser(request);
    const { filename, fileSize } = await readBody(request, uploadSchema);
    const countResult = await db
      .from("tenders")
      .select("id", { count: "exact", head: true })
      .eq("owner_id", userId);
    dbError(countResult.error);
    if ((countResult.count || 0) >= MAX_TENDERS_PER_USER)
      throw new AppError(
        "TENDER_LIMIT",
        "This workspace has reached its 25-tender limit",
        429,
      );
    const id = crypto.randomUUID();
    const uploadPath = `${userId}/${id}/document.pdf`;
    const { data, error } = await db
      .from("tenders")
      .insert({
        id,
        owner_id: userId,
        filename,
        title: filename.replace(/\.pdf$/i, ""),
        storage_path: uploadPath,
        file_size: fileSize,
      })
      .select("*")
      .single();
    dbError(error);
    return json(
      { tender: publicTender(data), uploadPath, bucket: STORAGE_BUCKET },
      201,
    );
  } catch (error) {
    return handleError(error);
  }
}

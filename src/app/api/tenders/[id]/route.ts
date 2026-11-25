import { AppError, dbError, handleError, json } from "@/lib/server/http";
import { STORAGE_BUCKET } from "@/lib/constants";
import {
  getMessages,
  getRequirements,
  publicTender,
  requireTender,
} from "@/lib/server/repository";
import { requireUser } from "@/lib/server/supabase";
export const runtime = "nodejs";
export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { db, userId } = await requireUser(request);
    const { id } = await context.params;
    const row = await requireTender(db, userId, id);
    const [requirements, messages] = await Promise.all([
      getRequirements(db, userId, id),
      getMessages(db, userId, id),
    ]);
    return json({
      tender: publicTender(row, requirements),
      requirements,
      messages,
    });
  } catch (error) {
    return handleError(error);
  }
}
export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { db, userId } = await requireUser(request);
    const { id } = await context.params;
    const row = await requireTender(db, userId, id);
    if (row.status !== "uploaded")
      throw new AppError(
        "CANNOT_CANCEL",
        "Only an unfinished upload can be cancelled",
        409,
      );
    const deleted = await db
      .from("tenders")
      .delete()
      .eq("id", id)
      .eq("owner_id", userId)
      .eq("status", "uploaded")
      .select("id");
    dbError(deleted.error);
    if (!deleted.data?.length)
      throw new AppError(
        "CANNOT_CANCEL",
        "This document is already being processed",
        409,
      );
    const cleanup = await db.storage
      .from(STORAGE_BUCKET)
      .remove([row.storage_path]);
    if (cleanup.error) console.error("Cancelled upload storage cleanup failed");
    return json({ deleted: true });
  } catch (error) {
    return handleError(error);
  }
}

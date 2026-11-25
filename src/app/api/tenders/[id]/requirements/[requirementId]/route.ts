import { checklistUpdateSchema } from "@/lib/analysis-schema";
import {
  AppError,
  dbError,
  handleError,
  json,
  readBody,
  validateId,
} from "@/lib/server/http";
import { mapChecklist, requireTender } from "@/lib/server/repository";
import { requireUser } from "@/lib/server/supabase";
export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string; requirementId: string }> },
) {
  try {
    const { db, userId } = await requireUser(request);
    const { id, requirementId } = await context.params;
    await requireTender(db, userId, id);
    validateId(requirementId);
    const { completed } = await readBody(request, checklistUpdateSchema);
    const { data, error } = await db
      .from("checklist_items")
      .update({
        completed,
        completed_at: completed ? new Date().toISOString() : null,
      })
      .eq("id", requirementId)
      .eq("tender_id", id)
      .eq("owner_id", userId)
      .select("id,requirement,completed,completed_at")
      .maybeSingle();
    dbError(error);
    if (!data) throw new AppError("NOT_FOUND", "Requirement not found", 404);
    return json({ requirement: mapChecklist(data) });
  } catch (error) {
    return handleError(error);
  }
}

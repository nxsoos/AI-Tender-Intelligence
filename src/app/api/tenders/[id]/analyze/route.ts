import { STORAGE_BUCKET } from "@/lib/constants";
import { analyzeTender } from "@/lib/server/ai";
import { getConfig } from "@/lib/server/config";
import { AppError, dbError, handleError, json } from "@/lib/server/http";
import { extractDocumentPages } from "@/lib/server/pdf";
import {
  getRequirements,
  publicTender,
  requireTender,
  reserveAiCall,
} from "@/lib/server/repository";
import { requireUser } from "@/lib/server/supabase";
export const runtime = "nodejs";
export const maxDuration = 120;
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  let lease: string | null = null;
  let tenderId: string | null = null;
  let owner: string | null = null;
  let failureDb: Awaited<ReturnType<typeof requireUser>>["db"] | null = null;
  try {
    const { db, userId } = await requireUser(request);
    const { id } = await context.params;
    const row = await requireTender(db, userId, id);
    if (row.status === "ready")
      return json({
        tender: publicTender(row, await getRequirements(db, userId, id)),
      });
    if (!getConfig().aiConfigured)
      throw new AppError(
        "AI_NOT_CONFIGURED",
        "Connect Gemini to analyze documents",
        503,
      );
    await reserveAiCall(db, userId);
    const proposedLease = crypto.randomUUID();
    const claim = await db.rpc("claim_analysis", {
      p_tender: id,
      p_owner: userId,
      p_lease: proposedLease,
    });
    dbError(claim.error);
    if (!claim.data)
      throw new AppError(
        "ALREADY_PROCESSING",
        "This tender is already being analyzed. Its status will update automatically",
        409,
      );
    lease = proposedLease;
    tenderId = id;
    owner = userId;
    failureDb = db;
    const download = await db.storage
      .from(STORAGE_BUCKET)
      .download(row.storage_path);
    if (download.error || !download.data)
      throw new AppError(
        "UPLOAD_NOT_FOUND",
        "The PDF upload is missing. Select the document and upload it again",
        400,
      );
    const bytes = new Uint8Array(await download.data.arrayBuffer());
    const pages = await extractDocumentPages(bytes);
    const status = await db
      .from("tenders")
      .update({ status: "analyzing", updated_at: new Date().toISOString() })
      .eq("id", id)
      .eq("owner_id", userId)
      .eq("lease_id", lease);
    dbError(status.error);
    const analysis = await analyzeTender(pages);
    const save = await db.rpc("complete_analysis", {
      p_tender: id,
      p_owner: userId,
      p_lease: lease,
      p_analysis: analysis,
      p_pages: pages,
    });
    dbError(save.error);
    if (!save.data)
      throw new AppError(
        "ANALYSIS_EXPIRED",
        "This analysis attempt expired. Please refresh and retry",
        409,
      );
    lease = null;
    const finished = await requireTender(db, userId, id);
    return json({
      tender: publicTender(finished, await getRequirements(db, userId, id)),
    });
  } catch (error) {
    if (lease && failureDb && tenderId && owner) {
      const failure =
        error instanceof AppError
          ? error
          : new AppError(
              "ANALYSIS_FAILED",
              "Analysis could not be completed. Please retry",
              500,
            );
      await failureDb
        .from("tenders")
        .update({
          status: "failed",
          error_code: failure.code,
          error_message: failure.message,
          lease_id: null,
          processing_started_at: null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", tenderId)
        .eq("owner_id", owner)
        .eq("lease_id", lease);
    }
    return handleError(error);
  }
}

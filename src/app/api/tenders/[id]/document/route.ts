import { STORAGE_BUCKET } from "@/lib/constants";
import { AppError, handleError, json } from "@/lib/server/http";
import { requireTender } from "@/lib/server/repository";
import { requireUser } from "@/lib/server/supabase";
export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { db, userId } = await requireUser(request);
    const { id } = await context.params;
    const tender = await requireTender(db, userId, id);
    const { data, error } = await db.storage
      .from(STORAGE_BUCKET)
      .createSignedUrl(tender.storage_path, 300);
    if (error || !data?.signedUrl)
      throw new AppError(
        "DOCUMENT_UNAVAILABLE",
        "The document could not be opened. Please try again",
        503,
      );
    return json({ url: data.signedUrl });
  } catch (error) {
    return handleError(error);
  }
}

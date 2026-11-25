import { chatInputSchema } from "@/lib/analysis-schema";
import { MAX_CHAT_MESSAGES_PER_TENDER } from "@/lib/constants";
import { answerQuestion } from "@/lib/server/ai";
import {
  AppError,
  dbError,
  handleError,
  json,
  readBody,
} from "@/lib/server/http";
import {
  getMessages,
  getPages,
  requireTender,
  reserveAiCall,
} from "@/lib/server/repository";
import { requireUser } from "@/lib/server/supabase";
export const runtime = "nodejs";
export const maxDuration = 60;
type Context = { params: Promise<{ id: string }> };
export async function GET(request: Request, context: Context) {
  try {
    const { db, userId } = await requireUser(request);
    const { id } = await context.params;
    await requireTender(db, userId, id);
    return json({ messages: await getMessages(db, userId, id) });
  } catch (error) {
    return handleError(error);
  }
}
export async function POST(request: Request, context: Context) {
  try {
    const { db, userId } = await requireUser(request);
    const { id } = await context.params;
    const tender = await requireTender(db, userId, id);
    if (tender.status !== "ready")
      throw new AppError(
        "NOT_READY",
        "Finish analyzing this tender before asking questions",
        409,
      );
    const { message, locale } = await readBody(request, chatInputSchema);
    const [pages, history] = await Promise.all([
      getPages(db, userId, id),
      getMessages(db, userId, id),
    ]);
    if (!pages.length)
      throw new AppError(
        "NOT_READY",
        "Document pages are not available. Please retry the analysis",
        409,
      );
    if (history.length >= MAX_CHAT_MESSAGES_PER_TENDER)
      throw new AppError(
        "CHAT_LIMIT",
        "This tender has reached its 50-question limit",
        429,
      );
    await reserveAiCall(db, userId);
    const answer = await answerQuestion(pages, history, message, locale);
    const result = await db.rpc("save_chat_turn", {
      p_tender: id,
      p_owner: userId,
      p_question: message,
      p_answer: answer.answer,
      p_locale: locale,
      p_citations: answer.citations,
      p_supported: answer.supported,
    });
    dbError(result.error);
    return json({ messages: result.data });
  } catch (error) {
    return handleError(error);
  }
}

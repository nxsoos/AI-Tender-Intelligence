import "server-only";
import { NextResponse } from "next/server";
import { z } from "zod";

export class AppError extends Error {
  constructor(
    public code: string,
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}
export const uuid = z.uuid();
export function validateId(value: string) {
  if (!uuid.safeParse(value).success)
    throw new AppError("NOT_FOUND", "Tender not found", 404);
  return value;
}
export async function readBody<T>(
  request: Request,
  schema: z.ZodType<T>,
): Promise<T> {
  const length = Number(request.headers.get("content-length") || 0);
  if (length > 32_768)
    throw new AppError("INVALID_REQUEST", "Request is too large", 413);
  let text: string;
  try {
    const reader = request.body?.getReader();
    const chunks: Uint8Array[] = [];
    let bytes = 0;
    if (reader) {
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          bytes += value.byteLength;
          if (bytes > 32_768) {
            await reader.cancel().catch(() => undefined);
            throw new AppError("INVALID_REQUEST", "Request is too large", 413);
          }
          chunks.push(value);
        }
      } finally {
        reader.releaseLock();
      }
    }
    const buffer = new Uint8Array(bytes);
    let offset = 0;
    for (const chunk of chunks) {
      buffer.set(chunk, offset);
      offset += chunk.byteLength;
    }
    text = new TextDecoder("utf-8", { fatal: true }).decode(buffer);
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError("INVALID_REQUEST", "Request could not be read");
  }
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new AppError("INVALID_REQUEST", "Provide valid JSON");
  }
  const result = schema.safeParse(json);
  if (!result.success)
    throw new AppError(
      "INVALID_REQUEST",
      result.error.issues[0]?.message || "Invalid request",
    );
  return result.data;
}
export function json(data: unknown, status = 200) {
  return NextResponse.json(data, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}
export function handleError(error: unknown) {
  if (error instanceof AppError)
    return json(
      { error: { code: error.code, message: error.message } },
      error.status,
    );
  console.error(
    "Request failed",
    error instanceof Error ? error.name : "UnknownError",
  );
  return json(
    {
      error: {
        code: "SERVER_ERROR",
        message: "The request could not be completed. Please try again",
      },
    },
    500,
  );
}
export function dbError(error: { code?: string; message?: string } | null) {
  if (!error) return;
  if (["42P01", "42883", "PGRST202", "PGRST205"].includes(error.code || ""))
    throw new AppError(
      "DATABASE_NOT_READY",
      "Apply the Supabase database migration before using this workspace",
      503,
    );
  throw new AppError(
    "DATABASE_ERROR",
    "The change could not be saved. Please try again",
    503,
  );
}

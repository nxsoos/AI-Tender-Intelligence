import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { AppError } from "@/lib/server/http";
import { getConfig } from "@/lib/server/config";

let admin: SupabaseClient | null = null;
export function getAdmin() {
  if (!getConfig().supabaseConfigured)
    throw new AppError("NOT_CONFIGURED", "Supabase is not connected yet", 503);
  if (!admin)
    admin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      (process.env.SUPABASE_SECRET_KEY ||
        process.env.SUPABASE_SERVICE_ROLE_KEY)!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    );
  return admin;
}
export async function requireUser(request: Request) {
  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Bearer "))
    throw new AppError("UNAUTHORIZED", "A workspace session is required", 401);
  const token = authorization.slice(7);
  if (!token || token.length > 8192)
    throw new AppError("UNAUTHORIZED", "Invalid workspace session", 401);
  const db = getAdmin();
  const { data, error } = await db.auth.getUser(token);
  if (error || !data.user)
    throw new AppError(
      "UNAUTHORIZED",
      "Your workspace session expired. Refresh and try again",
      401,
    );
  return { userId: data.user.id, db };
}

import "server-only";
import { LIMITS } from "@/lib/constants";
import type { AppConfig } from "@/lib/types";

function usable(value: string | undefined) {
  return (
    !!value && !value.startsWith("YOUR_") && !value.includes("YOUR_PROJECT")
  );
}
export function getConfig(): AppConfig {
  const fields = {
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    SUPABASE_SECRET_KEY:
      process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY,
    GEMINI_API_KEY: process.env.GEMINI_API_KEY,
  };
  const missing = Object.entries(fields)
    .filter(([, value]) => !usable(value))
    .map(([key]) => key);
  const supabaseConfigured = !missing.some((name) => name.includes("SUPABASE"));
  return {
    configured: missing.length === 0,
    aiConfigured: usable(fields.GEMINI_API_KEY),
    supabaseConfigured,
    missing,
    limits: LIMITS,
  };
}

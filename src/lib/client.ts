"use client";
import {
  createClient,
  type Session,
  type SupabaseClient,
} from "@supabase/supabase-js";
import type { ApiErrorBody } from "@/lib/types";

let client: SupabaseClient | null = null;
let signingIn: Promise<Session> | null = null;
export class ApiClientError extends Error {
  constructor(
    public code: string,
    message: string,
    public status: number,
  ) {
    super(message);
    this.name = "ApiClientError";
  }
}
export function getBrowserSupabase() {
  if (client) return client;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key || url.includes("YOUR_PROJECT") || key.startsWith("YOUR_"))
    throw new ApiClientError(
      "NOT_CONFIGURED",
      "Connect Supabase to start your private workspace",
      503,
    );
  client = createClient(url, key, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
    },
  });
  return client;
}
export async function ensureGuestSession(): Promise<Session> {
  const supabase = getBrowserSupabase();
  const { data, error } = await supabase.auth.getSession();
  if (error)
    throw new ApiClientError(
      "AUTH_FAILED",
      "Your workspace session could not be restored",
      401,
    );
  if (data.session) return data.session;
  if (!signingIn) {
    signingIn = supabase.auth
      .signInAnonymously()
      .then(({ data, error }) => {
        if (error || !data.session)
          throw new ApiClientError(
            "AUTH_FAILED",
            "Your private workspace could not be created. Check that anonymous sign-ins are enabled in Supabase",
            401,
          );
        return data.session;
      })
      .finally(() => {
        signingIn = null;
      });
  }
  return signingIn;
}
export async function authenticatedFetch<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const session = await ensureGuestSession();
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${session.access_token}`);
  if (init.body && !(init.body instanceof FormData))
    headers.set("Content-Type", "application/json");
  let response: Response;
  try {
    response = await fetch(path, { ...init, headers, cache: "no-store" });
  } catch {
    throw new ApiClientError(
      "NETWORK_ERROR",
      "The connection was interrupted. Please try again",
      0,
    );
  }
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const failure = payload as ApiErrorBody | null;
    throw new ApiClientError(
      failure?.error?.code || "REQUEST_FAILED",
      failure?.error?.message || "The request could not be completed",
      response.status,
    );
  }
  return payload as T;
}

import { createClient } from "@supabase/supabase-js";
import { GoogleGenAI } from "@google/genai";
import { readFile } from "node:fs/promises";

try {
  process.loadEnvFile(".env.local");
} catch (error) {
  if (error.code !== "ENOENT") throw error;
}
const settings = {
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  SUPABASE_SECRET_KEY:
    process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY,
  GEMINI_API_KEY: process.env.GEMINI_API_KEY,
};
const missing = Object.entries(settings)
  .filter(([, v]) => !v || v.startsWith("YOUR_") || v.includes("YOUR_PROJECT"))
  .map(([k]) => k);
if (missing.length) {
  console.error(`Configure .env.local first. Missing: ${missing.join(", ")}`);
  process.exit(1);
}
const authOptions = {
  auth: { persistSession: false, autoRefreshToken: false },
};
const admin = createClient(
  settings.NEXT_PUBLIC_SUPABASE_URL,
  settings.SUPABASE_SECRET_KEY,
  authOptions,
);
const guests = [];
const objects = [];
const tenders = [];
class VerificationError extends Error {}
function safeCode(value) {
  const code = String(value || "");
  return /^(?:\d{3}|[A-Z][A-Z_]{2,59}|PGRST\d{3}|[0-9A-Z]{5}|[a-z]+(?:_[a-z]+)+)$/.test(
    code,
  ) ||
    [
      "Error",
      "ApiError",
      "AuthApiError",
      "TypeError",
      "SyntaxError",
      "AbortError",
    ].includes(code)
    ? code
    : "service_error";
}
function check(error, label) {
  if (error)
    throw new VerificationError(
      `${label} failed (${safeCode(error.code || error.status)})`,
    );
}
async function guest() {
  const client = createClient(
    settings.NEXT_PUBLIC_SUPABASE_URL,
    settings.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    authOptions,
  );
  const result = await client.auth.signInAnonymously();
  check(result.error, "Anonymous sign-in");
  if (!result.data.user || !result.data.session)
    throw new VerificationError("Anonymous sign-in returned no session");
  const value = {
    client,
    user: result.data.user,
    token: result.data.session.access_token,
  };
  guests.push(value);
  return value;
}
const full = process.argv.includes("--full");
try {
  const schema = await admin.from("tenders").select("id").limit(1);
  check(schema.error, "Database migration check");
  console.log("PASS database tables are available");
  const sessions = await Promise.allSettled([guest(), guest()]);
  const failedSession = sessions.find((result) => result.status === "rejected");
  if (failedSession) throw failedSession.reason;
  const [first, second] = sessions.map((result) => result.value);
  console.log("PASS two independent guest sessions created");
  if (full) {
    const base = process.env.APP_URL || "http://localhost:3000";
    async function api(path, method = "GET", body, token = first.token) {
      for (let attempt = 0; attempt < 2; attempt++) {
        const response = await fetch(`${base}${path}`, {
          method,
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: body ? JSON.stringify(body) : undefined,
        });
        const payload = await response.json();
        if (
          !response.ok &&
          payload.error?.code === "RATE_LIMITED" &&
          attempt === 0
        ) {
          await new Promise((resolve) => setTimeout(resolve, 3100));
          continue;
        }
        if (!response.ok)
          throw new VerificationError(
            `API ${method} ${path}: ${safeCode(payload.error?.code || response.status)}`,
          );
        return payload;
      }
      throw new VerificationError(
        "The API request remained rate limited after one retry",
      );
    }
    const bytes = await readFile("public/sample-tender.pdf");
    const created = await api("/api/tenders", "POST", {
      filename: "verification-sample.pdf",
      fileSize: bytes.length,
    });
    tenders.push(created.tender.id);
    objects.push(created.uploadPath);
    check(
      (
        await first.client.storage
          .from(created.bucket)
          .upload(created.uploadPath, bytes, { contentType: "application/pdf" })
      ).error,
      "Private PDF upload",
    );
    const crossRead = await second.client
      .from("tenders")
      .select("id")
      .eq("id", created.tender.id);
    check(crossRead.error, "RLS query");
    if (crossRead.data.length)
      throw new VerificationError(
        "RLS isolation failed: second guest read the first guest's tender",
      );
    const crossDocument = await second.client.storage
      .from(created.bucket)
      .download(created.uploadPath);
    if (!crossDocument.error)
      throw new VerificationError("Storage isolation failed");
    const forged = await first.client
      .from("tenders")
      .update({ title: "forged" })
      .eq("id", created.tender.id);
    if (!forged.error)
      throw new VerificationError(
        "Browser mutation privileges unexpectedly allowed",
      );
    console.log("PASS private storage and cross-guest read isolation");
    const analysis = await api(
      `/api/tenders/${created.tender.id}/analyze`,
      "POST",
    );
    if (
      analysis.tender.status !== "ready" ||
      !analysis.tender.analysis?.requirements.length
    )
      throw new VerificationError(
        "Real sample analysis did not produce requirements",
      );
    if (analysis.tender.deadline !== "2026-12-15")
      throw new VerificationError(
        "Sample bid deadline extraction differs from expected 2026-12-15",
      );
    const detail = await api(`/api/tenders/${created.tender.id}`);
    const item = detail.requirements[0];
    await api(
      `/api/tenders/${created.tender.id}/requirements/${item.id}`,
      "PATCH",
      { completed: true },
    );
    const reopened = await api(`/api/tenders/${created.tender.id}`);
    if (!reopened.requirements.find((row) => row.id === item.id)?.completed)
      throw new VerificationError("Checklist persistence failed");
    const answer = await api(`/api/tenders/${created.tender.id}/chat`, "POST", {
      message: "What is the bid bond requirement?",
      locale: "en",
    });
    if (
      !answer.messages.some(
        (row) =>
          row.role === "assistant" && row.supported && row.citations.length,
      )
    )
      throw new VerificationError("Real answer has no supporting citations");
    const wrongOwner = await fetch(`${base}/api/tenders/${created.tender.id}`, {
      headers: { Authorization: `Bearer ${second.token}` },
    });
    if (wrongOwner.status !== 404)
      throw new VerificationError("Cross-guest API isolation failed");
    console.log(
      "PASS live upload, Gemini analysis, deadline, saved checklist, cited Q&A and API ownership",
    );
  } else {
    const response = await new GoogleGenAI({
      apiKey: settings.GEMINI_API_KEY,
      httpOptions: { apiVersion: "v1beta", timeout: 45_000 },
    }).models.generateContent({
      model: process.env.GEMINI_MODEL || "gemini-3.5-flash",
      contents: "Return an object with ok true.",
      config: {
        responseMimeType: "application/json",
        responseJsonSchema: {
          type: "object",
          properties: { ok: { type: "boolean" } },
          required: ["ok"],
        },
      },
    });
    if (JSON.parse(response.text || "{}").ok !== true)
      throw new VerificationError("Gemini structured-output check failed");
    console.log("PASS configured Gemini model and structured output");
    console.log(
      "Run npm run verify:services -- --full while the app is running for the complete sample workflow and isolation checks.",
    );
  }
} catch (error) {
  console.error(
    error instanceof VerificationError
      ? error.message
      : `Service verification failed (${safeCode(error?.status || error?.code || error?.name)})`,
  );
  process.exitCode = 1;
} finally {
  const cleanupErrors = [];
  async function cleanup(label, operation) {
    try {
      const result = await operation();
      if (result.error)
        cleanupErrors.push(
          `${label} (${safeCode(result.error.code || result.error.status)})`,
        );
    } catch (error) {
      cleanupErrors.push(
        `${label} (${safeCode(error?.status || error?.code || error?.name)})`,
      );
    }
  }
  if (objects.length)
    await cleanup("Storage objects", () =>
      admin.storage.from("tender-documents").remove(objects),
    );
  for (const id of tenders)
    await cleanup(`Tender ${id}`, () =>
      admin.from("tenders").delete().eq("id", id),
    );
  for (const { user } of guests)
    await cleanup(`Verification user ${user.id}`, () =>
      admin.auth.admin.deleteUser(user.id),
    );
  if (cleanupErrors.length) {
    console.error(
      `Verification cleanup incomplete: ${cleanupErrors.join("; ")}. Remove only these verification records in Supabase.`,
    );
    process.exitCode = 1;
  } else if (guests.length)
    console.log("Cleaned up verification-only users and records");
}

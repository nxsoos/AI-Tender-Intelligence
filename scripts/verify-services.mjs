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
const quotaOnly = process.argv.includes("--quota");
try {
  const schema = await admin.from("tenders").select("id").limit(1);
  check(schema.error, "Database migration check");
  console.log("PASS database tables are available");
  const sessions = await Promise.allSettled([guest(), guest()]);
  const failedSession = sessions.find((result) => result.status === "rejected");
  if (failedSession) throw failedSession.reason;
  const [first, second] = sessions.map((result) => result.value);
  console.log("PASS two independent guest sessions created");
  if (quotaOnly) {
    function reservation(owner) {
      const id = crypto.randomUUID();
      tenders.push(id);
      return {
        id,
        owner_id: owner,
        filename: "quota-verification.pdf",
        title: "Temporary quota verification",
        storage_path: `${owner}/${id}/document.pdf`,
        file_size: 100,
      };
    }
    check(
      (
        await admin
          .from("tenders")
          .insert(Array.from({ length: 24 }, () => reservation(first.user.id)))
      ).error,
      "Quota setup",
    );
    const attempts = await Promise.all(
      Array.from({ length: 8 }, () =>
        admin.from("tenders").insert(reservation(first.user.id)).select("id"),
      ),
    );
    const accepted = attempts.filter((attempt) => !attempt.error).length;
    const blocked = attempts.filter(
      (attempt) => attempt.error?.code === "PT429",
    ).length;
    if (accepted !== 1 || blocked !== 7)
      throw new VerificationError(
        `Concurrent quota check failed: ${accepted} accepted, ${blocked} blocked. Apply the follow-up reservation-limit migration.`,
      );
    const count = await admin
      .from("tenders")
      .select("id", { count: "exact", head: true })
      .eq("owner_id", first.user.id);
    check(count.error, "Quota result");
    if (count.count !== 25)
      throw new VerificationError(
        "Concurrent quota check did not retain exactly 25 reservations",
      );
    check(
      (await admin.from("tenders").insert(reservation(second.user.id))).error,
      "Independent owner reservation",
    );
    console.log(
      "PASS hosted quota trigger: 8 concurrent insert attempts at 24 reservations accepted exactly 1 and rejected 7; another guest remains independent",
    );
  } else if (full) {
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
    async function expectStatus(
      path,
      status,
      token = second.token,
      method = "GET",
      body,
    ) {
      const response = await fetch(`${base}${path}`, {
        method,
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: body ? JSON.stringify(body) : undefined,
      });
      if (response.status !== status)
        throw new VerificationError(
          `Security check ${method} ${path}: expected ${status}, received ${response.status}`,
        );
    }
    const tenderPath = `/api/tenders/${created.tender.id}`;
    for (const suffix of ["", "/document", "/chat"])
      await expectStatus(`${tenderPath}${suffix}`, 404);
    await expectStatus(`${tenderPath}/analyze`, 404, second.token, "POST");
    await expectStatus(`${tenderPath}/chat`, 404, second.token, "POST", {
      message: "What is required?",
      locale: "en",
    });
    await expectStatus(
      `${tenderPath}/requirements/${item.id}`,
      404,
      second.token,
      "PATCH",
      { completed: true },
    );
    await expectStatus(tenderPath, 404, second.token, "DELETE");
    await expectStatus("/api/tenders", 401, "forged.invalid.token");
    await expectStatus(
      `${tenderPath}/requirements/${item.id}`,
      400,
      first.token,
      "PATCH",
      { completed: true, requirement: { title: "forged" } },
    );
    await expectStatus("/api/tenders", 400, first.token, "POST", {
      filename: "not-a-pdf.txt",
      fileSize: 12,
    });
    await expectStatus("/api/tenders", 400, first.token, "POST", {
      filename: "oversized.pdf",
      fileSize: 10485761,
    });
    for (const table of [
      "document_pages",
      "checklist_items",
      "chat_messages",
    ]) {
      const foreignRows = await second.client
        .from(table)
        .select("*")
        .eq("tender_id", created.tender.id);
      check(foreignRows.error, "Child record RLS check");
      if (foreignRows.data.length)
        throw new VerificationError(`Cross-guest ${table} rows were exposed`);
    }
    const directRpc = await first.client.rpc("reserve_ai_call", {
      p_owner: first.user.id,
    });
    if (!directRpc.error)
      throw new VerificationError(
        "Guest could invoke a server-only workflow function",
      );
    const publicPdf = await fetch(
      `${settings.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/${created.bucket}/${created.uploadPath}`,
    );
    if (publicPdf.ok)
      throw new VerificationError(
        "Private PDF was available through a public URL",
      );
    const signed = await api(`${tenderPath}/document`);
    const pdfResponse = await fetch(signed.url);
    if (
      !pdfResponse.ok ||
      !Buffer.from(await pdfResponse.arrayBuffer())
        .subarray(0, 5)
        .equals(Buffer.from("%PDF-"))
    )
      throw new VerificationError(
        "Authorized document URL did not serve the original PDF",
      );
    console.log(
      "PASS forged-token rejection, all cross-guest endpoints, child-row isolation, strict mutations, upload limits, private PDF and server-only RPC permissions",
    );
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
    const bondAnswer = answer.messages.find((row) => row.role === "assistant");
    if (
      !bondAnswer.citations.some(
        (citation) => citation.page === 2 && /1 percent/i.test(citation.quote),
      )
    )
      throw new VerificationError(
        "Sample bid-bond answer did not cite the known 1 percent requirement on page 2",
      );
    const unsupported = await api(
      `/api/tenders/${created.tender.id}/chat`,
      "POST",
      {
        message: "ما اسم مدير المشروع ورقم هاتفه الشخصي؟",
        locale: "ar",
      },
    );
    const arabicAnswer = unsupported.messages.find(
      (row) => row.role === "assistant",
    );
    if (
      !arabicAnswer ||
      arabicAnswer.supported ||
      arabicAnswer.citations.length ||
      !/[\u0600-\u06ff]/u.test(arabicAnswer.content)
    )
      throw new VerificationError(
        "An unsupported Arabic question did not receive an honest Arabic response",
      );
    const savedConversation = await api(
      `/api/tenders/${created.tender.id}/chat`,
    );
    if (savedConversation.messages.length !== 4)
      throw new VerificationError(
        "Conversation history was not saved completely",
      );
    console.log(
      "PASS known bid-bond evidence, Arabic unsupported-answer behavior and saved conversation",
    );
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

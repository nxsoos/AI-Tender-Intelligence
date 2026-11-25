import { afterEach, describe, expect, it, vi } from "vitest";
import { GET as configGET } from "@/app/api/config/route";
import { GET as listGET, POST as createPOST } from "@/app/api/tenders/route";
import {
  GET as detailGET,
  DELETE as cancelDELETE,
} from "@/app/api/tenders/[id]/route";
import { POST as analyzePOST } from "@/app/api/tenders/[id]/analyze/route";
import { POST as chatPOST } from "@/app/api/tenders/[id]/chat/route";
import { PATCH as checklistPATCH } from "@/app/api/tenders/[id]/requirements/[requirementId]/route";
import { GET as documentGET } from "@/app/api/tenders/[id]/document/route";

afterEach(() => vi.unstubAllEnvs());
describe("real API configuration and authorization", () => {
  it("reports missing configuration without exposing key values", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "");
    vi.stubEnv("SUPABASE_SECRET_KEY", "");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "");
    vi.stubEnv("GEMINI_API_KEY", "");
    const response = configGET();
    const body = await response.json();
    expect(body.configured).toBe(false);
    expect(body.supabaseConfigured).toBe(false);
    expect(body.aiConfigured).toBe(false);
    expect(body.missing).toContain("GEMINI_API_KEY");
    expect(Object.keys(body)).not.toContain("secretKey");
  });
  it("blocks anonymous requests on every data and AI endpoint before service access", async () => {
    const request = new Request("http://localhost/api/tenders", {
      method: "POST",
      body: "{}",
    });
    const context = {
      params: Promise.resolve({
        id: crypto.randomUUID(),
        requirementId: crypto.randomUUID(),
      }),
    };
    const responses = await Promise.all([
      listGET(request),
      createPOST(request),
      detailGET(request, context),
      cancelDELETE(request, context),
      analyzePOST(request, context),
      chatPOST(request, context),
      checklistPATCH(request, context),
      documentGET(request, context),
    ]);
    for (const response of responses) {
      expect(response.status).toBe(401);
      expect(await response.json()).toMatchObject({
        error: { code: "UNAUTHORIZED" },
      });
    }
  });
});

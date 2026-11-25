import { type Page } from "@playwright/test";
import type {
  ChecklistItem,
  ChatMessage,
  Tender,
  TenderAnalysis,
} from "../../src/lib/types";

export const TENDER_ID = "aa859eb3-c508-4e84-bc2b-f631bf92b31c";
export const USER_ID = "bb859eb3-c508-4e84-bc2b-f631bf92b31c";
export const EVIDENCE_QUOTE =
  "A bid bond of 2% of the total proposal value is mandatory.";
const localized = (en: string, ar: string) => ({ en, ar });

export function makeFixture() {
  const requirements: ChecklistItem[] = [
    {
      id: "cc859eb3-c508-4e84-bc2b-f631bf92b31c",
      title: localized("Submit a bid bond", "تقديم الضمان الابتدائي"),
      description: localized(
        "Include a bid bond for 2% of the proposal value.",
        "إرفاق ضمان ابتدائي بنسبة 2% من قيمة العرض",
      ),
      category: "administrative",
      mandatory: true,
      completed: false,
      completed_at: null,
      evidence: [{ page: 2, quote: EVIDENCE_QUOTE }],
    },
    {
      id: "dd859eb3-c508-4e84-bc2b-f631bf92b31c",
      title: localized("Provide company registration", "تقديم السجل التجاري"),
      description: localized(
        "Attach a valid commercial registration.",
        "إرفاق سجل تجاري ساري المفعول",
      ),
      category: "eligibility",
      mandatory: true,
      completed: true,
      completed_at: "2026-11-25T10:00:00Z",
      evidence: [
        {
          page: 1,
          quote: "Bidders must hold a valid commercial registration.",
        },
      ],
    },
  ];
  const analysis: TenderAnalysis = {
    title: localized(
      "Municipal digital services platform",
      "منصة الخدمات الرقمية البلدية",
    ),
    issuer: "Al Noor Municipality",
    reference: "ANM-2026-048",
    summary: localized(
      "Design and deliver a secure municipal services platform with a twelve-month support period.",
      "تصميم وتنفيذ منصة آمنة للخدمات البلدية مع دعم لمدة اثني عشر شهراً",
    ),
    deadline: {
      date: "2026-12-15",
      raw: "15 December 2026",
      status: "found",
      evidence: [
        { page: 1, quote: "Proposals must be submitted by 15 December 2026." },
      ],
    },
    requirements,
    risks: [
      {
        id: "risk-bond",
        title: localized(
          "Missing bond invalidates submission",
          "غياب الضمان يبطل المشاركة",
        ),
        description: localized(
          "A bid bond is mandatory.",
          "الضمان الابتدائي إلزامي",
        ),
        action: localized(
          "Arrange the bond before submitting.",
          "إصدار الضمان قبل التقديم",
        ),
        severity: "critical",
        kind: "explicit",
        evidence: [{ page: 2, quote: EVIDENCE_QUOTE }],
      },
      {
        id: "risk-budget",
        title: localized("Budget not specified", "الميزانية غير محددة"),
        description: localized(
          "The document does not state a budget ceiling.",
          "لا تحدد الوثيقة سقف الميزانية",
        ),
        action: localized(
          "Request clarification from the issuer.",
          "طلب توضيح من الجهة الطارحة",
        ),
        severity: "medium",
        kind: "missing_information",
        evidence: [],
      },
    ],
  };
  const tender: Tender = {
    id: TENDER_ID,
    filename: "municipal-services.pdf",
    title: "Municipal digital services platform",
    storage_path: USER_ID + "/" + TENDER_ID + "/document.pdf",
    file_size: 12500,
    status: "ready",
    analysis,
    deadline: "2026-12-15",
    page_count: 4,
    error_code: null,
    error_message: null,
    created_at: "2026-11-25T09:00:00Z",
    updated_at: "2026-11-25T10:00:00Z",
    completed_count: 1,
    requirement_count: 2,
    risk_count: 2,
  };
  return {
    tender,
    analysisTemplate: analysis,
    requirements,
    messages: [] as ChatMessage[],
    failChecklist: false,
    failChat: false,
    failStorage: false,
    chatPosts: 0,
    analyzePosts: 0,
    detailGets: 0,
    analysisGate: null as Promise<void> | null,
    analysisErrorCode: null as string | null,
    createPosts: 0,
    storagePosts: 0,
    canceledReservations: 0,
    uploadedPdfBytes: false,
  };
}
export type FixtureState = ReturnType<typeof makeFixture>;

// HTTP fixtures are confined to browser tests; the application never imports them.
export async function installFixture(page: Page, state = makeFixture()) {
  const user = {
    id: USER_ID,
    aud: "authenticated",
    role: "authenticated",
    email: "",
    app_metadata: { provider: "anonymous", providers: ["anonymous"] },
    user_metadata: {},
    identities: [],
    is_anonymous: true,
    created_at: "2026-11-25T09:00:00Z",
  };
  const token = [
    Buffer.from('{"alg":"HS256","typ":"JWT"}').toString("base64url"),
    Buffer.from(
      JSON.stringify({
        sub: USER_ID,
        role: "authenticated",
        exp: Math.floor(Date.now() / 1000) + 3600,
      }),
    ).toString("base64url"),
    "fixture",
  ].join(".");
  await page.route("https://fixture.supabase.co/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (
      path.includes("/storage/v1/object/") &&
      route.request().method() === "POST"
    ) {
      state.storagePosts++;
      state.uploadedPdfBytes =
        route.request().postDataBuffer()?.includes(Buffer.from("%PDF-")) ||
        false;
      if (state.failStorage) {
        await route.fulfill({
          status: 503,
          json: {
            statusCode: "503",
            error: "Storage unavailable",
            message: "Test upload failure",
          },
        });
        return;
      }
    }
    const data = path.includes("/auth/v1/user")
      ? user
      : path.includes("/auth/v1/")
        ? {
            access_token: token,
            token_type: "bearer",
            refresh_token: "fixture-refresh",
            expires_in: 3600,
            user,
          }
        : {
            Key: "tender-documents/" + state.tender.storage_path,
            Id: TENDER_ID,
          };
    await route.fulfill({ json: data });
  });
  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    const method = request.method();
    if (path === "/api/config") {
      await route.fulfill({
        json: {
          configured: true,
          aiConfigured: true,
          supabaseConfigured: true,
          missing: [],
          limits: {
            maxBytes: 10 * 1024 * 1024,
            maxPages: 50,
            maxCharacters: 120000,
          },
        },
      });
      return;
    }
    if (path.endsWith("/document")) {
      await route.fulfill({ json: { url: "/sample-tender.pdf" } });
      return;
    }
    if (path.includes("/requirements/") && method === "PATCH") {
      if (state.failChecklist) {
        await route.fulfill({
          status: 503,
          json: {
            error: {
              code: "DATABASE_ERROR",
              message: "The change could not be saved. Please try again",
            },
          },
        });
        return;
      }
      const id = path.split("/").at(-1);
      const item = state.requirements.find(
        (requirement) => requirement.id === id,
      )!;
      item.completed = request.postDataJSON().completed;
      item.completed_at = item.completed ? new Date().toISOString() : null;
      state.tender.completed_count = state.requirements.filter(
        (entry) => entry.completed,
      ).length;
      await route.fulfill({ json: { requirement: item } });
      return;
    }
    if (path.endsWith("/chat")) {
      if (method === "POST") {
        state.chatPosts++;
        if (state.failChat) {
          await route.fulfill({
            status: 429,
            json: {
              error: {
                code: "RATE_LIMITED",
                message: "Please wait before asking another question",
              },
            },
          });
          return;
        }
        const { message, locale } = request.postDataJSON();
        const supported = !message.toLowerCase().includes("budget");
        const response: ChatMessage[] = [
          {
            id: "question-" + state.chatPosts,
            role: "user",
            content: message,
            locale,
            supported: true,
            citations: [],
            created_at: new Date().toISOString(),
          },
          {
            id: "answer-" + state.chatPosts,
            role: "assistant",
            content: supported
              ? locale === "ar"
                ? "يجب تقديم ضمان ابتدائي بنسبة 2% من قيمة العرض"
                : "A bid bond of 2% of the proposal value is required."
              : "The document does not specify a budget ceiling.",
            locale,
            supported,
            citations: supported ? [{ page: 2, quote: EVIDENCE_QUOTE }] : [],
            created_at: new Date().toISOString(),
          },
        ];
        state.messages.push(...response);
        await route.fulfill({ json: { messages: response } });
        return;
      }
      await route.fulfill({ json: { messages: state.messages } });
      return;
    }
    if (path.endsWith("/analyze") && method === "POST") {
      state.analyzePosts++;
      if (state.analysisGate) await state.analysisGate;
      if (state.analysisErrorCode) {
        if (state.analysisErrorCode !== "RATE_LIMITED") {
          state.tender.status = "failed";
          state.tender.error_code = state.analysisErrorCode;
          state.tender.updated_at = new Date().toISOString();
        }
        await route.fulfill({
          status: 429,
          json: {
            error: {
              code: state.analysisErrorCode,
              message: "Provider request limit reached",
            },
          },
        });
        return;
      }
      state.tender.status = "ready";
      state.tender.analysis = state.analysisTemplate;
      state.tender.deadline = state.analysisTemplate.deadline.date;
      state.tender.page_count = 4;
      state.tender.requirement_count = state.requirements.length;
      state.tender.completed_count = state.requirements.filter(
        (item) => item.completed,
      ).length;
      state.tender.risk_count = state.analysisTemplate.risks.length;
      state.tender.error_code = null;
      state.tender.error_message = null;
      state.tender.updated_at = new Date().toISOString();
      await route.fulfill({ json: { tender: state.tender } });
      return;
    }
    if (path === "/api/tenders") {
      if (method === "POST") {
        state.createPosts++;
        state.tender.status = "uploaded";
        state.tender.analysis = null;
        state.tender.created_at = new Date().toISOString();
        state.tender.updated_at = state.tender.created_at;
        state.tender.deadline = null;
        state.tender.page_count = null;
        state.tender.requirement_count = 0;
        state.tender.completed_count = 0;
        state.tender.risk_count = 0;
        await route.fulfill({
          status: 201,
          json: {
            tender: state.tender,
            uploadPath: state.tender.storage_path,
            bucket: "tender-documents",
          },
        });
        return;
      }
      await route.fulfill({ json: { tenders: [state.tender] } });
      return;
    }
    if (path === "/api/tenders/" + TENDER_ID) {
      if (method === "DELETE") {
        state.canceledReservations++;
        await route.fulfill({ json: { canceled: true } });
        return;
      }
      state.detailGets++;
      await route.fulfill({
        json: {
          tender: state.tender,
          requirements: state.requirements,
          messages: state.messages,
        },
      });
      return;
    }
    await route.fulfill({
      status: 404,
      json: {
        error: { code: "NOT_FOUND", message: "Fixture route not found" },
      },
    });
  });
  return state;
}

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { analysisSchema } from "@/lib/analysis-schema";
import { geminiJsonSchema } from "@/lib/gemini-schema";
import type { TenderAnalysis } from "@/lib/types";

const sdk = vi.hoisted(() => ({ generate: vi.fn(), construct: vi.fn() }));
vi.mock("@google/genai", () => ({
  GoogleGenAI: class {
    constructor(options: unknown) {
      sdk.construct(options);
    }
    models = { generateContent: sdk.generate };
  },
}));
import { analyzeTender, answerQuestion } from "@/lib/server/ai";

const pages = [
  {
    page: 1,
    text: "A bid bond is mandatory. Submit bids by 15 December 2026.",
  },
];
const quote = { page: 1, quote: "A bid bond is mandatory." };
const successfulAnswer = {
  answer: "A bid bond is mandatory.",
  supported: true,
  citations: [quote],
};
const response = (value: unknown) => ({ text: JSON.stringify(value) });
const providerFailure = (status: number) =>
  Object.assign(
    new Error("private-provider-response-that-must-never-be-returned"),
    { status },
  );
const review = (): TenderAnalysis => ({
  title: { en: "Tender", ar: "منافسة" },
  issuer: null,
  reference: null,
  summary: { en: "Supply services", ar: "تقديم الخدمات" },
  deadline: { date: null, raw: null, status: "not_found", evidence: [] },
  requirements: [
    {
      id: "R1",
      title: { en: "Bid bond", ar: "ضمان ابتدائي" },
      description: { en: "Provide a bond", ar: "تقديم الضمان" },
      category: "administrative",
      mandatory: true,
      evidence: [quote],
    },
  ],
  risks: [],
});
const settle = <T>(promise: Promise<T>) =>
  promise.then(
    (value) => ({ value, error: undefined }),
    (error: unknown) => ({ value: undefined, error }),
  );

beforeEach(() => {
  sdk.generate.mockReset();
  sdk.construct.mockReset();
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-11-25T10:00:00Z"));
  vi.stubEnv("GEMINI_API_KEY", "test-key-never-sent-to-a-provider");
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe("Gemini transient failures", () => {
  it("retries temporary 503 with backoff and returns a sourced answer", async () => {
    sdk.generate
      .mockRejectedValueOnce(providerFailure(503))
      .mockResolvedValueOnce(response(successfulAnswer));
    const pending = settle(
      answerQuestion(pages, [], "Is a bond required?", "en"),
    );
    await vi.runAllTimersAsync();
    expect((await pending).value).toEqual(successfulAnswer);
    expect(sdk.generate).toHaveBeenCalledTimes(2);
    expect(sdk.construct).toHaveBeenCalledWith(
      expect.objectContaining({
        httpOptions: { apiVersion: "v1beta", retryOptions: { attempts: 1 } },
      }),
    );
  });

  it("stops after three temporary failures and returns no provider details", async () => {
    sdk.generate.mockRejectedValue(providerFailure(503));
    const pending = settle(answerQuestion(pages, [], "Question", "en"));
    await vi.runAllTimersAsync();
    const { error } = await pending;
    expect(error).toMatchObject({ code: "AI_UNAVAILABLE", status: 502 });
    expect(String(error)).not.toContain("private-provider");
    expect(sdk.generate).toHaveBeenCalledTimes(3);
    expect(Date.now()).toBe(Date.parse("2026-11-25T10:00:03Z"));
  });

  it.each([500, 502, 504])("retries temporary HTTP %i", async (status) => {
    sdk.generate
      .mockRejectedValueOnce(providerFailure(status))
      .mockResolvedValueOnce(response(successfulAnswer));
    const pending = settle(answerQuestion(pages, [], "Question", "en"));
    await vi.runAllTimersAsync();
    expect((await pending).error).toBeUndefined();
    expect(sdk.generate).toHaveBeenCalledTimes(2);
  });

  it.each([
    [400, "AI_REQUEST_REJECTED"],
    [401, "AI_ACCESS_DENIED"],
    [403, "AI_ACCESS_DENIED"],
    [404, "AI_MODEL_UNAVAILABLE"],
    [429, "AI_RATE_LIMITED"],
  ])("does not retry permanent or quota HTTP %i", async (status, code) => {
    sdk.generate.mockRejectedValue(providerFailure(Number(status)));
    const pending = settle(answerQuestion(pages, [], "Question", "en"));
    await vi.runAllTimersAsync();
    const { error } = await pending;
    expect(error).toMatchObject({ code });
    expect(String(error)).not.toContain("private-provider");
    expect(sdk.generate).toHaveBeenCalledTimes(1);
  });

  it("reduces the remaining timeout across retries and citation correction", async () => {
    const invalid = review();
    invalid.requirements[0].evidence[0] = {
      page: 1,
      quote: "Invented document quote.",
    };
    sdk.generate
      .mockImplementationOnce(async () => {
        vi.setSystemTime(Date.now() + 44_000);
        throw providerFailure(503);
      })
      .mockImplementationOnce(async () => {
        vi.setSystemTime(Date.now() + 44_000);
        return response(invalid);
      })
      .mockResolvedValueOnce(response(review()));
    const pending = settle(analyzeTender(pages));
    await vi.runAllTimersAsync();
    const { value, error } = await pending;
    expect(error).toBeUndefined();
    expect(value?.requirements[0].id).toMatch(/^[a-f0-9-]{36}$/);
    expect(
      sdk.generate.mock.calls.map(
        ([request]) => request.config.httpOptions.timeout,
      ),
    ).toEqual([60_000, 45_000, 1_000]);
    expect(sdk.generate.mock.calls[2][0].contents).toContain(
      "previous output failed source validation",
    );
  });

  it("stops when backoff would exceed the shared analysis budget", async () => {
    sdk.generate.mockImplementation(async () => {
      vi.setSystemTime(Date.now() + 44_000);
      throw providerFailure(503);
    });
    const pending = settle(analyzeTender(pages));
    await vi.runAllTimersAsync();
    expect((await pending).error).toMatchObject({ code: "AI_TIMEOUT" });
    expect(sdk.generate).toHaveBeenCalledTimes(2);
  });

  it("allows a valid analysis response after 55 seconds within a 60-second attempt", async () => {
    sdk.generate.mockImplementationOnce(
      () =>
        new Promise((resolve) =>
          setTimeout(() => resolve(response(review())), 55_000),
        ),
    );
    const pending = settle(analyzeTender(pages));
    await vi.advanceTimersByTimeAsync(55_000);
    expect((await pending).error).toBeUndefined();
    expect(sdk.generate).toHaveBeenCalledTimes(1);
    expect(sdk.generate.mock.calls[0][0].config.httpOptions.timeout).toBe(
      60_000,
    );
    expect(Date.now()).toBe(Date.parse("2026-11-25T10:00:55Z"));
  });

  it("keeps a slow-attempt retry inside the original 90-second analysis budget", async () => {
    sdk.generate
      .mockImplementationOnce(async () => {
        vi.setSystemTime(Date.now() + 60_000);
        throw providerFailure(504);
      })
      .mockResolvedValueOnce(response(review()));
    const pending = settle(analyzeTender(pages));
    await vi.runAllTimersAsync();
    expect((await pending).error).toBeUndefined();
    expect(
      sdk.generate.mock.calls.map(
        ([request]) => request.config.httpOptions.timeout,
      ),
    ).toEqual([60_000, 29_000]);
  });

  it("retains the 45-second request budget for chat", async () => {
    sdk.generate.mockResolvedValueOnce(response(successfulAnswer));
    const pending = settle(
      answerQuestion(pages, [], "Is a bond required?", "en"),
    );
    await vi.runAllTimersAsync();
    expect((await pending).error).toBeUndefined();
    expect(sdk.generate.mock.calls[0][0].config.httpOptions.timeout).toBe(
      45_000,
    );
  });
});

describe("Gemini structured-output boundaries", () => {
  it("uses an unbounded provider schema while retaining full local validation", async () => {
    const provider = geminiJsonSchema(analysisSchema);
    const text = JSON.stringify(provider);
    for (const keyword of [
      "minLength",
      "maxLength",
      "minItems",
      "maxItems",
      "pattern",
      "$schema",
    ])
      expect(text).not.toContain('"' + keyword + '"');
    expect(provider.type).toBe("object");
    expect(provider.required).toContain("requirements");
    expect(text).toContain("administrative");
    const invalid = review();
    invalid.title.en = "x".repeat(4001);
    sdk.generate.mockResolvedValue(response(invalid));
    const pending = settle(analyzeTender(pages));
    await vi.runAllTimersAsync();
    expect((await pending).error).toMatchObject({
      code: "AI_INVALID_RESPONSE",
    });
    expect(sdk.generate).toHaveBeenCalledTimes(1);
    expect(analysisSchema.safeParse(invalid).success).toBe(false);
  });

  it("rejects malformed JSON without retrying as a transient provider failure", async () => {
    sdk.generate.mockResolvedValue({ text: "not JSON" });
    const pending = settle(answerQuestion(pages, [], "Question", "en"));
    await vi.runAllTimersAsync();
    expect((await pending).error).toMatchObject({
      code: "AI_INVALID_RESPONSE",
    });
    expect(sdk.generate).toHaveBeenCalledTimes(1);
  });

  it("does not present a fabricated answer when a citation points at the wrong page", async () => {
    sdk.generate.mockResolvedValue(
      response({ ...successfulAnswer, citations: [{ ...quote, page: 2 }] }),
    );
    const pending = settle(answerQuestion(pages, [], "Question", "en"));
    await vi.runAllTimersAsync();
    expect((await pending).value).toMatchObject({
      supported: false,
      citations: [],
    });
  });

  it("preserves nullability and enums when stripping numerical limits", () => {
    const schema = z.object({
      count: z.number().int().min(1).max(50),
      optional: z.string().nullable(),
      kind: z.enum(["found", "missing"]),
    });
    const json = geminiJsonSchema(schema);
    expect(JSON.stringify(json)).not.toMatch(/minimum|maximum/);
    expect(json).toMatchObject({
      properties: {
        count: { type: "integer" },
        optional: { type: ["string", "null"] },
        kind: { enum: ["found", "missing"] },
      },
    });
  });

  it("preserves property names that happen to match schema constraints", () => {
    expect(
      geminiJsonSchema(
        z.object({ maximum: z.number().max(50), pattern: z.string().max(20) }),
      ),
    ).toMatchObject({
      properties: { maximum: { type: "number" }, pattern: { type: "string" } },
      required: ["maximum", "pattern"],
    });
  });
});

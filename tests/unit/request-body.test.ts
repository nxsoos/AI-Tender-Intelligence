import { describe, expect, it } from "vitest";
import { z } from "zod";
import { readBody } from "@/lib/server/http";

function streamed(
  chunks: Uint8Array[],
  declaredLength?: number,
  failCancel = false,
) {
  let canceled = false;
  const request = new Request("http://localhost/api/test", {
    method: "POST",
    headers:
      declaredLength === undefined
        ? {}
        : { "content-length": String(declaredLength) },
    body: new ReadableStream({
      start(controller) {
        for (const chunk of chunks) controller.enqueue(chunk);
      },
      cancel() {
        canceled = true;
        if (failCancel) throw new Error("Transport already closed");
      },
    }),
    duplex: "half",
  } as RequestInit);
  return { request, wasCanceled: () => canceled };
}

describe("bounded JSON request bodies", () => {
  it("rejects and cancels oversized chunked bodies even without Content-Length", async () => {
    const body = streamed([new Uint8Array(20_000), new Uint8Array(20_000)]);
    await expect(readBody(body.request, z.unknown())).rejects.toMatchObject({
      status: 413,
    });
    expect(body.wasCanceled()).toBe(true);
  });
  it("counts UTF-8 bytes instead of characters even when the length header lies", async () => {
    const bytes = new TextEncoder().encode(
      JSON.stringify({ text: "ع".repeat(17_000) }),
    );
    const body = streamed([bytes], 10);
    await expect(readBody(body.request, z.unknown())).rejects.toMatchObject({
      status: 413,
    });
    expect(body.wasCanceled()).toBe(true);
  });
  it("preserves the size error even if stream cancellation fails", async () => {
    const body = streamed([new Uint8Array(40_000)], undefined, true);
    await expect(readBody(body.request, z.unknown())).rejects.toMatchObject({
      status: 413,
    });
    expect(body.wasCanceled()).toBe(true);
  });
  it("decodes multibyte text split across chunks within the limit", async () => {
    const bytes = new TextEncoder().encode(JSON.stringify({ text: "العربية" }));
    const request = new Request("http://localhost/api/test", {
      method: "POST",
      body: new ReadableStream({
        start(controller) {
          controller.enqueue(bytes.slice(0, 11));
          controller.enqueue(bytes.slice(11));
          controller.close();
        },
      }),
      duplex: "half",
    } as RequestInit);
    await expect(
      readBody(request, z.object({ text: z.string() })),
    ).resolves.toEqual({ text: "العربية" });
  });
});

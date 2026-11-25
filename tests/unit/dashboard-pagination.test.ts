import { beforeEach, describe, expect, it, vi } from "vitest";

const auth = vi.hoisted(() => ({ requireUser: vi.fn() }));
vi.mock("@/lib/server/supabase", () => auth);
import { GET } from "@/app/api/tenders/route";

beforeEach(() => auth.requireUser.mockReset());
describe("dashboard checklist totals", () => {
  it("includes checklist items beyond PostgREST's 1,000-row response cap", async () => {
    const tenders = Array.from({ length: 20 }, (_, index) => ({
      id: "tender-" + index,
      analysis: null,
    }));
    const requirements = tenders.flatMap((tender) =>
      Array.from({ length: 80 }, (_, index) => ({
        tender_id: tender.id,
        completed: index % 2 === 0,
      })),
    );
    const ranges: [number, number][] = [];
    const query = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      in: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue({ data: tenders, error: null }),
      range: vi.fn().mockImplementation((start: number, end: number) => {
        ranges.push([start, end]);
        return Promise.resolve({
          data: requirements.slice(start, Math.min(end + 1, start + 1000)),
          error: null,
        });
      }),
    };
    auth.requireUser.mockResolvedValue({
      userId: "owner",
      db: { from: vi.fn().mockReturnValue(query) },
    });
    const response = await GET(new Request("http://localhost/api/tenders"));
    const payload = await response.json();
    expect(response.status).toBe(200);
    expect(payload.tenders).toHaveLength(20);
    expect(
      payload.tenders.every(
        (tender: { requirement_count: number; completed_count: number }) =>
          tender.requirement_count === 80 && tender.completed_count === 40,
      ),
    ).toBe(true);
    expect(ranges).toEqual([
      [0, 499],
      [500, 999],
      [1000, 1499],
      [1500, 1999],
    ]);
    expect(query.order).toHaveBeenCalledWith("id");
    expect(query.eq).toHaveBeenCalledWith("owner_id", "owner");
  });
});

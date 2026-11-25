import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// Exercise the actual migration in PostgreSQL. The small auth/storage schemas below
// stand in for Supabase's platform schemas; live Storage/Auth still need service QA.
const OWNER = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";
const TENDER = "33333333-3333-4333-8333-333333333333";
const OTHER_TENDER = "44444444-4444-4444-8444-444444444444";
const FAILED_TENDER = "55555555-5555-4555-8555-555555555555";
const LEASE = "66666666-6666-4666-8666-666666666666";
const WRONG_LEASE = "77777777-7777-4777-8777-777777777777";
const REQUIREMENT = "88888888-8888-4888-8888-888888888888";
let db: PGlite;

async function role(
  name: "authenticated" | "anon" | "service_role",
  owner = OWNER,
) {
  await db.exec("reset role");
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [
    owner,
  ]);
  await db.exec("set role " + name);
}
const path = (owner: string, tender: string) =>
  owner + "/" + tender + "/document.pdf";
const review = {
  title: { en: "Sample tender", ar: "منافسة تجريبية" },
  deadline: { date: "2026-12-15" },
  requirements: [
    {
      id: REQUIREMENT,
      title: { en: "Provide registration", ar: "تقديم السجل" },
    },
  ],
};
const pages = [
  { page: 1, text: "Bidders must hold a valid commercial registration." },
];

describe("database ownership, write boundaries, and atomic persistence", () => {
  beforeAll(async () => {
    db = new PGlite();
    await db.exec(
      [
        "create role anon nologin;",
        "create role authenticated nologin;",
        "create role service_role nologin bypassrls;",
        "create schema auth;",
        "create schema storage;",
        "create table auth.users (id uuid primary key);",
        "create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;",
        "grant usage on schema public, auth, storage to anon, authenticated, service_role;",
        "create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);",
        "create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text references storage.buckets(id), name text not null, unique(bucket_id, name));",
        "alter table storage.objects enable row level security;",
        "grant select, insert on storage.objects to authenticated;",
        "grant all on storage.objects, storage.buckets to service_role;",
        "create function storage.foldername(name text) returns text[] language sql immutable as $$ select string_to_array(name, '/') $$;",
      ].join("\n"),
    );
    const migration = readFileSync(
      resolve("supabase/migrations/20261125135924_tender_workspace.sql"),
      "utf8",
    );
    await db.exec(migration);
    await db.query("insert into auth.users(id) values ($1), ($2)", [
      OWNER,
      OTHER,
    ]);
    await db.query(
      "insert into public.tenders(id,owner_id,filename,title,storage_path,file_size) values ($1,$2,'sample.pdf','Sample',$3,100),($4,$5,'other.pdf','Other',$6,100),($7,$2,'failed.pdf','Failure test',$8,100)",
      [
        TENDER,
        OWNER,
        path(OWNER, TENDER),
        OTHER_TENDER,
        OTHER,
        path(OTHER, OTHER_TENDER),
        FAILED_TENDER,
        path(OWNER, FAILED_TENDER),
      ],
    );
  }, 60_000);
  beforeEach(async () => {
    await db.exec("reset role");
  });
  afterAll(async () => {
    await db?.close();
  });

  it("applies the migration and makes the document bucket private", async () => {
    const { rows } = await db.query<{
      public: boolean;
      file_size_limit: number;
    }>(
      "select public,file_size_limit from storage.buckets where id='tender-documents'",
    );
    expect(rows[0].public).toBe(false);
    expect(Number(rows[0].file_size_limit)).toBe(10 * 1024 * 1024);
  });

  it("only lets a guest read their own tender rows", async () => {
    await role("authenticated");
    expect(
      (await db.query<{ id: string }>("select id from public.tenders")).rows
        .map((row) => row.id)
        .sort(),
    ).toEqual([TENDER, FAILED_TENDER].sort());
    await role("authenticated", OTHER);
    expect(
      (
        await db.query<{ id: string }>("select id from public.tenders")
      ).rows.map((row) => row.id),
    ).toEqual([OTHER_TENDER]);
    await role("anon");
    await expect(db.query("select id from public.tenders")).rejects.toThrow(
      /permission denied/,
    );
  });

  it("prevents guests from changing generated findings or forging completion directly", async () => {
    await role("authenticated");
    await expect(
      db.query("update public.tenders set analysis='{}' where id=$1", [TENDER]),
    ).rejects.toThrow(/permission denied/);
    await expect(
      db.query("update public.checklist_items set completed=true"),
    ).rejects.toThrow(/permission denied/);
    await expect(
      db.query(
        "insert into public.chat_messages(tender_id,owner_id,role,content,locale) values ($1,$2,'assistant','forged','en')",
        [TENDER, OWNER],
      ),
    ).rejects.toThrow(/permission denied/);
  });

  it("permits upload only to an owned registered reservation", async () => {
    await role("authenticated");
    await db.query(
      "insert into storage.objects(bucket_id,name) values ('tender-documents',$1)",
      [path(OWNER, TENDER)],
    );
    await expect(
      db.query(
        "insert into storage.objects(bucket_id,name) values ('tender-documents',$1)",
        [path(OTHER, OTHER_TENDER)],
      ),
    ).rejects.toThrow(/row-level security/);
    await expect(
      db.query(
        "insert into storage.objects(bucket_id,name) values ('tender-documents',$1)",
        [path(OWNER, WRONG_LEASE)],
      ),
    ).rejects.toThrow(/row-level security/);
    await role("authenticated", OTHER);
    expect((await db.query("select * from storage.objects")).rows).toHaveLength(
      0,
    );
  });

  it("rejects cross-owner child records through the composite foreign key", async () => {
    await role("service_role");
    await expect(
      db.query(
        "insert into public.document_pages(tender_id,owner_id,page,text) values ($1,$2,1,'cross-user data')",
        [TENDER, OTHER],
      ),
    ).rejects.toThrow(/foreign key/);
  });

  it("restricts all privileged workflow functions to the server role", async () => {
    const { rows } = await db.query<{ allowed: boolean }>(
      "select has_function_privilege('authenticated','public.claim_analysis(uuid,uuid,uuid)','execute') as allowed",
    );
    expect(rows[0].allowed).toBe(false);
    await role("authenticated");
    await expect(
      db.query("select public.reserve_ai_call($1)", [OWNER]),
    ).rejects.toThrow(/permission denied/);
  });

  it("claims a processing lease once and rejects a different owner's claim", async () => {
    await role("service_role");
    expect(
      (
        await db.query<{ claimed: boolean }>(
          "select public.claim_analysis($1,$2,$3) as claimed",
          [TENDER, OTHER, LEASE],
        )
      ).rows[0].claimed,
    ).toBe(false);
    expect(
      (
        await db.query<{ claimed: boolean }>(
          "select public.claim_analysis($1,$2,$3) as claimed",
          [TENDER, OWNER, LEASE],
        )
      ).rows[0].claimed,
    ).toBe(true);
    expect(
      (
        await db.query<{ claimed: boolean }>(
          "select public.claim_analysis($1,$2,$3) as claimed",
          [TENDER, OWNER, WRONG_LEASE],
        )
      ).rows[0].claimed,
    ).toBe(false);
  });

  it("refuses stale completion and commits analysis, pages, and requirements together", async () => {
    await role("service_role");
    const sql =
      "select public.complete_analysis($1,$2,$3,$4::jsonb,$5::jsonb) as completed";
    expect(
      (
        await db.query<{ completed: boolean }>(sql, [
          TENDER,
          OWNER,
          WRONG_LEASE,
          JSON.stringify(review),
          JSON.stringify(pages),
        ])
      ).rows[0].completed,
    ).toBe(false);
    expect(
      (await db.query("select * from public.document_pages")).rows,
    ).toHaveLength(0);
    expect(
      (
        await db.query<{ completed: boolean }>(sql, [
          TENDER,
          OWNER,
          LEASE,
          JSON.stringify(review),
          JSON.stringify(pages),
        ])
      ).rows[0].completed,
    ).toBe(true);
    const row = (
      await db.query<{
        status: string;
        page_count: number;
        lease_id: string | null;
      }>("select status,page_count,lease_id from public.tenders where id=$1", [
        TENDER,
      ])
    ).rows[0];
    expect(row).toEqual({ status: "ready", page_count: 1, lease_id: null });
    expect(
      (
        await db.query(
          "select * from public.document_pages where tender_id=$1",
          [TENDER],
        )
      ).rows,
    ).toHaveLength(1);
    expect(
      (
        await db.query(
          "select * from public.checklist_items where tender_id=$1",
          [TENDER],
        )
      ).rows,
    ).toHaveLength(1);
    await role("authenticated", OTHER);
    expect(
      (await db.query("select * from public.document_pages")).rows,
    ).toHaveLength(0);
    expect(
      (await db.query("select * from public.checklist_items")).rows,
    ).toHaveLength(0);
  });

  it("rolls back partial page insertion if the checklist cannot be committed", async () => {
    await role("service_role");
    await db.query("select public.claim_analysis($1,$2,$3)", [
      FAILED_TENDER,
      OWNER,
      LEASE,
    ]);
    const malformed = { ...review, requirements: [{ id: "invalid-uuid" }] };
    await expect(
      db.query(
        "select public.complete_analysis($1,$2,$3,$4::jsonb,$5::jsonb)",
        [
          FAILED_TENDER,
          OWNER,
          LEASE,
          JSON.stringify(malformed),
          JSON.stringify(pages),
        ],
      ),
    ).rejects.toThrow(/uuid/);
    expect(
      (
        await db.query(
          "select * from public.document_pages where tender_id=$1",
          [FAILED_TENDER],
        )
      ).rows,
    ).toHaveLength(0);
    expect(
      (
        await db.query<{ status: string }>(
          "select status from public.tenders where id=$1",
          [FAILED_TENDER],
        )
      ).rows[0].status,
    ).toBe("extracting");
  });

  it("saves a whole conversation turn or no messages", async () => {
    await role("service_role");
    const sql =
      "select * from public.save_chat_turn($1,$2,$3,$4,'en','[]',false)";
    await expect(
      db.query(sql, [TENDER, OWNER, "Question", "x".repeat(10001)]),
    ).rejects.toThrow(/check constraint/);
    expect(
      (await db.query("select * from public.chat_messages")).rows,
    ).toHaveLength(0);
    await expect(
      db.query(sql, [TENDER, OTHER, "Question", "Answer"]),
    ).rejects.toThrow(/Tender not available/);
    expect(
      (
        await db.query(sql, [
          TENDER,
          OWNER,
          "Question",
          "The document does not specify this.",
        ])
      ).rows,
    ).toHaveLength(2);
    await role("authenticated", OTHER);
    expect(
      (await db.query("select * from public.chat_messages")).rows,
    ).toHaveLength(0);
  });

  it("allows recovery of an expired lease while rejecting the interrupted request", async () => {
    await role("service_role");
    await db.query(
      "update public.tenders set processing_started_at=now()-interval '181 seconds' where id=$1",
      [FAILED_TENDER],
    );
    expect(
      (
        await db.query<{ claimed: boolean }>(
          "select public.claim_analysis($1,$2,$3) as claimed",
          [FAILED_TENDER, OWNER, WRONG_LEASE],
        )
      ).rows[0].claimed,
    ).toBe(true);
    expect(
      (
        await db.query<{ completed: boolean }>(
          "select public.complete_analysis($1,$2,$3,$4::jsonb,$5::jsonb) as completed",
          [
            FAILED_TENDER,
            OWNER,
            LEASE,
            JSON.stringify(review),
            JSON.stringify(pages),
          ],
        )
      ).rows[0].completed,
    ).toBe(false);
    expect(
      (
        await db.query<{ lease_id: string }>(
          "select lease_id from public.tenders where id=$1",
          [FAILED_TENDER],
        )
      ).rows[0].lease_id,
    ).toBe(WRONG_LEASE);
  });

  it("enforces an account-wide request budget across database calls", async () => {
    await role("service_role");
    expect(
      (
        await db.query<{ result: string }>(
          "select public.reserve_ai_call($1) as result",
          [OWNER],
        )
      ).rows[0].result,
    ).toBe("ok");
    expect(
      (
        await db.query<{ result: string }>(
          "select public.reserve_ai_call($1) as result",
          [OWNER],
        )
      ).rows[0].result,
    ).toBe("too_fast");
    await db.query(
      "update public.ai_usage set calls=100,last_call_at=now()-interval '10 seconds' where owner_id=$1",
      [OWNER],
    );
    expect(
      (
        await db.query<{ result: string }>(
          "select public.reserve_ai_call($1) as result",
          [OWNER],
        )
      ).rows[0].result,
    ).toBe("daily_limit");
    await db.query(
      "update public.ai_usage set usage_date=current_date-1,last_call_at=now()-interval '10 seconds' where owner_id=$1",
      [OWNER],
    );
    expect(
      (
        await db.query<{ result: string }>(
          "select public.reserve_ai_call($1) as result",
          [OWNER],
        )
      ).rows[0].result,
    ).toBe("ok");
  });
});

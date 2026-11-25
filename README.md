# AI Tender Intelligence

A bilingual workspace for reviewing government tenders. Upload a PDF, review extracted obligations and risks, complete a persistent checklist, and ask questions with quotations tied to physical document pages.

Built for the Sirati assessment with Next.js, TypeScript, Tailwind, shadcn/ui, Hugeicons, Supabase and Gemini. The interface is an original procurement-review workspace; the reference screenshots informed quality rather than copied layouts.

## Run locally

Requires Node.js **24+**, npm, a Supabase project, and a Gemini API key with access to the configured model.

```powershell
npm ci
Copy-Item .env.example .env.local
# Fill in .env.local and configure Supabase as below.
npm run dev
```

Open http://localhost:3000. Without service configuration the app displays an honest setup/empty state. It never substitutes canned analysis or fake assistant answers.

## Supabase setup

1. Create a Supabase project. Under **Authentication → Providers/Sign In**, enable **Anonymous Sign-Ins**. Review anonymous-auth rate limits for the intended assessment audience.
2. Open the SQL Editor and execute the migration files once, in this order:

   - `supabase/migrations/20261125135924_tender_workspace.sql` creates tables, indexes, ownership policies, atomic processing functions, and the private `tender-documents` bucket.
   - `supabase/migrations/20261125150006_enforce_tender_reservation_limit.sql` makes the 25-tender limit safe against simultaneous uploads.

   If you already ran the initial migration, run **only the second file**. Do not rerun the initial setup over an existing schema. The second migration must be applied before the concurrent-upload quota fix protects a hosted project.
3. Alternatively, use the pinned CLI:

   ```powershell
   npx supabase login
   npx supabase link --project-ref YOUR_PROJECT_REF
   npx supabase db push --remote
   ```

   The CLI asks for the remote database credentials/confirmation. Use a scoped access token when automating; do not commit it. The pinned CLI is version 3 and defaults database commands to local, so the `--remote` flag is intentional.

4. Copy the API settings into `.env.local`:

   | Variable | Purpose |
   |---|---|
   | `NEXT_PUBLIC_SUPABASE_URL` | Project URL |
   | `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Browser-safe publishable API key |
   | `SUPABASE_SECRET_KEY` | Server-only privileged key; legacy `SUPABASE_SERVICE_ROLE_KEY` also accepted |
   | `GEMINI_API_KEY` | Server-only Google AI Studio API key |
   | `GEMINI_MODEL` | Initially `gemini-3.5-flash`; use a structured-output-capable model available to your key |

5. Keep the bucket **private**. The migration restricts it to PDFs up to 10 MB. A browser upload must match an owned, registered tender path; object replacement is disabled.
6. Restart after changing environment variables. Browser-prefixed Supabase settings are embedded during build, so deployed changes require a rebuild.

Authenticated browser clients can only read their own application records. Database mutations run through server endpoints after token and ownership checks. Row-level security and storage policies enforce guest isolation independently of UI navigation. The server secret must never have a `NEXT_PUBLIC_` prefix.

## Gemini and service verification

Create an API key in Google AI Studio and set `GEMINI_API_KEY`. The server uses the official `@google/genai` SDK, structured JSON output, and runtime validation. The model name is configurable rather than baked into the UI.

```powershell
npm run verify:services
```

This checks database availability, anonymous sign-in and a real Gemini structured response. It creates two temporary verification users and removes them afterwards. It never prints key values.

For the complete real-service workflow, keep `npm run dev` running in another terminal:

```powershell
npm run verify:services -- --full
```

The full check uploads the actual sample, analyzes it through the app, checks the known deadline, saves and rereads a completed requirement, asks a cited question, and checks that a different guest cannot read the tender via the API, database or storage. Set `APP_URL` to check a deployment. Temporary users, records and objects are cleaned up. This calls Gemini and consumes its normal API quota.

After applying the reservation-limit migration, independently verify the hosted concurrency protection without making Gemini calls:

```powershell
npm run verify:services -- --quota
```

This creates verification-only records for two temporary guests, starts eight concurrent inserts at 24 reservations, and expects exactly one acceptance and seven database rejections. It checks another guest remains independent, then removes all verification records. It does not modify existing tenders.

Passing local tests does not establish that your live Supabase or Gemini account is configured; run these checks after setup.

## Sample and demonstration

`public/sample-tender.pdf` is a fictional four-page selectable-text document. Download it or choose **Analyze sample tender** in the app to run the real workflow. Regenerate with `npm run sample`.

| Finding | Expected evidence |
|---|---|
| Bid deadline | 15 December 2026, 14:00 Arabia Standard Time, Page 1 |
| Clarification deadline | 5 December 2026, Page 1; must not replace the bid deadline |
| Bid bond | 1%, valid for 90 days; omission leads to disqualification, Page 2 |
| Experience | Three public-sector projects within five years, Page 2 |
| Data location | Saudi Arabia, Page 3 |
| Mobile app | Optional, Page 3 |
| Milestones | Discovery 2 weeks, prototype 6 weeks, production 16 weeks, Page 4 |
| Budget/payment schedule | Explicitly unspecified, Page 4; never invent a value |

Suggested walkthrough: analyze the sample, inspect the bid-bond risk and its source, complete its checklist item, reload to verify persistence, ask “What is the bid bond requirement?”, then switch to Arabic and check the mirrored layout. Checklist completion records the reviewer's work; it does not certify legal eligibility.

## Architecture and decisions

- **Frontend:** dashboard `/` and tender workspace `/tenders/[id]`. Overview, Requirements, Risks and Assistant tabs share an evidence drawer with original quotations and PDF-page links. Language switching preserves the current tender and tab.
- **Guest identity:** Supabase persists a private guest session in the browser. Data survives reloads and browser reopening while that identity remains available. Clearing browser data, signing out, or changing devices loses access; cross-device account recovery is outside scope.
- **Uploads:** register an owned reservation, upload directly to private Supabase Storage, then analyze. PDF bytes do not pass through Vercel's request-body limit. Failed browser uploads can cancel their unprocessed reservation.
- **PDF processing:** `unpdf` extracts separate physical pages. Limits: 10 MB, 50 pages, 120,000 extracted characters. Corrupt, encrypted, textless, scan-like and oversized documents return actionable errors. Nothing is silently truncated.
- **AI extraction:** page-labelled tender text is untrusted evidence, never instructions. Gemini produces English/Arabic narratives once, including eligibility, deliverables, technical and administrative requirements. Explicit findings, inferred risks and missing information are distinguished. Requests explicitly use `v1beta` and a structural JSON schema; the full Zod schema still validates every response locally. This avoids provider schema-complexity limits without relaxing application validation.
- **Citations:** page numbers and exact original quotations are checked against extracted text with Unicode/whitespace normalization. Analysis gets one source-correction attempt. Unsupported or unverified chat results become an honest inability to find evidence. A matching quotation proves source presence, not that every AI interpretation is correct.
- **Dates:** separate bid and clarification deadlines. Missing dates display “Not found”; conflicting dates display “Needs review”. Preserve original wording and never invent a missing hour/timezone.
- **Persistence:** PostgreSQL stores tender metadata, pages, checklist and chat. Analysis, generated requirements and ready status are committed in one transaction. A database processing lease prevents concurrent work and allows retries after 180 seconds if a request was interrupted; an old request cannot overwrite a newer lease.
- **Execution:** analysis is awaited within a Node.js request with a 120-second route budget. Each Gemini analysis attempt can take up to 60 seconds, with a shared 90-second budget across source correction and up to three attempts for temporary server errors and 1/2-second backoff. The interface explains that analysis may take about a minute and can take longer for larger documents or busy periods. Chat retains a 45-second budget. Invalid requests, access failures, unavailable model names, and quota errors are not automatically retried. No fire-and-forget tasks. Authenticated data and signed URLs are uncached.
- **Usage bounds:** 25 tender reservations per guest, 100 AI calls daily, at least three seconds between AI calls, and 50 questions per tender. The AI budget uses database locking and is shared across server instances. The follow-up migration serializes tender reservations per owner so simultaneous uploads cannot bypass the cap. Dashboard checklist aggregation paginates database responses to retain accurate totals above 1,000 requirements. JSON request bodies are limited to 32 KiB of UTF-8 bytes while streaming, including requests without a length header.
- **Secrets:** only the Supabase URL/publishable key reach the browser. Gemini and privileged Supabase keys remain server-side. API errors do not expose raw provider responses or credentials.

### API

All data endpoints require `Authorization: Bearer <Supabase access token>`. Errors use `{ "error": { "code": "...", "message": "..." } }`.

| Endpoint | Behavior |
|---|---|
| `GET /api/config` | Safe readiness flags and document limits |
| `GET /api/tenders` | Owned tenders and saved progress |
| `POST /api/tenders` | `{filename,fileSize}` → reservation, bucket and upload path |
| `GET /api/tenders/:id` | Tender, requirements and messages |
| `DELETE /api/tenders/:id` | Cancel an owned unprocessed upload reservation |
| `POST /api/tenders/:id/analyze` | Extract, analyze and atomically persist; retry stale/failed attempts |
| `PATCH /api/tenders/:id/requirements/:requirementId` | Accept only `{completed:boolean}` |
| `GET/POST /api/tenders/:id/chat` | Read messages or ask `{message,locale}` and save a complete turn |
| `GET /api/tenders/:id/document` | Short-lived authorized document URL |

## Checks

```powershell
npm run typecheck
npm run lint
npm test
npm run build
npx playwright install chromium
npm run test:e2e
```

Unit checks cover structured schemas, citations, dates, progress, real sample extraction, scanned-page rejection and unauthorized API access. Database tests execute the migration in embedded PostgreSQL with minimal Supabase schema stubs to exercise actual SQL, transactions, row security and privileges. They do not replace live Supabase Auth/Storage verification. Browser tests use deterministic API fixtures when credentials are absent; real-provider checks remain separate in `verify:services`.

Browser tests run a source-only copy in ignored `.playwright-app/` on port 3100, with separate build output and fixture credentials. They do not load `.env.local` or stop your development server on port 3000. The full service check creates and removes its own temporary guests and documents; it does not edit existing tenders. It also checks forged tokens, cross-guest endpoints and child records, server-only database functions, strict request fields, private PDF access, source evidence, Arabic unsupported answers, and saved conversation history.

### Checkup results — 25 November 2026

| Check | Result |
|---|---|
| TypeScript, ESLint, production build | Passed |
| Unit and PostgreSQL migration checks | 51 passed |
| Chromium browser/API checks | 22 passed, including mobile RTL, error recovery, escaped hostile text, empty checklists, and automated accessibility |
| Live Supabase/Gemini sample workflow | Passed upload, analysis, known deadline/bid-bond evidence, saved checklist/chat, and Arabic unsupported-answer behavior |
| Live authorization/storage checks | Passed forged-token rejection, all cross-guest data endpoints, child-row isolation, private PDF access, and server-only function permissions |
| Hosted concurrent-upload quota | Passed after the follow-up migration: eight attempts at 24 reservations accepted one and rejected seven |
| Dependency audit | Zero known vulnerabilities reported by `npm audit` |
| Secret exposure scan | No configured Gemini/privileged Supabase key values found in tracked files or 35 production browser assets; `.env.local` is ignored |

The review found and fixed truncated dashboard totals above 1,000 requirement rows, a concurrent-upload quota race, unbounded chunked JSON buffering, and misleading guidance for a truly empty checklist. All six core assessment features are represented. The live checks removed their temporary records. Vercel deployment itself has not been tested; repeat the service check against the deployed URL. See the scope notes below for public-abuse and hostile-PDF limitations.

## Vercel deployment

1. Push the source and lockfile to your GitHub repository. Keep `.env.local` ignored.
2. In Vercel, import the repository using the **Next.js** preset and repository root. Select Node.js **24.x**. Build command: `npm run build`.
3. Add the five environment variables above for Production and any Preview environment you intend to use. Never prefix secret keys with `NEXT_PUBLIC_`.
4. Deploy. Apply the Supabase migration separately; Vercel does not provision the database.
5. On the live URL, analyze the sample, save a checklist item, reload, ask a cited question and check both languages on mobile.
6. Optionally set `APP_URL` to the live URL and run `npm run verify:services -- --full`. Deployment protection must permit the verification requests.
7. Submit the live URL, GitHub URL, README and sample PDF. Confirm Gemini completes within the function-duration budget.

Cloning/building this repository does not create cloud resources or deploy an app. Project credentials and hosting access are supplied by the owner.

## Scope and credits

Selectable-text PDFs are supported. Scanned documents/OCR, complex layout reconstruction, team roles, account recovery, cross-tender chat, dark mode and vector search are outside this assessment version. Bounded complete-document context keeps questions traceable without an extra retrieval service. Larger documents should move to durable background processing.

Before exposing an unrestricted public demo, configure anonymous-auth abuse protection and provider spending controls: a visitor can create another guest identity, so per-guest limits are not a global cost ceiling. PDF processing enforces byte/page/text/image bounds, but it is not isolated in a separate process with a hard CPU deadline. Use trusted assessment documents; hostile-document processing at production scale needs worker isolation. A clean dependency audit and passing tests do not guarantee the absence of vulnerabilities.

The sample tender is fictional and generated for this repository. Design used UI/UX Pro Max and ui-styling guidance. Unslop is by **Damir Sokolovsky** ([@heydamir](https://x.com/heydamir)), used under **CC BY 4.0**: https://github.com/heydamir/unslop. Reference screenshots were not copied.

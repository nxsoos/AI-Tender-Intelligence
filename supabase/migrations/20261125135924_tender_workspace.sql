-- Server mutations use the secret key after validating the guest and ownership.
-- Browser clients have SELECT-only access to their own rows and INSERT-only
-- access to a PDF object belonging to a newly created tender.
create table public.tenders (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  filename text not null check (length(filename) between 1 and 200),
  title text not null,
  storage_path text not null unique,
  file_size integer not null check (file_size > 0 and file_size <= 10485760),
  status text not null default 'uploaded' check (status in ('uploaded','extracting','analyzing','ready','failed')),
  analysis jsonb,
  deadline date,
  page_count integer check (page_count between 1 and 50),
  error_code text,
  error_message text,
  processing_started_at timestamptz,
  lease_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, owner_id),
  constraint owned_storage_path check (storage_path = owner_id::text || '/' || id::text || '/document.pdf')
);
create index tenders_owner_created_idx on public.tenders (owner_id, created_at desc);
create index tenders_owner_deadline_idx on public.tenders (owner_id, deadline);

create table public.document_pages (
  tender_id uuid not null,
  owner_id uuid not null,
  page integer not null check (page between 1 and 50),
  text text not null,
  primary key (tender_id, page),
  foreign key (tender_id, owner_id) references public.tenders(id, owner_id) on delete cascade
);
create index document_pages_owner_idx on public.document_pages (owner_id);

create table public.checklist_items (
  id uuid primary key,
  tender_id uuid not null,
  owner_id uuid not null,
  requirement jsonb not null,
  position integer not null,
  completed boolean not null default false,
  completed_at timestamptz,
  foreign key (tender_id, owner_id) references public.tenders(id, owner_id) on delete cascade
);
create index checklist_items_tender_position_idx on public.checklist_items (tender_id, position);
create index checklist_items_owner_idx on public.checklist_items (owner_id);

create table public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  tender_id uuid not null,
  owner_id uuid not null,
  role text not null check (role in ('user','assistant')),
  content text not null check (length(content) between 1 and 10000),
  locale text not null check (locale in ('en','ar')),
  citations jsonb not null default '[]',
  supported boolean not null default false,
  created_at timestamptz not null default now(),
  foreign key (tender_id, owner_id) references public.tenders(id, owner_id) on delete cascade
);
create index chat_messages_tender_created_idx on public.chat_messages (tender_id, created_at);
create index chat_messages_owner_idx on public.chat_messages (owner_id);

create table public.ai_usage (
  owner_id uuid primary key references auth.users(id) on delete cascade,
  usage_date date not null default current_date,
  calls integer not null default 0,
  last_call_at timestamptz
);

alter table public.tenders enable row level security;
alter table public.document_pages enable row level security;
alter table public.checklist_items enable row level security;
alter table public.chat_messages enable row level security;
alter table public.ai_usage enable row level security;

revoke all on public.tenders, public.document_pages, public.checklist_items, public.chat_messages, public.ai_usage from anon, authenticated;
grant select on public.tenders, public.document_pages, public.checklist_items, public.chat_messages to authenticated;
grant all on public.tenders, public.document_pages, public.checklist_items, public.chat_messages, public.ai_usage to service_role;

create policy "Read owned tenders" on public.tenders for select to authenticated using ((select auth.uid()) = owner_id);
create policy "Read owned document pages" on public.document_pages for select to authenticated using ((select auth.uid()) = owner_id);
create policy "Read owned requirements" on public.checklist_items for select to authenticated using ((select auth.uid()) = owner_id);
create policy "Read owned chat" on public.chat_messages for select to authenticated using ((select auth.uid()) = owner_id);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('tender-documents','tender-documents',false,10485760,array['application/pdf'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

create policy "Upload own registered tender PDF" on storage.objects for insert to authenticated with check (
  bucket_id = 'tender-documents'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and exists (select 1 from public.tenders t where t.owner_id = (select auth.uid()) and t.storage_path = name and t.status = 'uploaded')
);
create policy "Read own tender PDFs" on storage.objects for select to authenticated using (
  bucket_id = 'tender-documents'
  and exists (select 1 from public.tenders t where t.owner_id = (select auth.uid()) and t.storage_path = name)
);

-- A row lock enforces the daily request budget and minimum spacing even when
-- requests reach different Vercel instances. No process-local counters.
create function public.reserve_ai_call(p_owner uuid) returns text
language plpgsql security invoker set search_path = '' as $$
declare v_usage public.ai_usage;
begin
  insert into public.ai_usage(owner_id) values (p_owner) on conflict do nothing;
  select * into v_usage from public.ai_usage where owner_id = p_owner for update;
  if v_usage.last_call_at > now() - interval '3 seconds' then return 'too_fast'; end if;
  if v_usage.usage_date = current_date and v_usage.calls >= 100 then return 'daily_limit'; end if;
  update public.ai_usage set calls = case when usage_date = current_date then calls + 1 else 1 end,
    usage_date = current_date, last_call_at = now() where owner_id = p_owner;
  return 'ok';
end;
$$;

create function public.claim_analysis(p_tender uuid, p_owner uuid, p_lease uuid) returns boolean
language plpgsql security invoker set search_path = '' as $$
declare v_rows integer;
begin
  update public.tenders set status = 'extracting', lease_id = p_lease,
    processing_started_at = now(), updated_at = now(), error_code = null, error_message = null
  where id = p_tender and owner_id = p_owner
    and (status in ('uploaded','failed') or (status in ('extracting','analyzing') and processing_started_at < now() - interval '180 seconds'));
  get diagnostics v_rows = row_count;
  return v_rows = 1;
end;
$$;

create function public.complete_analysis(p_tender uuid, p_owner uuid, p_lease uuid, p_analysis jsonb, p_pages jsonb) returns boolean
language plpgsql security invoker set search_path = '' as $$
declare v_item jsonb; v_position integer = 0;
begin
  perform 1 from public.tenders where id = p_tender and owner_id = p_owner and lease_id = p_lease and status in ('extracting','analyzing') for update;
  if not found then return false; end if;
  delete from public.document_pages where tender_id = p_tender and owner_id = p_owner;
  insert into public.document_pages(tender_id, owner_id, page, text)
    select p_tender, p_owner, (item->>'page')::integer, item->>'text' from jsonb_array_elements(p_pages) item;
  delete from public.checklist_items where tender_id = p_tender and owner_id = p_owner;
  for v_item in select value from jsonb_array_elements(p_analysis->'requirements') loop
    insert into public.checklist_items(id, tender_id, owner_id, requirement, position)
      values ((v_item->>'id')::uuid, p_tender, p_owner, v_item, v_position);
    v_position := v_position + 1;
  end loop;
  update public.tenders set status = 'ready', analysis = p_analysis,
    title = p_analysis->'title'->>'en', deadline = (p_analysis->'deadline'->>'date')::date,
    page_count = jsonb_array_length(p_pages), lease_id = null, processing_started_at = null,
    error_code = null, error_message = null, updated_at = now()
    where id = p_tender and owner_id = p_owner;
  return true;
end;
$$;

create function public.save_chat_turn(p_tender uuid, p_owner uuid, p_question text, p_answer text, p_locale text, p_citations jsonb, p_supported boolean)
returns setof public.chat_messages
language plpgsql security invoker set search_path = '' as $$
begin
  perform 1 from public.tenders where id = p_tender and owner_id = p_owner and status = 'ready' for update;
  if not found then raise exception 'Tender not available'; end if;
  if (select count(*) from public.chat_messages where tender_id = p_tender and owner_id = p_owner) >= 100 then raise exception 'Chat message limit reached'; end if;
  return query insert into public.chat_messages(tender_id, owner_id, role, content, locale, citations, supported, created_at)
    values (p_tender, p_owner, 'user', p_question, p_locale, '[]', false, clock_timestamp()),
           (p_tender, p_owner, 'assistant', p_answer, p_locale, p_citations, p_supported, clock_timestamp())
    returning *;
end;
$$;

revoke all on function public.reserve_ai_call(uuid), public.claim_analysis(uuid,uuid,uuid), public.complete_analysis(uuid,uuid,uuid,jsonb,jsonb), public.save_chat_turn(uuid,uuid,text,text,text,jsonb,boolean) from public, anon, authenticated;
grant execute on function public.reserve_ai_call(uuid), public.claim_analysis(uuid,uuid,uuid), public.complete_analysis(uuid,uuid,uuid,jsonb,jsonb), public.save_chat_turn(uuid,uuid,text,text,text,jsonb,boolean) to service_role;

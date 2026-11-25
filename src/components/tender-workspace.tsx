"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import * as Checkbox from "@radix-ui/react-checkbox";
import type {
  ChatMessage,
  ChecklistItem,
  Evidence,
  Risk,
  TenderDetail,
  TenderStatus,
} from "@/lib/types";
import { authenticatedFetch } from "@/lib/client";
import { formatDate, formatNumber, localized } from "@/lib/i18n";
import { useWorkspace, errorText } from "./workspace-provider";
import { WorkspaceShell } from "./workspace-shell";
import { Completion, StatusBadge } from "./dashboard";
import { EvidenceDrawer, EvidenceLinks } from "./evidence-drawer";
import { Icon } from "./icons";
import { Button } from "./ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./ui/tabs";

const activeStatuses: TenderStatus[] = ["extracting", "analyzing"];
type TabName = "overview" | "requirements" | "risks" | "assistant";
const tabs: TabName[] = ["overview", "requirements", "risks", "assistant"];

export function TenderWorkspace({ id }: { id: string }) {
  const {
    t,
    locale,
    config,
    reload,
    analysisRequests,
    startAnalysis,
    loadError: workspaceLoadError,
  } = useWorkspace();
  const [detail, setDetail] = useState<TenderDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dismissedAnalysisError, setDismissedAnalysisError] =
    useState<unknown>(null);
  const analysisRequest = analysisRequests[id];
  const analysisBusy =
    !!analysisRequest?.pending ||
    (!!analysisRequest &&
      !analysisRequest.error &&
      !analysisRequest.pending &&
      detail?.tender.status !== "ready");
  const [evidence, setEvidence] = useState<Evidence | null>(null);
  const [documentBusy, setDocumentBusy] = useState(false);
  const [documentError, setDocumentError] = useState(false);
  const [leaseExpired, setLeaseExpired] = useState(false);
  const started = useRef<string | null>(null);
  const loadSequence = useRef(0);
  const query = useSearchParams();
  const router = useRouter();
  const queryTab = query.get("tab");
  const tab: TabName = tabs.includes(queryTab as TabName)
    ? (queryTab as TabName)
    : "overview";
  function changeTab(value: string) {
    router.replace(`/tenders/${id}?tab=${value}`, { scroll: false });
  }
  const load = useCallback(
    async (quiet = false) => {
      if (!config?.supabaseConfigured) return;
      const sequence = ++loadSequence.current;
      try {
        const data = await authenticatedFetch<TenderDetail>(
          `/api/tenders/${id}`,
        );
        if (sequence !== loadSequence.current) return;
        if (!quiet) setError(null);
        setDetail((current) => {
          if (
            current &&
            current.tender.id === data.tender.id &&
            (Date.parse(data.tender.updated_at) <
              Date.parse(current.tender.updated_at) ||
              (current.tender.status === "ready" &&
                data.tender.status !== "ready" &&
                current.tender.updated_at === data.tender.updated_at))
          )
            return current;
          return data;
        });
        setLeaseExpired(
          activeStatuses.includes(data.tender.status) &&
            Date.now() - new Date(data.tender.updated_at).getTime() >= 180000,
        );
      } catch (issue) {
        if (sequence === loadSequence.current && !quiet)
          setError(errorText(issue, locale));
      } finally {
        if (sequence === loadSequence.current) setLoading(false);
      }
    },
    [id, config?.supabaseConfigured, locale],
  );
  // The loader synchronizes this route with a server resource and only sets state after awaiting the response.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (config?.supabaseConfigured) void load();
  }, [load, config?.supabaseConfigured, analysisRequest?.pending]);
  const persistedStatus = detail?.tender.status;
  useEffect(() => {
    if (
      !persistedStatus ||
      (!analysisBusy && !activeStatuses.includes(persistedStatus))
    )
      return;
    const timer = window.setInterval(() => {
      void load(true);
    }, 2500);
    return () => window.clearInterval(timer);
  }, [persistedStatus, load, analysisBusy]);
  const analyze = useCallback(async () => {
    if (
      !detail?.tender ||
      detail.tender.id !== id ||
      analysisBusy ||
      !config?.aiConfigured
    )
      return;
    setError(null);
    await startAnalysis(detail.tender);
  }, [detail, id, config?.aiConfigured, analysisBusy, startAnalysis]);
  useEffect(() => {
    if (
      query.get("analyze") === "1" &&
      detail?.tender.id === id &&
      detail?.tender.status === "uploaded" &&
      started.current !== id &&
      config?.aiConfigured
    ) {
      started.current = id;
      void analyze();
    }
  }, [
    query,
    id,
    detail?.tender.id,
    detail?.tender.status,
    config?.aiConfigured,
    analyze,
  ]);
  async function openPdf() {
    setDocumentBusy(true);
    setDocumentError(false);
    const windowRef = window.open("about:blank", "_blank");
    if (windowRef) windowRef.opener = null;
    try {
      const { url } = await authenticatedFetch<{ url: string }>(
        `/api/tenders/${id}/document`,
      );
      if (windowRef) windowRef.location.href = url;
      else window.location.assign(url);
    } catch {
      windowRef?.close();
      setDocumentError(true);
    } finally {
      setDocumentBusy(false);
    }
  }
  const originalTender = detail?.tender;
  const analysisError =
    !analysisBusy &&
    originalTender?.status !== "ready" &&
    analysisRequest?.error
      ? errorText(analysisRequest.error, locale, "analysisFailedDescription")
      : null;
  const tender =
    originalTender && analysisBusy && originalTender.status !== "ready"
      ? {
          ...originalTender,
          status:
            originalTender.status === "analyzing"
              ? ("analyzing" as const)
              : ("extracting" as const),
        }
      : originalTender && analysisError && originalTender.status === "uploaded"
        ? { ...originalTender, status: "failed" as const }
        : originalTender;
  const analysis = tender?.analysis;
  const displayError =
    error ||
    (tender &&
    activeStatuses.includes(tender.status) &&
    analysisRequest?.error !== dismissedAnalysisError
      ? analysisError
      : null);
  const notConfigured = !!config && !config.supabaseConfigured;
  return (
    <WorkspaceShell tender>
      <Link href="/" className="back-link">
        <Icon name="back" size={17} className="directional" />
        {t("backDashboard")}
      </Link>
      {workspaceLoadError && !config ? (
        <section className="panel workspace-unavailable">
          <span className="icon-tile">
            <Icon name="alert" size={28} />
          </span>
          <h1>{t("errorTitle")}</h1>
          <p>{workspaceLoadError}</p>
          <Button variant="outline" onClick={() => void reload()}>
            {t("tryAgain")}
          </Button>
        </section>
      ) : notConfigured ? (
        <section className="panel workspace-unavailable">
          <span className="icon-tile">
            <Icon name="link" size={28} />
          </span>
          <h1>{t("setupTitle")}</h1>
          <p>{t("setupDescription")}</p>
          <Button variant="outline" asChild>
            <Link href="/">{t("backDashboard")}</Link>
          </Button>
        </section>
      ) : loading ? (
        <div className="workspace-loading" role="status">
          <span className="spinner" />
          <p>{t("loading")}</p>
        </div>
      ) : !detail ? (
        <section className="panel workspace-unavailable">
          <span className="icon-tile">
            <Icon name="file" size={28} />
          </span>
          <h1>{t("tenderNotFound")}</h1>
          <p>{error || t("tenderNotFoundNote")}</p>
          <Button variant="outline" onClick={() => void load()}>
            {t("tryAgain")}
          </Button>
        </section>
      ) : (
        <>
          <div className="tender-page-heading">
            <div className="tender-title-block">
              <span className="file-icon large">
                <Icon name="file" size={28} />
              </span>
              <div>
                <div className="tender-heading-meta">
                  <span>
                    {analysis?.reference ? (
                      <bdi>{analysis.reference}</bdi>
                    ) : (
                      t("document")
                    )}
                  </span>
                  <span className="meta-dot" />
                  {tender?.page_count ? (
                    <span>
                      {locale === "ar"
                        ? `${t("totalPages")}: ${formatNumber(tender.page_count, locale)}`
                        : `${formatNumber(tender.page_count, locale)} ${t("pages")}`}
                    </span>
                  ) : (
                    <bdi>{tender?.filename}</bdi>
                  )}
                </div>
                <h1>
                  <bdi>
                    {localized(analysis?.title, locale) ||
                      tender?.title ||
                      tender?.filename}
                  </bdi>
                </h1>
                <p>
                  <bdi>{analysis?.issuer || t("noIssuer")}</bdi>
                </p>
              </div>
            </div>
            <div className="tender-heading-actions">
              <StatusBadge status={tender?.status || detail.tender.status} />
              <Button
                variant="outline"
                onClick={() => void openPdf()}
                disabled={documentBusy}
              >
                {documentBusy ? (
                  <span className="spinner" />
                ) : (
                  <Icon name="file" size={18} />
                )}{" "}
                {t("viewPdf")}
              </Button>
            </div>
          </div>
          {documentError && (
            <p className="inline-error" role="alert">
              {t("sourceUnavailable")}
            </p>
          )}
          {displayError && (
            <div className="notice notice-error" role="alert">
              <Icon name="alert" size={20} />
              <span>{displayError}</span>
              <Button
                variant="ghost"
                size="icon"
                aria-label={t("close")}
                onClick={() => {
                  setError(null);
                  setDismissedAnalysisError(() => analysisRequest?.error);
                }}
              >
                <Icon name="close" size={18} />
              </Button>
            </div>
          )}
          {tender && activeStatuses.includes(tender.status) ? (
            <ProcessingState
              status={tender.status}
              interrupted={leaseExpired && !analysisBusy}
              busy={analysisBusy}
              onRetry={() => void analyze()}
            />
          ) : analysisError ||
            detail.tender.status === "failed" ||
            detail.tender.status === "uploaded" ? (
            <section className="panel processing-panel">
              <span className="processing-icon">
                <Icon
                  name={
                    analysisError || detail.tender.status === "failed"
                      ? "alert"
                      : "file"
                  }
                  size={32}
                />
              </span>
              <h2>
                {t(
                  analysisError || detail.tender.status === "failed"
                    ? "analysisFailedTitle"
                    : "awaitingAnalysisTitle",
                )}
              </h2>
              <p>
                {t(
                  analysisError || detail.tender.status === "failed"
                    ? "analysisFailedDescription"
                    : "awaitingAnalysisDescription",
                )}
              </p>
              {(analysisError || detail.tender.error_code) && (
                <p className="processing-error" role="alert">
                  {analysisError ||
                    errorText(
                      { code: detail.tender.error_code },
                      locale,
                      "analysisFailedDescription",
                    )}
                </p>
              )}
              <Button
                disabled={analysisBusy || !config?.aiConfigured}
                onClick={() => void analyze()}
              >
                <Icon name="refresh" size={18} />
                {t(
                  analysisError || detail.tender.status === "failed"
                    ? "retryAnalysis"
                    : "analyzeDocument",
                )}
              </Button>
              {!config?.aiConfigured && (
                <small>
                  {t("setupAi")}: {t("notConfigured")}
                </small>
              )}
            </section>
          ) : analysis ? (
            <>
              <div className="tender-metrics">
                <div className="tender-metric">
                  <span>
                    <Icon name="clock" size={17} />
                    {t("deadline")}
                  </span>
                  <strong>
                    {analysis.deadline.status === "ambiguous"
                      ? t("needsReview")
                      : tender?.deadline
                        ? formatDate(tender.deadline, locale)
                        : t("notFound")}
                  </strong>
                </div>
                <div className="tender-metric">
                  <span>
                    <Icon name="complete" size={17} />
                    {t("compliance")}
                  </span>
                  <strong>
                    <bdi dir="ltr">
                      {formatNumber(detail.tender.completed_count, locale)} /{" "}
                      {formatNumber(detail.tender.requirement_count, locale)}
                    </bdi>{" "}
                    <small>{t("reviewed")}</small>
                  </strong>
                </div>
                <div className="tender-metric">
                  <span>
                    <Icon name="alert" size={17} />
                    {t("criticalRisks")}
                  </span>
                  <strong
                    className={
                      analysis.risks.some(
                        (risk) => risk.severity === "critical",
                      )
                        ? "danger-text"
                        : ""
                    }
                  >
                    {formatNumber(
                      analysis.risks.filter(
                        (risk) => risk.severity === "critical",
                      ).length,
                      locale,
                    )}{" "}
                    <small>{t("needsYourAttention")}</small>
                  </strong>
                </div>
              </div>
              <Tabs
                value={tab}
                onValueChange={changeTab}
                dir={locale === "ar" ? "rtl" : "ltr"}
              >
                <TabsList aria-label={t("navigation")}>
                  {tabs.map((name) => (
                    <TabsTrigger key={name} value={name}>
                      <Icon
                        name={
                          {
                            overview: "dashboard",
                            requirements: "complete",
                            risks: "alert",
                            assistant: "chat",
                          }[name] as "dashboard" | "complete" | "alert" | "chat"
                        }
                        size={18}
                      />
                      {t(name)}
                      {(name === "requirements" || name === "risks") && (
                        <span className="tab-count">
                          {formatNumber(
                            name === "requirements"
                              ? detail.requirements.length
                              : analysis.risks.length,
                            locale,
                          )}
                        </span>
                      )}
                    </TabsTrigger>
                  ))}
                </TabsList>
                <TabsContent value="overview">
                  <Overview
                    detail={detail}
                    onEvidence={setEvidence}
                    onTab={changeTab}
                  />
                </TabsContent>
                <TabsContent value="requirements">
                  <Requirements
                    detail={detail}
                    setDetail={setDetail}
                    onEvidence={setEvidence}
                  />
                </TabsContent>
                <TabsContent value="risks">
                  <Risks risks={analysis.risks} onEvidence={setEvidence} />
                </TabsContent>
                <TabsContent value="assistant">
                  <Assistant
                    tenderId={id}
                    messages={detail.messages}
                    onMessages={(messages) =>
                      setDetail((current) =>
                        current ? { ...current, messages } : current,
                      )
                    }
                    onEvidence={setEvidence}
                  />
                </TabsContent>
              </Tabs>
            </>
          ) : (
            <p>{t("noAnalysis")}</p>
          )}
        </>
      )}
      <EvidenceDrawer
        tenderId={id}
        evidence={evidence}
        onClose={() => setEvidence(null)}
      />
    </WorkspaceShell>
  );
}

function ProcessingState({
  status,
  interrupted,
  busy,
  onRetry,
}: {
  status: TenderStatus;
  interrupted: boolean;
  busy: boolean;
  onRetry: () => void;
}) {
  const { t } = useWorkspace();
  const step = status === "extracting" ? 0 : 1;
  return (
    <section className="panel processing-panel" role="status">
      <span className="processing-icon">
        <span className="spinner large-spinner" />
      </span>
      <h2>{t("processingTitle")}</h2>
      <p>{t("processingDescription")}</p>
      <p>{t("processingEstimate")}</p>
      <div className="processing-steps">
        {(["readPages", "extractRequirements", "reviewEvidence"] as const).map(
          (label, index) => (
            <div
              className={`processing-step ${index === step ? "current" : index < step ? "done" : ""}`}
              key={label}
            >
              <span>
                {index < step ? <Icon name="tick" size={16} /> : index + 1}
              </span>
              <strong>{t(label)}</strong>
            </div>
          ),
        )}
      </div>
      <small>{t(interrupted ? "interruptedAnalysis" : "processingNote")}</small>
      {interrupted && (
        <Button onClick={onRetry} disabled={busy}>
          <Icon name="refresh" size={18} />
          {t("retryAnalysis")}
        </Button>
      )}
    </section>
  );
}

function Overview({
  detail,
  onEvidence,
  onTab,
}: {
  detail: TenderDetail;
  onEvidence: (evidence: Evidence) => void;
  onTab: (tab: string) => void;
}) {
  const { t, locale } = useWorkspace();
  const { tender, requirements } = detail;
  const analysis = tender.analysis!;
  const mandatory = requirements
    .filter((item) => item.mandatory && !item.completed)
    .slice(0, 3);
  return (
    <div className="overview-grid">
      <div className="overview-main">
        <section className="panel summary-panel">
          <div className="section-icon-heading">
            <span className="icon-tile small">
              <Icon name="file" size={20} />
            </span>
            <h2>{t("summary")}</h2>
          </div>
          <p className="summary-text">{localized(analysis.summary, locale)}</p>
          <div className="review-note">
            <Icon name="info" size={17} />
            <span>{t("obligationNote")}</span>
          </div>
        </section>
        <section className="panel">
          <div className="panel-heading">
            <div>
              <h2>{t("mandatory")}</h2>
              <p>{t("checklistDescription")}</p>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onTab("requirements")}
            >
              {t("openRequirements")}
            </Button>
          </div>
          {mandatory.length ? (
            <div className="overview-requirements">
              {mandatory.map((requirement) => (
                <div key={requirement.id} className="overview-requirement">
                  <span className="requirement-marker" />
                  <div>
                    <h3>{localized(requirement.title, locale)}</h3>
                    <p>{localized(requirement.description, locale)}</p>
                    <EvidenceLinks
                      evidence={requirement.evidence}
                      onSelect={onEvidence}
                    />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="mini-empty">
              <Icon name="complete" size={24} />
              <strong>
                {t(requirements.length ? "reviewComplete" : "noRequirements")}
              </strong>
            </div>
          )}
        </section>
      </div>
      <aside className="overview-aside">
        <section className="panel information-panel">
          <h2>{t("keyInformation")}</h2>
          <dl>
            <div>
              <dt>{t("deadline")}</dt>
              <dd>
                {analysis.deadline.status === "ambiguous"
                  ? t("needsReview")
                  : analysis.deadline.date
                    ? formatDate(analysis.deadline.date, locale)
                    : t("notFound")}
                {analysis.deadline.raw && (
                  <small dir="auto">{analysis.deadline.raw}</small>
                )}
                <EvidenceLinks
                  evidence={analysis.deadline.evidence}
                  onSelect={onEvidence}
                />
              </dd>
            </div>
            <div>
              <dt>
                {locale === "ar" ? "الجهة المصدرة" : "Issuing organization"}
              </dt>
              <dd>
                <bdi>{analysis.issuer || t("notFound")}</bdi>
              </dd>
            </div>
            <div>
              <dt>{locale === "ar" ? "رقم المنافسة" : "Tender reference"}</dt>
              <dd>
                <bdi>{analysis.reference || t("notFound")}</bdi>
              </dd>
            </div>
            <div>
              <dt>{t("compliance")}</dt>
              <dd>
                <Completion
                  completed={tender.completed_count}
                  total={tender.requirement_count}
                />
              </dd>
            </div>
          </dl>
        </section>
        <section className="panel information-panel document-info">
          <h2>{t("fileDetails")}</h2>
          <dl>
            <div>
              <dt>{t("fileName")}</dt>
              <dd className="filename">
                <bdi>{tender.filename}</bdi>
              </dd>
            </div>
            <div>
              <dt>{t("totalPages")}</dt>
              <dd>{formatNumber(tender.page_count || 0, locale)}</dd>
            </div>
            <div>
              <dt>{t("uploadedOn")}</dt>
              <dd>{formatDate(tender.created_at, locale)}</dd>
            </div>
          </dl>
        </section>
      </aside>
    </div>
  );
}

function Requirements({
  detail,
  setDetail,
  onEvidence,
}: {
  detail: TenderDetail;
  setDetail: React.Dispatch<React.SetStateAction<TenderDetail | null>>;
  onEvidence: (evidence: Evidence) => void;
}) {
  const { t, locale, reload } = useWorkspace();
  const [category, setCategory] = useState("all");
  const [completion, setCompletion] = useState("all");
  const [saving, setSaving] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const filtered = detail.requirements.filter(
    (item) =>
      (category === "all" || item.category === category) &&
      (completion === "all" ||
        (completion === "completed" ? item.completed : !item.completed)),
  );
  async function toggle(item: ChecklistItem) {
    if (saving.has(item.id)) return;
    setError(null);
    setSaved(false);
    setSaving((current) => new Set(current).add(item.id));
    const completed = !item.completed;
    function update(value: boolean) {
      setDetail((current) => {
        if (!current) return current;
        const requirements = current.requirements.map((entry) =>
          entry.id === item.id ? { ...entry, completed: value } : entry,
        );
        return {
          ...current,
          requirements,
          tender: {
            ...current.tender,
            completed_count: requirements.filter((entry) => entry.completed)
              .length,
          },
        };
      });
    }
    update(completed);
    try {
      await authenticatedFetch(
        `/api/tenders/${detail.tender.id}/requirements/${item.id}`,
        { method: "PATCH", body: JSON.stringify({ completed }) },
      );
      setSaved(true);
      void reload();
    } catch {
      update(item.completed);
      setError(t("saveFailed"));
    } finally {
      setSaving((current) => {
        const next = new Set(current);
        next.delete(item.id);
        return next;
      });
    }
  }
  return (
    <section className="panel requirements-panel">
      <div className="panel-heading section-heading">
        <div>
          <h2>{t("checklistTitle")}</h2>
          <p>{t("checklistDescription")}</p>
        </div>
        {detail.requirements.length > 0 && (
          <div className="checklist-summary">
            <strong>
              <bdi dir="ltr">
                {formatNumber(detail.tender.completed_count, locale)}{" "}
                <span>
                  / {formatNumber(detail.requirements.length, locale)}
                </span>
              </bdi>
            </strong>
            <small>{t("completedSummary")}</small>
          </div>
        )}
      </div>
      {detail.requirements.length > 0 && (
        <div className="checklist-progress">
          <Completion
            completed={detail.tender.completed_count}
            total={detail.requirements.length}
          />
        </div>
      )}
      {detail.requirements.length > 0 && (
        <div className="requirements-toolbar">
          <div className="filter-group">
            <select
              aria-label={t("allCategories")}
              value={category}
              onChange={(event) => setCategory(event.target.value)}
            >
              <option value="all">{t("allCategories")}</option>
              {(
                [
                  "eligibility",
                  "technical",
                  "deliverable",
                  "administrative",
                ] as const
              ).map((value) => (
                <option value={value} key={value}>
                  {t(value)}
                </option>
              ))}
            </select>
            <select
              aria-label={t("allRequirements")}
              value={completion}
              onChange={(event) => setCompletion(event.target.value)}
            >
              <option value="all">{t("allRequirements")}</option>
              <option value="remaining">{t("remaining")}</option>
              <option value="completed">{t("completed")}</option>
            </select>
          </div>
          <span className="autosave-note" role="status">
            {saving.size > 0 ? (
              <span className="spinner" />
            ) : (
              <Icon name="tick" size={16} />
            )}{" "}
            {saved ? t("savedChecklist") : t("saved")}
          </span>
        </div>
      )}
      {error && (
        <p className="inline-error padded-error" role="alert">
          {error}
        </p>
      )}
      <div className="checklist-items">
        {filtered.length ? (
          filtered.map((item) => (
            <div
              className={`checklist-item ${item.completed ? "is-completed" : ""}`}
              key={item.id}
            >
              <Checkbox.Root
                id={`requirement-${item.id}`}
                checked={item.completed}
                onCheckedChange={() => void toggle(item)}
                disabled={saving.has(item.id)}
                className="requirement-checkbox"
                aria-label={`${t(item.completed ? "markIncomplete" : "markComplete")}: ${localized(item.title, locale)}`}
              >
                <Checkbox.Indicator>
                  <Icon name="tick" size={17} />
                </Checkbox.Indicator>
              </Checkbox.Root>
              <div className="requirement-content">
                <div className="requirement-heading">
                  <label htmlFor={`requirement-${item.id}`}>
                    {localized(item.title, locale)}
                  </label>
                  <span className="category-label">{t(item.category)}</span>
                  {item.mandatory && (
                    <span className="mandatory-label">{t("mandatory")}</span>
                  )}
                </div>
                <p>{localized(item.description, locale)}</p>
                <EvidenceLinks evidence={item.evidence} onSelect={onEvidence} />
              </div>
              {item.completed && (
                <span className="completed-label">
                  <Icon name="tick" size={14} />
                  {t("completed")}
                </span>
              )}
            </div>
          ))
        ) : (
          <div className="empty-search">
            <Icon name="complete" size={30} />
            <h3>
              {t(
                detail.requirements.length
                  ? "checklistEmpty"
                  : "noRequirements",
              )}
            </h3>
            <p>
              {t(
                detail.requirements.length
                  ? "checklistEmptyNote"
                  : "obligationNote",
              )}
            </p>
          </div>
        )}
      </div>
      {detail.requirements.length > 0 && (
        <div className="panel-bottom-note">
          <Icon name="info" size={16} />
          {t("obligationNote")}
        </div>
      )}
    </section>
  );
}

function Risks({
  risks,
  onEvidence,
}: {
  risks: Risk[];
  onEvidence: (evidence: Evidence) => void;
}) {
  const { t, locale } = useWorkspace();
  const [severity, setSeverity] = useState("all");
  const severityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
  const filtered = risks
    .filter((risk) => severity === "all" || risk.severity === severity)
    .toSorted((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);
  return (
    <div className="risk-workspace">
      <div className="tab-section-heading">
        <div>
          <h2>{t("riskTitle")}</h2>
          <p>{t("riskDescription")}</p>
        </div>
        <select
          aria-label={t("allSeverities")}
          value={severity}
          onChange={(event) => setSeverity(event.target.value)}
        >
          <option value="all">{t("allSeverities")}</option>
          {(["critical", "high", "medium", "low"] as const).map((value) => (
            <option value={value} key={value}>
              {t(value)}
            </option>
          ))}
        </select>
      </div>
      {filtered.length ? (
        <div className="risk-list">
          {filtered.map((risk) => (
            <article
              className={`panel risk-card risk-${risk.severity}`}
              key={risk.id}
            >
              <div className="risk-card-top">
                <span className={`severity-badge severity-${risk.severity}`}>
                  <Icon name="alert" size={15} />
                  {t(risk.severity)}
                </span>
                <span className="risk-kind">
                  {t(
                    risk.kind === "explicit"
                      ? "sourceBacked"
                      : risk.kind === "inferred"
                        ? "inferred"
                        : "missingInformation",
                  )}
                </span>
              </div>
              <h3>{localized(risk.title, locale)}</h3>
              <p>{localized(risk.description, locale)}</p>
              <div className="risk-action">
                <span className="icon-tile small">
                  <Icon name="complete" size={18} />
                </span>
                <div>
                  <strong>{t("recommendedAction")}</strong>
                  <p>{localized(risk.action, locale)}</p>
                </div>
              </div>
              {risk.evidence.length ? (
                <EvidenceLinks evidence={risk.evidence} onSelect={onEvidence} />
              ) : (
                <div className="no-source-note">
                  <Icon name="info" size={16} />
                  <span>{t("noSourceNote")}</span>
                </div>
              )}
            </article>
          ))}
        </div>
      ) : (
        <section className="panel empty-search">
          <Icon name="shield" size={32} />
          <h3>{t("noRisks")}</h3>
          <p>{t("emptyRisksNote")}</p>
        </section>
      )}
    </div>
  );
}

function Assistant({
  tenderId,
  messages,
  onMessages,
  onEvidence,
}: {
  tenderId: string;
  messages: ChatMessage[];
  onMessages: (messages: ChatMessage[]) => void;
  onEvidence: (evidence: Evidence) => void;
}) {
  const { t, locale } = useWorkspace();
  const [question, setQuestion] = useState("");
  const [busy, setBusy] = useState(false);
  const [pendingQuestion, setPendingQuestion] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const end = useRef<HTMLDivElement>(null);
  const textarea = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    if (messages.length || pendingQuestion)
      end.current?.scrollIntoView({
        behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
          ? "instant"
          : "smooth",
        block: "nearest",
      });
  }, [messages.length, pendingQuestion]);
  async function send(text: string) {
    if (!text.trim() || busy) return;
    if (text.trim().length > 2000) {
      setError(t("questionTooLong"));
      return;
    }
    setBusy(true);
    setError(null);
    setPendingQuestion(text.trim());
    try {
      const response = await authenticatedFetch<{ messages: ChatMessage[] }>(
        `/api/tenders/${tenderId}/chat`,
        {
          method: "POST",
          body: JSON.stringify({ message: text.trim(), locale }),
        },
      );
      onMessages([...messages, ...response.messages]);
      setQuestion("");
    } catch (issue) {
      setError(errorText(issue, locale, "answerFailed"));
      setQuestion(text);
    } finally {
      setBusy(false);
      setPendingQuestion(null);
      textarea.current?.focus();
    }
  }
  function onSubmit(event: FormEvent) {
    event.preventDefault();
    void send(question);
  }
  return (
    <section className="panel assistant-panel">
      <div className="panel-heading">
        <div>
          <h2>{t("assistantTitle")}</h2>
          <p>{t("assistantDescription")}</p>
        </div>
        <span className="source-scope">
          <Icon name="file" size={16} />
          {t("document")}
        </span>
      </div>
      <div
        className="conversation"
        aria-live="polite"
        aria-relevant="additions text"
      >
        {messages.length === 0 && !pendingQuestion ? (
          <div className="assistant-empty">
            <span className="assistant-mark">
              <Icon name="chat" size={30} />
              <span className="assistant-mark-dot" />
            </span>
            <h3>{t("assistantWelcome")}</h3>
            <p>{t("assistantWelcomeNote")}</p>
            <div
              className="suggested-questions"
              aria-label={t("suggestedQuestions")}
            >
              {(["question1", "question2", "question3"] as const).map((key) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => void send(t(key))}
                  disabled={busy}
                >
                  <span>{t(key)}</span>
                  <Icon name="forward" size={18} className="directional" />
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="messages">
            {messages.map((message) => (
              <div
                className={`message message-${message.role}`}
                key={message.id}
              >
                <span className="message-avatar">
                  <Icon
                    name={message.role === "assistant" ? "chat" : "file"}
                    size={18}
                  />
                </span>
                <div className="message-body">
                  <strong>
                    {t(
                      message.role === "assistant" ? "tenderAssistant" : "you",
                    )}
                  </strong>
                  <div className="message-text" dir="auto">
                    {message.content}
                  </div>
                  {message.citations.length > 0 && (
                    <EvidenceLinks
                      evidence={message.citations}
                      onSelect={onEvidence}
                    />
                  )}
                </div>
              </div>
            ))}
            {pendingQuestion && (
              <>
                <div className="message message-user">
                  <span className="message-avatar">
                    <Icon name="file" size={18} />
                  </span>
                  <div className="message-body">
                    <strong>{t("you")}</strong>
                    <div className="message-text" dir="auto">
                      {pendingQuestion}
                    </div>
                  </div>
                </div>
                <div className="message message-assistant">
                  <span className="message-avatar">
                    <Icon name="chat" size={18} />
                  </span>
                  <div className="message-body">
                    <strong>{t("tenderAssistant")}</strong>
                    <p className="answering" role="status">
                      <span className="spinner" />
                      {t("answering")}
                    </p>
                  </div>
                </div>
              </>
            )}
            <div ref={end} />
          </div>
        )}
      </div>
      <form className="chat-form" onSubmit={onSubmit}>
        <div className="chat-input-wrap">
          <label htmlFor="tender-question" className="sr-only">
            {t("questionLabel")}
          </label>
          <textarea
            ref={textarea}
            id="tender-question"
            placeholder={t("questionPlaceholder")}
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
            maxLength={2000}
            disabled={busy}
            rows={2}
            onKeyDown={(event) => {
              if (
                event.key === "Enter" &&
                !event.shiftKey &&
                !event.nativeEvent.isComposing
              ) {
                event.preventDefault();
                void send(question);
              }
            }}
          />
          <Button
            type="submit"
            size="icon"
            disabled={!question.trim() || busy}
            aria-label={t("send")}
          >
            {busy ? (
              <span className="spinner" />
            ) : (
              <Icon name="send" size={19} className="directional" />
            )}
          </Button>
        </div>
        {error && (
          <p className="inline-error" role="alert">
            {error}
          </p>
        )}
        <p className="chat-disclaimer">
          <Icon name="shield" size={14} />
          {t("assistantNote")}
        </p>
      </form>
    </section>
  );
}

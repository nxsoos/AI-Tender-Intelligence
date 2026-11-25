"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { TenderStatus } from "@/lib/types";
import { formatDate, formatNumber, localized } from "@/lib/i18n";
import { useWorkspace, errorText } from "./workspace-provider";
import { WorkspaceShell } from "./workspace-shell";
import { Button } from "./ui/button";
import { Icon } from "./icons";
import { uploadTender } from "./upload-dialog";

export function daysUntil(value: string | null | undefined) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const now = new Date();
  return Math.ceil(
    (Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()) -
      Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())) /
      86400000,
  );
}
function getCompletionPercent(completed: number, total: number) {
  if (total <= 0) return 0;
  if (completed >= total) return 100;
  return Math.max(0, Math.min(99, Math.round((completed / total) * 100)));
}
export function StatusBadge({ status }: { status: TenderStatus }) {
  const { t } = useWorkspace();
  const labels = {
    uploaded: "uploaded",
    extracting: "extracting",
    analyzing: "analyzing",
    ready: "ready",
    failed: "failed",
  } as const;
  return (
    <span className={`status-badge status-${status}`}>
      {status === "ready" ? (
        <Icon name="complete" size={14} />
      ) : status === "failed" ? (
        <Icon name="alert" size={14} />
      ) : (
        <span className="status-dot" />
      )}
      {t(labels[status])}
    </span>
  );
}
export function Completion({
  completed,
  total,
  compact = false,
}: {
  completed: number;
  total: number;
  compact?: boolean;
}) {
  const { t, locale } = useWorkspace();
  const percent = getCompletionPercent(completed, total);
  return (
    <div className={`completion ${compact ? "compact" : ""}`}>
      <div className="completion-label">
        {total ? (
          <>
            <bdi dir="ltr">
              {formatNumber(completed, locale)}{" "}
              <span className="text-muted">
                / {formatNumber(total, locale)}
              </span>
            </bdi>
            <bdi dir="ltr" className="text-muted">
              {formatNumber(percent, locale)}%
            </bdi>
          </>
        ) : (
          <span className="text-muted">{t("noRequirements")}</span>
        )}
      </div>
      <div
        className="progress-track"
        role="progressbar"
        aria-label={t("compliance")}
        aria-valuenow={percent}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <span style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}

export function Dashboard() {
  const {
    t,
    locale,
    config,
    tenders,
    loading,
    loadError,
    reload,
    setUploadOpen,
  } = useWorkspace();
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const [sampleBusy, setSampleBusy] = useState(false);
  const [sampleStep, setSampleStep] = useState("");
  const [sampleError, setSampleError] = useState<string | null>(null);
  const router = useRouter();
  const available = !!config?.supabaseConfigured && !loadError;
  const upcoming = tenders
    .filter((tender) => {
      const days = daysUntil(tender.deadline);
      return days !== null && days >= 0 && days <= 7;
    })
    .sort((a, b) => (a.deadline || "").localeCompare(b.deadline || ""));
  const criticalCount = tenders.reduce(
    (count, tender) =>
      count +
      (tender.analysis?.risks.filter((risk) => risk.severity === "critical")
        .length || 0),
    0,
  );
  const completed = tenders.reduce(
    (sum, tender) => sum + tender.completed_count,
    0,
  );
  const totalRequirements = tenders.reduce(
    (sum, tender) => sum + tender.requirement_count,
    0,
  );
  const filtered = useMemo(
    () =>
      tenders
        .filter((tender) => {
          const text =
            `${tender.title} ${localized(tender.analysis?.title, locale)} ${tender.analysis?.issuer || ""} ${tender.filename}`.toLocaleLowerCase();
          return (
            text.includes(query.toLocaleLowerCase()) &&
            (status === "all" || tender.status === status)
          );
        })
        .sort((a, b) => {
          if (a.deadline && b.deadline)
            return a.deadline.localeCompare(b.deadline);
          if (a.deadline) return -1;
          if (b.deadline) return 1;
          return b.created_at.localeCompare(a.created_at);
        }),
    [tenders, query, status, locale],
  );
  const attention = tenders
    .filter(
      (tender) =>
        tender.analysis?.risks.some((risk) => risk.severity === "critical") ||
        (daysUntil(tender.deadline) !== null &&
          (daysUntil(tender.deadline) as number) <= 7),
    )
    .slice(0, 3);
  async function handleSample() {
    setSampleBusy(true);
    setSampleError(null);
    try {
      const response = await fetch("/sample-tender.pdf");
      if (!response.ok) throw new Error("sample");
      const file = new File(
        [await response.blob()],
        "Sample-government-IT-services.pdf",
        { type: "application/pdf" },
      );
      const tender = await uploadTender(file, setSampleStep);
      void reload();
      router.push(`/tenders/${tender.id}?analyze=1`);
    } catch (error) {
      setSampleError(errorText(error, locale, "sampleUnavailable"));
    } finally {
      setSampleBusy(false);
    }
  }
  const checklistComplete =
    totalRequirements > 0 && completed >= totalRequirements;
  const checklistPercent = getCompletionPercent(completed, totalRequirements);
  const metricValues = [
    tenders.length,
    upcoming.length,
    totalRequirements ? `${checklistPercent}%` : "—",
    criticalCount,
  ];
  const metrics = [
    { label: "totalTenders", note: "inYourWorkspace" },
    { label: "dueSoon", note: "deadlinesToWatch" },
    { label: "compliance", note: "requirementsCompleted" },
    { label: "criticalRisks", note: "needsYourAttention" },
  ] as const;
  return (
    <WorkspaceShell>
      <div className="page-heading">
        <div>
          <div className="eyebrow">{t("dashboardEyebrow")}</div>
          <h1>{t("dashboardTitle")}</h1>
          <p>{t("dashboardSubtitle")}</p>
        </div>
        <Button
          onClick={() => setUploadOpen(true)}
          disabled={!config?.configured || loading}
          aria-describedby={!config?.configured ? "setup-message" : undefined}
        >
          <Icon name="add" size={20} />
          {t("upload")}
        </Button>
      </div>
      {!loading && config && !config.configured && (
        <section className="setup-banner" aria-labelledby="setup-title">
          <span className="setup-symbol">
            <Icon name="link" size={21} />
          </span>
          <div className="setup-copy">
            <h2 id="setup-title">{t("setupTitle")}</h2>
            <p id="setup-message">{t("setupDescription")}</p>
          </div>
          <div className="setup-connections">
            <span>
              <i className={config.supabaseConfigured ? "connected" : ""} />
              Supabase{" "}
              <small>
                {t(config.supabaseConfigured ? "configured" : "notConfigured")}
              </small>
            </span>
            <span>
              <i className={config.aiConfigured ? "connected" : ""} />
              Gemini{" "}
              <small>
                {t(config.aiConfigured ? "configured" : "notConfigured")}
              </small>
            </span>
          </div>
        </section>
      )}
      {loadError && (
        <div className="notice notice-error" role="alert">
          <Icon name="alert" />
          <span>{loadError}</span>
          <Button variant="outline" size="sm" onClick={() => void reload()}>
            <Icon name="refresh" size={16} />
            {t("tryAgain")}
          </Button>
        </div>
      )}
      <section className="metrics-strip" aria-label={t("dashboardEyebrow")}>
        {metrics.map((metric, index) => (
          <div
            className={`metric ${index === 2 ? "metric-readiness" : ""}`}
            key={metric.label}
          >
            <span className="metric-label">{t(metric.label)}</span>
            <div className="metric-value-row">
              <strong
                className={
                  index === 3 && criticalCount > 0 ? "critical-number" : ""
                }
              >
                {loading || !available
                  ? "—"
                  : typeof metricValues[index] === "number"
                    ? formatNumber(metricValues[index] as number, locale)
                    : metricValues[index]}
              </strong>
              {index === 2 &&
                available &&
                !loading &&
                totalRequirements > 0 && (
                  <svg
                    className="readiness-gauge"
                    viewBox="0 0 100 100"
                    aria-hidden="true"
                  >
                    <circle className="gauge-track" cx="50" cy="50" r="40" />
                    <circle
                      className="gauge-value"
                      cx="50"
                      cy="50"
                      r="40"
                      strokeDasharray={2 * Math.PI * 40}
                      strokeDashoffset={
                        2 * Math.PI * 40 * (1 - checklistPercent / 100)
                      }
                    />
                    <path
                      d={
                        checklistComplete
                          ? "m39 50 8 8 15-16"
                          : "M40 39h20 M40 50h14 M40 61h18"
                      }
                      className={`gauge-check ${checklistComplete ? "is-complete" : ""}`}
                    />
                  </svg>
                )}
            </div>
            <small>
              {index === 2 && available && !loading && totalRequirements > 0 ? (
                <>
                  <bdi dir="ltr">
                    {formatNumber(completed, locale)} /{" "}
                    {formatNumber(totalRequirements, locale)}
                  </bdi>{" "}
                  {t("requirementsCompleted")}
                </>
              ) : (
                t(metric.note)
              )}
            </small>
          </div>
        ))}
      </section>
      <section
        className="tender-register panel"
        id="tenders"
        aria-labelledby="register-heading"
      >
        <div className="panel-heading">
          <div>
            <h2 id="register-heading">
              {t("tenderRegister")}
              {available && tenders.length > 0 && (
                <span className="quiet-count">
                  {formatNumber(tenders.length, locale)}
                </span>
              )}
            </h2>
            <p>{t("tenderRegisterNote")}</p>
          </div>
          <span className="panel-heading-label">
            <Icon name="shield" size={16} />
            {t("workspace")}
          </span>
        </div>
        {(tenders.length > 0 || loading) && (
          <div className="table-toolbar">
            <div className="search-field">
              <Icon name="search" size={18} />
              <input
                aria-label={t("search")}
                placeholder={t("searchPlaceholder")}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
            </div>
            <select
              aria-label={t("status")}
              value={status}
              onChange={(event) => setStatus(event.target.value)}
            >
              <option value="all">{t("allStatuses")}</option>
              <option value="ready">{t("ready")}</option>
              <option value="analyzing">{t("analyzing")}</option>
              <option value="extracting">{t("extracting")}</option>
              <option value="uploaded">{t("uploaded")}</option>
              <option value="failed">{t("failed")}</option>
            </select>
          </div>
        )}
        {loading ? (
          <div className="table-loading" role="status">
            <span className="spinner" />
            <span>{t("loading")}</span>
          </div>
        ) : tenders.length === 0 ? (
          <div className="empty-register">
            <div className="empty-main">
              <div className="document-illustration" aria-hidden="true">
                <span className="illustration-page page-behind" />
                <span className="illustration-page page-front">
                  <Icon name="file" size={30} />
                  <span />
                  <span />
                  <span />
                </span>
                <span className="illustration-check">
                  <Icon name="tick" size={18} />
                </span>
              </div>
              <h3>{t("emptyTitle")}</h3>
              <p>{t("emptyDescription")}</p>
              <Button
                onClick={() => setUploadOpen(true)}
                disabled={!config?.configured}
                aria-describedby={
                  !config?.configured ? "setup-message" : undefined
                }
              >
                <Icon name="upload" size={18} />
                {t("upload")}
              </Button>
              <small>{t("uploadHint")}</small>
            </div>
            <div className="empty-workflow">
              {(["file", "link", "complete"] as const).map((icon, index) => (
                <div className="workflow-step" key={icon}>
                  <span className="workflow-icon">
                    <Icon name={icon} size={22} />
                  </span>
                  <div>
                    <h4>
                      {t(
                        `emptyStep${index + 1}` as
                          | "emptyStep1"
                          | "emptyStep2"
                          | "emptyStep3",
                      )}
                    </h4>
                    <p>
                      {t(
                        `emptyStep${index + 1}Description` as
                          | "emptyStep1Description"
                          | "emptyStep2Description"
                          | "emptyStep3Description",
                      )}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : filtered.length === 0 ? (
          <div className="empty-search">
            <Icon name="search" size={32} />
            <h3>{t("noResults")}</h3>
            <p>{t("noResultsHint")}</p>
            <Button
              variant="outline"
              onClick={() => {
                setQuery("");
                setStatus("all");
              }}
            >
              {t("clearFilters")}
            </Button>
          </div>
        ) : (
          <div className="table-wrap">
            <table className="tender-table">
              <thead>
                <tr>
                  <th>{t("name")}</th>
                  <th>{t("deadline")}</th>
                  <th>{t("progress")}</th>
                  <th>{t("risks")}</th>
                  <th>{t("status")}</th>
                  <th>
                    <span className="sr-only">{t("viewTender")}</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((tender) => {
                  const critical =
                    tender.analysis?.risks.filter(
                      (risk) => risk.severity === "critical",
                    ).length || 0;
                  const days = daysUntil(tender.deadline);
                  return (
                    <tr key={tender.id}>
                      <td data-label={t("name")}>
                        <div className="tender-name-cell">
                          <span className="file-icon">
                            <Icon name="file" size={22} />
                          </span>
                          <div>
                            <Link
                              href={`/tenders/${tender.id}`}
                              className="tender-title"
                            >
                              <bdi>
                                {localized(tender.analysis?.title, locale) ||
                                  tender.title ||
                                  tender.filename}
                              </bdi>
                            </Link>
                            <span className="table-subtitle">
                              <bdi>
                                {tender.analysis?.issuer || tender.filename}
                              </bdi>
                            </span>
                          </div>
                        </div>
                      </td>
                      <td data-label={t("deadline")}>
                        <span
                          className={
                            days !== null && days <= 7
                              ? "deadline-emphasis"
                              : ""
                          }
                        >
                          {tender.analysis?.deadline.status === "ambiguous"
                            ? t("needsReview")
                            : tender.deadline
                              ? formatDate(tender.deadline, locale)
                              : t("notFound")}
                        </span>
                        {days !== null && days <= 7 && (
                          <small
                            className={
                              days < 0 ? "danger-text" : "deadline-caption"
                            }
                          >
                            {days < 0
                              ? t("overdue")
                              : days === 0
                                ? t("today")
                                : days === 1
                                  ? t("tomorrow")
                                  : locale === "ar"
                                    ? `${t("daysLeft")}: ${formatNumber(days, locale)}`
                                    : `${formatNumber(days, locale)} ${t("daysLeft")}`}
                          </small>
                        )}
                      </td>
                      <td data-label={t("progress")}>
                        <Completion
                          completed={tender.completed_count}
                          total={tender.requirement_count}
                          compact
                        />
                      </td>
                      <td data-label={t("risks")}>
                        <span
                          className={`risk-table-count ${critical > 0 ? "danger-text" : "text-muted"}`}
                        >
                          {tender.risk_count > 0 && (
                            <Icon name="alert" size={15} />
                          )}
                          {formatNumber(tender.risk_count, locale)}
                        </span>
                        {critical > 0 && (
                          <small className="danger-text">
                            {t("criticalRisks")}:{" "}
                            {formatNumber(critical, locale)}
                          </small>
                        )}
                      </td>
                      <td data-label={t("status")}>
                        <StatusBadge status={tender.status} />
                      </td>
                      <td className="table-action">
                        <Link
                          href={`/tenders/${tender.id}`}
                          className="icon-button"
                          aria-label={`${t("viewTender")}: ${localized(tender.analysis?.title, locale) || tender.title}`}
                        >
                          <Icon
                            name="forward"
                            size={18}
                            className="directional"
                          />
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <div className="sample-strip">
          <span className="sample-file-icon">
            <Icon name="file" size={22} />
          </span>
          <div>
            <strong>{t("sampleTitle")}</strong>
            <p>{t("sampleDescription")}</p>
          </div>
          <div className="sample-actions">
            <Button variant="ghost" size="sm" asChild>
              <a href="/sample-tender.pdf" target="_blank" rel="noreferrer">
                {t("sampleView")}
                <Icon name="external" size={16} />
              </a>
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={!config?.configured || sampleBusy}
              onClick={() => void handleSample()}
            >
              {sampleBusy ? (
                <span className="spinner" />
              ) : (
                <Icon name="file" size={17} />
              )}{" "}
              {sampleBusy
                ? t((sampleStep || "creating") as "creating" | "uploading")
                : t("useSample")}
            </Button>
          </div>
        </div>
        {sampleError && (
          <p className="inline-error padded-error" role="alert">
            {sampleError}
          </p>
        )}
      </section>
      <div className="dashboard-bottom-grid">
        <section className="panel attention-panel">
          <div className="panel-heading">
            <div>
              <h2>{t("attentionTitle")}</h2>
              <p>{t("attentionNote")}</p>
            </div>
            <Icon name="alert" size={20} />
          </div>
          {attention.length ? (
            <div className="attention-list">
              {attention.map((tender) => {
                const critical =
                  tender.analysis?.risks.filter(
                    (risk) => risk.severity === "critical",
                  ).length || 0;
                return (
                  <Link
                    href={`/tenders/${tender.id}?tab=${critical ? "risks" : "requirements"}`}
                    key={tender.id}
                    className="attention-row"
                  >
                    <span
                      className={
                        critical
                          ? "attention-symbol"
                          : "attention-symbol neutral"
                      }
                    >
                      <Icon name={critical ? "alert" : "clock"} size={18} />
                    </span>
                    <span>
                      <strong>
                        <bdi>
                          {localized(tender.analysis?.title, locale) ||
                            tender.title}
                        </bdi>
                      </strong>
                      <small>
                        {critical
                          ? locale === "ar"
                            ? `${t("criticalRisks")}: ${formatNumber(critical, locale)}`
                            : `${formatNumber(critical, locale)} ${t(critical === 1 ? "criticalFinding" : "criticalFindings")}`
                          : t("approachingDeadline")}
                      </small>
                    </span>
                    <Icon name="forward" size={18} className="directional" />
                  </Link>
                );
              })}
            </div>
          ) : (
            <div className="mini-empty">
              <span className="mini-empty-line" />
              <strong>{t("noAttention")}</strong>
              <p>{t("noAttentionNote")}</p>
            </div>
          )}
        </section>
        <section className="panel upcoming-panel">
          <div className="panel-heading">
            <div>
              <h2>{t("upcoming")}</h2>
              <p>{t("upcomingNote")}</p>
            </div>
            <Icon name="clock" size={20} />
          </div>
          {upcoming.length ? (
            <div className="upcoming-list">
              {upcoming.slice(0, 3).map((tender) => (
                <Link
                  href={`/tenders/${tender.id}`}
                  key={tender.id}
                  className="upcoming-row"
                >
                  <span className="calendar-date">
                    <strong>
                      {formatDate(tender.deadline, locale, {
                        day: "numeric",
                        month: undefined,
                        year: undefined,
                      })}
                    </strong>
                    <small>
                      {formatDate(tender.deadline, locale, {
                        day: undefined,
                        month: "short",
                        year: undefined,
                      })}
                    </small>
                  </span>
                  <span>
                    <strong>
                      <bdi>
                        {localized(tender.analysis?.title, locale) ||
                          tender.title}
                      </bdi>
                    </strong>
                    <small>{formatDate(tender.deadline, locale)}</small>
                  </span>
                </Link>
              ))}
            </div>
          ) : (
            <div className="mini-empty">
              <span className="mini-empty-line" />
              <strong>{t("noUpcoming")}</strong>
              <p>{t("noUpcomingNote")}</p>
            </div>
          )}
        </section>
      </div>
    </WorkspaceShell>
  );
}

"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { authenticatedFetch } from "@/lib/client";
import type { AppConfig, Tender } from "@/lib/types";
import { dictionaries, type Locale, type TranslationKey } from "@/lib/i18n";

type AnalysisRequestState = {
  pending: boolean;
  error: unknown | null;
};
type WorkspaceContextValue = {
  locale: Locale;
  setLocale: (value: Locale) => void;
  t: (key: TranslationKey) => string;
  config: AppConfig | null;
  tenders: Tender[];
  loading: boolean;
  loadError: string | null;
  reload: () => Promise<void>;
  analysisRequests: Record<string, AnalysisRequestState>;
  startAnalysis: (tender: Tender) => Promise<void>;
  uploadOpen: boolean;
  setUploadOpen: (open: boolean) => void;
};
const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

export function errorText(
  error: unknown,
  locale: Locale,
  fallback: TranslationKey = "loadFailed",
) {
  const code =
    typeof error === "object" && error !== null && "code" in error
      ? String(error.code)
      : "";
  const messages: Record<string, { en: string; ar: string }> = {
    INVALID_PDF: {
      en: "This file could not be read as a PDF. Choose a valid document.",
      ar: "تعذرت قراءة الملف بصيغة PDF. اختر مستندًا صالحًا.",
    },
    FILE_TOO_LARGE: {
      en: "This PDF exceeds the 10 MB limit.",
      ar: "يتجاوز ملف PDF حد 10 ميجابايت.",
    },
    PDF_TOO_LARGE: {
      en: "This PDF exceeds the 10 MB limit.",
      ar: "يتجاوز ملف PDF حد 10 ميجابايت.",
    },
    TOO_MANY_PAGES: {
      en: "This PDF exceeds the 50-page limit.",
      ar: "يتجاوز ملف PDF حد 50 صفحة.",
    },
    DOCUMENT_TOO_LONG: {
      en: "This document contains too much text. Upload a shorter document.",
      ar: "يتضمن المستند نصًا يتجاوز الحد المسموح. ارفع مستندًا أقصر.",
    },
    TOO_MUCH_TEXT: {
      en: "This document contains too much text. Upload a shorter document.",
      ar: "يتضمن المستند نصًا يتجاوز الحد المسموح. ارفع مستندًا أقصر.",
    },
    SCANNED_PDF: {
      en: "This PDF contains scanned pages. Upload a version with selectable text.",
      ar: "يتضمن الملف صفحات ممسوحة ضوئيًا. ارفع نسخة بنص قابل للتحديد.",
    },
    NO_TEXT: {
      en: "No readable text was found. Upload a PDF with selectable text.",
      ar: "لم يُعثر على نص قابل للقراءة. ارفع ملف PDF بنص قابل للتحديد.",
    },
    ENCRYPTED_PDF: {
      en: "This PDF is password-protected. Upload an unlocked copy.",
      ar: "ملف PDF محمي بكلمة مرور. ارفع نسخة غير محمية.",
    },
    PROCESSING: {
      en: "This tender is already being analyzed. Follow its progress here.",
      ar: "يجري تحليل المنافسة بالفعل. تابع تقدمها هنا.",
    },
    ALREADY_PROCESSING: {
      en: "This tender is already being analyzed. Follow its progress here.",
      ar: "يجري تحليل المنافسة بالفعل. تابع تقدمها هنا.",
    },
    RATE_LIMITED: {
      en: "You have made several requests. Please wait a moment and try again.",
      ar: "تم إرسال عدة طلبات. انتظر قليلًا ثم حاول مجددًا.",
    },
    AI_RATE_LIMITED: {
      en: "Gemini's request or quota limit was reached. Your document is saved. Try again later; if this continues, check the project's Gemini quota.",
      ar: "تم بلوغ حد الطلبات أو الحصة المخصصة لخدمة Gemini. مستندك محفوظ. حاول لاحقًا، وإذا استمرت المشكلة فتحقق من حصة Gemini للمشروع.",
    },
    AI_TIMEOUT: {
      en: "The analysis took too long. Your document is saved; please retry.",
      ar: "استغرق التحليل وقتًا أطول من المتوقع. مستندك محفوظ؛ أعد المحاولة.",
    },
    NOT_CONFIGURED: {
      en: dictionaries.en.setupDescription,
      ar: dictionaries.ar.setupDescription,
    },
    CONFIGURATION_REQUIRED: {
      en: dictionaries.en.setupDescription,
      ar: dictionaries.ar.setupDescription,
    },
    UNAUTHORIZED: {
      en: dictionaries.en.sessionFailed,
      ar: dictionaries.ar.sessionFailed,
    },
    AUTH_REQUIRED: {
      en: dictionaries.en.sessionFailed,
      ar: dictionaries.ar.sessionFailed,
    },
    AUTH_FAILED: {
      en: dictionaries.en.sessionFailed,
      ar: dictionaries.ar.sessionFailed,
    },
    DATABASE_NOT_READY: {
      en: "The workspace database is not ready. Complete the database setup and try again.",
      ar: "قاعدة بيانات مساحة العمل غير جاهزة. أكمل إعدادها ثم أعد المحاولة.",
    },
    AI_NOT_CONFIGURED: {
      en: "Connect Gemini before starting document analysis.",
      ar: "اربط Gemini قبل بدء تحليل المستندات.",
    },
    AI_INVALID_CITATIONS: {
      en: "The generated sources could not be verified. Please retry the analysis.",
      ar: "تعذر التحقق من مصادر التحليل. يرجى إعادة المحاولة.",
    },
    AI_INVALID_RESPONSE: {
      en: "The analysis response could not be validated. Please try again.",
      ar: "تعذر التحقق من صحة استجابة التحليل. يرجى المحاولة مرة أخرى.",
    },
    AI_UNAVAILABLE: {
      en: "Gemini is currently unavailable. Your document is saved; please retry shortly.",
      ar: "خدمة Gemini غير متاحة حاليًا. مستندك محفوظ؛ أعد المحاولة بعد قليل.",
    },
    AI_ACCESS_DENIED: {
      en: "Gemini rejected access. Check the API key and its project permissions, then restart the app.",
      ar: "رفض Gemini الوصول. تحقق من مفتاح API وصلاحيات مشروعه، ثم أعد تشغيل التطبيق.",
    },
    AI_MODEL_UNAVAILABLE: {
      en: "The configured Gemini model is unavailable to this API key. Check GEMINI_MODEL and restart the app.",
      ar: "نموذج Gemini المحدد غير متاح لهذا المفتاح. تحقق من GEMINI_MODEL وأعد تشغيل التطبيق.",
    },
    AI_REQUEST_REJECTED: {
      en: "Gemini rejected the analysis request. Check the configured model and API compatibility.",
      ar: "رفض Gemini طلب التحليل. تحقق من النموذج المحدد وتوافق API.",
    },
    UPLOAD_NOT_FOUND: {
      en: "The uploaded document could not be found. Upload the PDF again.",
      ar: "تعذر العثور على المستند المرفوع. ارفع ملف PDF مجددًا.",
    },
    NOT_FOUND: {
      en: dictionaries.en.tenderNotFoundNote,
      ar: dictionaries.ar.tenderNotFoundNote,
    },
  };
  return messages[code]?.[locale] || dictionaries[locale][fallback];
}

export function WorkspaceProvider({
  children,
  initialLocale = "en",
}: {
  children: ReactNode;
  initialLocale?: Locale;
}) {
  const [locale, updateLocale] = useState<Locale>(initialLocale);
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [tenders, setTenders] = useState<Tender[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [analysisRequests, setAnalysisRequests] = useState<
    Record<string, AnalysisRequestState>
  >({});
  const inFlight = useRef(new Map<string, Promise<void>>());
  const tenderRevision = useRef(0);
  // A request started before an analysis completes must not restore an older
  // Uploaded snapshot over the terminal result returned by that analysis.
  const mergeTenders = useCallback((incoming: Tender[], replace = false) => {
    if (!replace) tenderRevision.current++;
    setTenders((current) => {
      const previous = new Map(current.map((tender) => [tender.id, tender]));
      const merged = incoming.map((tender) => {
        const known = previous.get(tender.id);
        if (!known) return tender;
        const older =
          Date.parse(tender.updated_at) < Date.parse(known.updated_at);
        const lostResult =
          tender.updated_at === known.updated_at &&
          known.status === "ready" &&
          tender.status !== "ready";
        return older || lostResult ? known : tender;
      });
      if (replace) return merged;
      const ids = new Set(incoming.map((tender) => tender.id));
      return [...current.filter((tender) => !ids.has(tender.id)), ...merged];
    });
  }, []);
  const refreshTenders = useCallback(async () => {
    const revision = tenderRevision.current;
    const data = await authenticatedFetch<{ tenders: Tender[] }>(
      "/api/tenders",
    );
    if (revision !== tenderRevision.current) return;
    mergeTenders(data.tenders, true);
  }, [mergeTenders]);
  const startAnalysis = useCallback(
    (tender: Tender): Promise<void> => {
      const existing = inFlight.current.get(tender.id);
      if (existing) return existing;
      mergeTenders([tender]);
      setAnalysisRequests((current) => ({
        ...current,
        [tender.id]: { pending: true, error: null },
      }));
      // Install the promise before starting network work, including auth, so
      // route remounts and repeated clicks join the same operation.
      const operation = Promise.resolve().then(async () => {
        try {
          const result = await authenticatedFetch<{ tender: Tender }>(
            `/api/tenders/${tender.id}/analyze`,
            { method: "POST" },
          );
          mergeTenders([result.tender]);
          setAnalysisRequests((current) => ({
            ...current,
            [tender.id]: { pending: false, error: null },
          }));
        } catch (error) {
          setAnalysisRequests((current) => ({
            ...current,
            [tender.id]: { pending: false, error },
          }));
        } finally {
          inFlight.current.delete(tender.id);
          // Refresh failures as well as successes, even if the detail page was
          // unmounted. This is client-side reconciliation, not a background job.
          void refreshTenders().catch(() => undefined);
        }
      });
      inFlight.current.set(tender.id, operation);
      return operation;
    },
    [mergeTenders, refreshTenders],
  );
  const analysisPending = Object.values(analysisRequests).some(
    (item) => item.pending,
  );
  useEffect(() => {
    if (!analysisPending) return;
    const timer = window.setInterval(() => {
      void refreshTenders().catch(() => undefined);
    }, 2500);
    return () => window.clearInterval(timer);
  }, [analysisPending, refreshTenders]);
  useEffect(() => {
    document.documentElement.lang = locale;
    document.documentElement.dir = locale === "ar" ? "rtl" : "ltr";
  }, [locale]);
  const setLocale = useCallback((value: Locale) => {
    updateLocale(value);
    try {
      localStorage.setItem("tender-locale", value);
    } catch {
      /* Cookies retain the preference when browser storage is unavailable. */
    }
    document.cookie = `tender-locale=${value}; path=/; max-age=31536000; SameSite=Lax`;
  }, []);
  const reload = useCallback(async () => {
    try {
      const response = await fetch("/api/config", { cache: "no-store" });
      if (!response.ok) throw new Error("config");
      const settings = (await response.json()) as AppConfig;
      setLoadError(null);
      setConfig(settings);
      if (settings.supabaseConfigured) {
        await refreshTenders();
      }
    } catch (error) {
      setLoadError(errorText(error, locale));
    } finally {
      setLoading(false);
    }
  }, [locale, refreshTenders]);
  // Initial network loading updates state only after an awaited response; this synchronizes an external service.
  useEffect(() => {
    void reload();
  }, [reload]);
  return (
    <WorkspaceContext.Provider
      value={{
        locale,
        setLocale,
        t: (key) => dictionaries[locale][key],
        config,
        tenders: tenders.map((tender) => {
          const request = analysisRequests[tender.id];
          if (request?.pending && tender.status !== "ready") {
            return {
              ...tender,
              status:
                tender.status === "analyzing" ? "analyzing" : "extracting",
            };
          }
          // A rejected request may fail before the server claims a lease;
          // keep that local failure visible instead of reverting to Uploaded.
          if (request?.error && tender.status === "uploaded") {
            return { ...tender, status: "failed" };
          }
          return tender;
        }),
        loading,
        loadError,
        reload,
        analysisRequests,
        startAnalysis,
        uploadOpen,
        setUploadOpen,
      }}
    >
      {children}
    </WorkspaceContext.Provider>
  );
}

export function useWorkspace() {
  const context = useContext(WorkspaceContext);
  if (!context) throw new Error("WorkspaceProvider is required");
  return context;
}

"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { authenticatedFetch } from "@/lib/client";
import type { AppConfig, Tender } from "@/lib/types";
import { dictionaries, type Locale, type TranslationKey } from "@/lib/i18n";

type WorkspaceContextValue = {
  locale: Locale;
  setLocale: (value: Locale) => void;
  t: (key: TranslationKey) => string;
  config: AppConfig | null;
  tenders: Tender[];
  loading: boolean;
  loadError: string | null;
  reload: () => Promise<void>;
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
      en: "The analysis service is busy. Please wait a moment and retry.",
      ar: "خدمة التحليل مشغولة. انتظر قليلًا ثم أعد المحاولة.",
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
        const data = await authenticatedFetch<{ tenders: Tender[] }>(
          "/api/tenders",
        );
        setTenders(data.tenders);
      }
    } catch (error) {
      setLoadError(errorText(error, locale));
    } finally {
      setLoading(false);
    }
  }, [locale]);
  // Initial network loading updates state only after an awaited response; this synchronizes an external service.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void reload();
  }, [reload]);
  return (
    <WorkspaceContext.Provider
      value={{
        locale,
        setLocale,
        t: (key) => dictionaries[locale][key],
        config,
        tenders,
        loading,
        loadError,
        reload,
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

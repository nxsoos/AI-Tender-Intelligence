"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon } from "./icons";
import { Button } from "./ui/button";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
  DialogClose,
} from "./ui/dialog";
import { useWorkspace } from "./workspace-provider";
import { UploadDialog } from "./upload-dialog";

function Navigation({ onNavigate }: { onNavigate?: () => void }) {
  const { t } = useWorkspace();
  const pathname = usePathname();
  return (
    <>
      <Link href="/" className="brand" onClick={onNavigate}>
        <span className="brand-mark">
          <Icon name="file" size={24} />
          <span className="brand-mark-line" />
        </span>
        <span>
          {t("product")}
          <small>{t("procurement")}</small>
        </span>
      </Link>
      <div className="sidebar-section-label">{t("workspace")}</div>
      <nav aria-label={t("navigation")} className="sidebar-nav">
        <Link
          href="/"
          className={`nav-item ${pathname === "/" ? "active" : ""}`}
          onClick={onNavigate}
        >
          <Icon name="dashboard" size={20} />
          {t("overview")}
        </Link>
        <Link
          href="/#tenders"
          className={`nav-item ${pathname.startsWith("/tenders/") ? "active" : ""}`}
          onClick={onNavigate}
        >
          <Icon name="folder" size={20} />
          {t("tenders")}
        </Link>
        <a
          href="/sample-tender.pdf"
          target="_blank"
          rel="noreferrer"
          className="nav-item"
          onClick={onNavigate}
        >
          <Icon name="file" size={20} />
          {t("sampleDocument")}
          <Icon
            name="external"
            size={16}
            className="nav-external directional"
          />
        </a>
      </nav>
      <div className="sidebar-bottom">
        <div className="privacy-note">
          <Icon name="shield" size={20} />
          <strong>{t("guestTitle")}</strong>
          <p>{t("guestNote")}</p>
        </div>
        <div className="guest-profile">
          <span className="guest-avatar">G</span>
          <span>
            <strong>{t("guestBadge")}</strong>
            <small>{t("guestShort")}</small>
          </span>
          <Icon name="shield" size={18} />
        </div>
      </div>
    </>
  );
}

export function WorkspaceShell({
  children,
  tender = false,
}: {
  children: ReactNode;
  tender?: boolean;
}) {
  const { t, locale, setLocale } = useWorkspace();
  const [navOpen, setNavOpen] = useState(false);
  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">
        {locale === "ar" ? "الانتقال إلى المحتوى" : "Skip to content"}
      </a>
      <aside className="sidebar">
        <Navigation />
      </aside>
      <div className="app-main">
        <header className="topbar">
          <div className="topbar-context">
            <Button
              variant="ghost"
              size="icon"
              className="mobile-nav-toggle"
              aria-label={t("menu")}
              onClick={() => setNavOpen(true)}
            >
              <Icon name="menu" />
            </Button>
            <span className="breadcrumb-root">{t("workspace")}</span>
            <span className="breadcrumb-divider">/</span>
            <span>{t(tender ? "tenders" : "overview")}</span>
          </div>
          <div className="topbar-actions">
            <span className="private-indicator">
              <Icon name="shield" size={16} />
              {t("guestShort")}
            </span>
            <span className="topbar-separator" />
            <Button
              variant="ghost"
              size="sm"
              className="language-button"
              aria-label={`${t("language")}: ${locale === "en" ? "العربية" : "English"}`}
              onClick={() => setLocale(locale === "en" ? "ar" : "en")}
            >
              <Icon name="language" size={18} />
              <span lang={locale === "en" ? "ar" : "en"}>
                {locale === "en" ? "العربية" : "English"}
              </span>
            </Button>
          </div>
        </header>
        <main id="main-content" className="page-content">
          {children}
        </main>
        <footer className="app-footer">
          <span>AI Tender Intelligence</span>
          <span>
            <Icon name="shield" size={14} />
            {t("guestShort")}
          </span>
        </footer>
      </div>
      <Dialog open={navOpen} onOpenChange={setNavOpen}>
        <DialogContent sheet className="navigation-sheet">
          <DialogTitle className="sr-only">{t("navigation")}</DialogTitle>
          <DialogDescription className="sr-only">
            {t("workspace")}
          </DialogDescription>
          <DialogClose className="sheet-close" aria-label={t("close")}>
            <Icon name="close" />
          </DialogClose>
          <Navigation onNavigate={() => setNavOpen(false)} />
        </DialogContent>
      </Dialog>
      <UploadDialog />
    </div>
  );
}

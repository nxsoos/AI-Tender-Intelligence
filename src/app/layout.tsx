import type { Metadata } from "next";
import { cookies } from "next/headers";
import { IBM_Plex_Sans, IBM_Plex_Sans_Arabic } from "next/font/google";
import { WorkspaceProvider } from "@/components/workspace-provider";
import "./globals.css";

const english = IBM_Plex_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-english",
  display: "swap",
});
const arabic = IBM_Plex_Sans_Arabic({
  subsets: ["arabic"],
  weight: ["400", "500", "600"],
  variable: "--font-arabic",
  display: "swap",
});
export const metadata: Metadata = {
  title: "AI Tender Intelligence",
  description:
    "Review tender requirements, track submission readiness, and ask document-grounded questions with page references.",
  robots: { index: false, follow: false },
};
export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const locale =
    (await cookies()).get("tender-locale")?.value === "ar" ? "ar" : "en";
  return (
    <html
      lang={locale}
      dir={locale === "ar" ? "rtl" : "ltr"}
      data-scroll-behavior="smooth"
      suppressHydrationWarning
    >
      <body className={`${english.variable} ${arabic.variable}`}>
        <WorkspaceProvider initialLocale={locale}>{children}</WorkspaceProvider>
      </body>
    </html>
  );
}

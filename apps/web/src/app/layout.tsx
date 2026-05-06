import type { ReactNode } from "react";
import type { Metadata, Viewport } from "next";
import { Providers } from "./providers";
import { Header } from "@/components/Header";
import {
  SITE_DESCRIPTION,
  SITE_NAME,
  SITE_TITLE_DEFAULT,
  SITE_URL,
  SEO_KEYWORDS,
} from "@/lib/seo";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: SITE_TITLE_DEFAULT,
    template: `%s · ${SITE_NAME}`,
  },
  description: SITE_DESCRIPTION,
  applicationName: SITE_NAME,
  generator: "Next.js",
  keywords: SEO_KEYWORDS,
  authors: [{ name: SITE_NAME, url: SITE_URL }],
  creator: SITE_NAME,
  publisher: SITE_NAME,
  category: "legaltech",
  referrer: "origin-when-cross-origin",
  formatDetection: { email: false, address: false, telephone: false },
  alternates: {
    canonical: "/",
    languages: { "ru-RU": "/", "x-default": "/" },
  },
  openGraph: {
    type: "website",
    locale: "ru_RU",
    url: SITE_URL,
    siteName: SITE_NAME,
    title: SITE_TITLE_DEFAULT,
    description: SITE_DESCRIPTION,
  },
  twitter: {
    card: "summary_large_image",
    title: SITE_TITLE_DEFAULT,
    description: SITE_DESCRIPTION,
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-snippet": -1,
      "max-image-preview": "large",
      "max-video-preview": -1,
    },
  },
  icons: {
    icon: [
      { url: "/favicon.ico" },
      { url: "/icon.svg", type: "image/svg+xml" },
    ],
    apple: "/apple-icon.png",
  },
  manifest: "/manifest.webmanifest",
  // Подсказки для поисковиков, что страница на русском языке.
  other: {
    "yandex-verification": process.env.YANDEX_VERIFICATION_TOKEN ?? "",
    "google-site-verification": process.env.GOOGLE_SITE_VERIFICATION ?? "",
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0b0f1a" },
  ],
  width: "device-width",
  initialScale: 1,
};

const themeInitScript = `
try {
  var t = localStorage.getItem('theme');
  if (t !== 'dark' && t !== 'light') t = 'light';
  document.documentElement.setAttribute('data-theme', t);
} catch (e) {
  document.documentElement.setAttribute('data-theme', 'light');
}
`;

/**
 * JSON-LD: Organization + WebSite. Эти два графа поисковики ожидают на каждой
 * странице — они дают сайт-линкбоксы, имя организации в выдаче и поле поиска
 * (если поддерживается). Конкретные страницы могут добавлять свои графы поверх.
 */
function GlobalJsonLd() {
  const organization = {
    "@context": "https://schema.org",
    "@type": "Organization",
    "@id": `${SITE_URL}#organization`,
    name: SITE_NAME,
    url: SITE_URL,
    logo: `${SITE_URL}/icon.svg`,
    description: SITE_DESCRIPTION,
    sameAs: [] as string[],
  };
  const website = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    "@id": `${SITE_URL}#website`,
    url: SITE_URL,
    name: SITE_NAME,
    description: SITE_DESCRIPTION,
    inLanguage: "ru-RU",
    publisher: { "@id": `${SITE_URL}#organization` },
  };
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(organization) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(website) }}
      />
    </>
  );
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ru" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
        <GlobalJsonLd />
      </head>
      <body className="min-h-screen font-sans antialiased text-[var(--text)]">
        <Providers>
          <Header />
          {children}
        </Providers>
      </body>
    </html>
  );
}

import type { ReactNode } from "react";
import { Providers } from "./providers";
import { Header } from "@/components/Header";
import "./globals.css";

export const metadata = {
  title: "PravoLetter — разбор писем от государства и банков",
  description:
    "Загрузите письмо из ФНС, ФССП, банка, ГИБДД или ЖКХ — получите понятный разбор: что это, какие сроки, варианты действий.",
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

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ru" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
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

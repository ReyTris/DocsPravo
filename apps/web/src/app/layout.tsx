import type { ReactNode } from "react";
import { Providers } from "./providers";
import { Header } from "@/components/Header";
import "./globals.css";

export const metadata = {
  title: "PravoLetter — разбор писем от государства и банков",
  description:
    "Загрузите письмо из ФНС, ФССП, банка, ГИБДД или ЖКХ — получите понятный разбор: что это, какие сроки, варианты действий.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ru">
      <body className="min-h-screen font-sans antialiased" style={{ color: "var(--text)" }}>
        <Providers>
          <Header />
          {children}
        </Providers>
      </body>
    </html>
  );
}

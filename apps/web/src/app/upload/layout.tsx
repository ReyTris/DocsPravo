import type { ReactNode } from "react";
import { buildMetadata } from "@/lib/seo";

export const metadata = buildMetadata({
  title: "Загрузить документ для разбора — фото или PDF",
  description:
    "Загрузите фото или PDF официального письма (ФНС, ФССП, суд, ГИБДД, военкомат, банк, ЖКХ) — " +
    "получите понятный разбор за 30 секунд. Персональные данные маскируются перед отправкой в ИИ.",
  path: "/upload",
});

export default function Layout({ children }: { children: ReactNode }) {
  return children;
}

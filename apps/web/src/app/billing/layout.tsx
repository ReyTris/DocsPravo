import type { ReactNode } from "react";
import { buildMetadata } from "@/lib/seo";

export const metadata = buildMetadata({
  title: "Тарифы и оплата — пакеты страниц",
  description:
    "Пакеты страниц для разбора документов: 3 страницы за 100 ₽, 10 страниц за 200 ₽, 30 страниц за 400 ₽. " +
    "Без подписки, страницы не сгорают. Оплата через ЮKassa.",
  path: "/billing",
  noIndex: true,
});

export default function Layout({ children }: { children: ReactNode }) {
  return children;
}

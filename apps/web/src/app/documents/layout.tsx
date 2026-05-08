import type { ReactNode } from "react";
import { buildMetadata } from "@/lib/seo";

export const metadata = buildMetadata({
  title: "Мои документы",
  description: "Список всех загруженных и разобранных документов в личном кабинете ПроДоки.",
  path: "/documents",
  noIndex: true,
});

export default function Layout({ children }: { children: ReactNode }) {
  return children;
}

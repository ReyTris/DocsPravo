import type { ReactNode } from "react";
import { buildMetadata } from "@/lib/seo";

export const metadata = buildMetadata({
  title: "Вход в личный кабинет",
  description:
    "Войдите в личный кабинет ПроДоки, чтобы загрузить новый документ или открыть прошлые разборы.",
  path: "/login",
  noIndex: true,
});

export default function Layout({ children }: { children: ReactNode }) {
  return children;
}

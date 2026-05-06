import type { ReactNode } from "react";
import { buildMetadata } from "@/lib/seo";

export const metadata = buildMetadata({
  title: "Регистрация — 1 страница разбора в подарок",
  description:
    "Создайте бесплатный аккаунт PravoLetter и получите 1 страницу разбора в подарок. " +
    "Без карты, без подписки. Разберите своё первое письмо от ФНС, ФССП, ГИБДД или банка.",
  path: "/register",
});

export default function Layout({ children }: { children: ReactNode }) {
  return children;
}

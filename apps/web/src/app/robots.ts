import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/seo";

/**
 * Открываем для индексации только публичные маркетинговые страницы.
 * Личный кабинет, страницы документов и API закрываем — там нечего индексировать
 * и могут утечь идентификаторы документов в выдачу.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/"],
        disallow: [
          "/api/",
          "/documents",
          "/documents/",
          "/upload",
          "/billing",
          "/login",
          "/register",
        ],
      },
      // Яндексу даём те же правила явно — Yandex иногда странно интерпретирует "*"
      {
        userAgent: "Yandex",
        allow: ["/"],
        disallow: [
          "/api/",
          "/documents",
          "/documents/",
          "/upload",
          "/billing",
          "/login",
          "/register",
        ],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}

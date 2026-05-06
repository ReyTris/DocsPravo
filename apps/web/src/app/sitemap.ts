import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/seo";

/**
 * Sitemap для публичных страниц.
 * Внутренние страницы (личный кабинет, документы) намеренно не включаем —
 * они закрыты в robots.ts и индексировать там нечего.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  return [
    {
      url: `${SITE_URL}/`,
      lastModified: now,
      changeFrequency: "weekly",
      priority: 1.0,
    },
  ];
}

import type { MetadataRoute } from "next";
import { SITE_DESCRIPTION, SITE_NAME } from "@/lib/seo";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: `${SITE_NAME} — разбор писем от государства и банков`,
    short_name: SITE_NAME,
    description: SITE_DESCRIPTION,
    lang: "ru",
    dir: "ltr",
    start_url: "/",
    display: "standalone",
    background_color: "#0b0f1a",
    theme_color: "#6c8cff",
    categories: ["productivity", "business", "finance"],
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
    ],
  };
}

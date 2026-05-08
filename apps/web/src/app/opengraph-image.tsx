import { ImageResponse } from "next/og";

/**
 * Динамическая OG-картинка для главной страницы.
 * Next.js автоматически отдаст её по /opengraph-image и подставит в метатеги.
 */
export const runtime = "edge";
export const alt = "ПроДоки — разбор писем от государства и банков";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "72px",
          background:
            "linear-gradient(135deg, #0b0f1a 0%, #141a2e 50%, #1a1530 100%)",
          color: "#fff",
          fontFamily: "system-ui, -apple-system, sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
          <div
            style={{
              width: 64,
              height: 64,
              borderRadius: 16,
              background: "linear-gradient(135deg, #6c8cff 0%, #9d6cff 100%)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 36,
            }}
          >
            📄
          </div>
          <div style={{ fontSize: 36, fontWeight: 700, letterSpacing: -0.5 }}>
            ПроДоки
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          <div
            style={{
              fontSize: 72,
              fontWeight: 800,
              lineHeight: 1.05,
              letterSpacing: -2,
              maxWidth: 1000,
            }}
          >
            Письмо от налоговой?{" "}
            <span
              style={{
                background: "linear-gradient(135deg, #6c8cff 0%, #9d6cff 100%)",
                backgroundClip: "text",
                color: "transparent",
              }}
            >
              Сначала выдохните.
            </span>
          </div>
          <div style={{ fontSize: 28, color: "#9ba4b8", maxWidth: 980 }}>
            Разбор официальных писем от ФНС, ФССП, ГИБДД, судов, военкомата,
            банков и ЖКХ за 30 секунд. Без юриста.
          </div>
        </div>

        <div
          style={{
            display: "flex",
            gap: 32,
            fontSize: 22,
            color: "#9ba4b8",
          }}
        >
          <span>✓ Фото или PDF</span>
          <span>✓ Маскирование ПД</span>
          <span>✓ 1 страница бесплатно</span>
        </div>
      </div>
    ),
    { ...size },
  );
}

"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { readConsent, writeConsent } from "@/lib/cookie-consent";

export function CookieBanner() {
  const [visible, setVisible] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const [analytics, setAnalytics] = useState(false);
  const [marketing, setMarketing] = useState(false);

  useEffect(() => {
    if (readConsent() === null) setVisible(true);
  }, []);

  if (!visible) return null;

  const acceptAll = () => {
    writeConsent({ analytics: true, marketing: true });
    setVisible(false);
  };
  const acceptNecessary = () => {
    writeConsent({ analytics: false, marketing: false });
    setVisible(false);
  };
  const saveChoice = () => {
    writeConsent({ analytics, marketing });
    setVisible(false);
  };

  return (
    <div
      role="dialog"
      aria-live="polite"
      aria-label="Согласие на использование cookie"
      className="fixed inset-x-0 bottom-0 z-50 px-4 pb-4"
    >
      <div className="mx-auto max-w-[920px] rounded-2xl border border-[var(--card-border)] bg-[var(--card)] p-5 shadow-2xl">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:gap-6">
          <div className="flex-1 text-[14px] leading-[1.6] text-[var(--text)]">
            <div className="font-semibold">Мы используем cookie</div>
            <p className="mt-1 text-[var(--muted)]">
              Технически необходимые cookie обеспечивают работу аутентификации
              и сохранение настроек — они устанавливаются без согласия.
              Аналитические и маркетинговые cookie помогают нам улучшать
              сервис и устанавливаются только с вашего согласия. Подробности —
              в{" "}
              <Link href="/legal/privacy" className="underline">
                Политике обработки персональных данных
              </Link>
              .
            </p>

            {showDetails && (
              <div className="mt-4 space-y-2 rounded-lg border border-[var(--card-border)] bg-[var(--surface-hover)]/40 p-3 text-[13px]">
                <label className="flex items-start gap-2 opacity-60">
                  <input
                    type="checkbox"
                    checked
                    disabled
                    className="mt-0.5"
                    aria-label="Технически необходимые"
                  />
                  <span>
                    <strong>Технически необходимые</strong> — сессия,
                    аутентификация, защита от CSRF. Не отключаются.
                  </span>
                </label>
                <label className="flex items-start gap-2">
                  <input
                    type="checkbox"
                    checked={analytics}
                    onChange={(e) => setAnalytics(e.target.checked)}
                    className="mt-0.5"
                  />
                  <span>
                    <strong>Аналитические</strong> — анонимная статистика
                    использования сервиса для улучшения качества.
                  </span>
                </label>
                <label className="flex items-start gap-2">
                  <input
                    type="checkbox"
                    checked={marketing}
                    onChange={(e) => setMarketing(e.target.checked)}
                    className="mt-0.5"
                  />
                  <span>
                    <strong>Маркетинговые</strong> — оценка эффективности
                    рекламных каналов.
                  </span>
                </label>
              </div>
            )}
          </div>

          <div className="flex flex-col gap-2 md:w-[220px] md:shrink-0">
            {showDetails ? (
              <button
                type="button"
                onClick={saveChoice}
                className="btn-brand inline-flex items-center justify-center rounded-xl px-4 py-2 text-[14px] font-semibold"
              >
                Сохранить выбор
              </button>
            ) : (
              <button
                type="button"
                onClick={acceptAll}
                className="btn-brand inline-flex items-center justify-center rounded-xl px-4 py-2 text-[14px] font-semibold"
              >
                Принять все
              </button>
            )}
            <button
              type="button"
              onClick={acceptNecessary}
              className="inline-flex items-center justify-center rounded-xl border border-[var(--card-border)] bg-[var(--card)] px-4 py-2 text-[14px] font-semibold text-[var(--text)] transition-colors hover:bg-[var(--surface-hover)]"
            >
              Только необходимые
            </button>
            <button
              type="button"
              onClick={() => setShowDetails((v) => !v)}
              className="text-[13px] text-[var(--muted)] underline-offset-2 hover:underline"
            >
              {showDetails ? "Свернуть" : "Настроить"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

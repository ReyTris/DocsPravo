"use client";

import { useEffect } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { trpc } from "@/lib/trpc";
import { hasSession } from "@/lib/auth-client";
import type { AnalysisOutput, NavigatorOutput } from "@pravoletter/schemas";

const PROCESSING = new Set([
  "uploaded",
  "ocr_processing",
  "classify_processing",
  "extract_processing",
  "analyze_processing",
]);

const STATUS_LABEL: Record<string, string> = {
  uploaded: "Загружен, ставим в очередь...",
  ocr_processing: "Распознаём текст...",
  classify_processing: "Анализируем тип документа...",
  extract_processing: "Извлекаем поля...",
  analyze_processing: "Готовим разбор...",
};

export default function DocumentPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const search = useSearchParams();
  const id = params.id;
  const justPaid = search.get("paid") === "1";

  useEffect(() => {
    if (!hasSession()) router.replace("/login");
    const onAuthChanged = () => {
      if (!hasSession()) router.replace("/login");
    };
    window.addEventListener("auth-changed", onAuthChanged);
    return () => window.removeEventListener("auth-changed", onAuthChanged);
  }, [router]);

  const doc = trpc.documents.getById.useQuery(
    { id },
    {
      refetchInterval: (q) => {
        const data = q.state.data;
        if (data && PROCESSING.has(data.status)) return 3000;
        return false;
      },
    },
  );

  const utils = trpc.useUtils();
  const createPayment = trpc.payments.create.useMutation({
    onSuccess: (r) => {
      window.location.href = r.confirmationUrl;
    },
  });
  const devMockPay = trpc.payments.devMockPay.useMutation({
    onSuccess: () => utils.documents.getById.invalidate({ id }),
  });
  const reprocess = trpc.documents.reprocess.useMutation({
    onSuccess: () => utils.documents.getById.invalidate({ id }),
  });
  const cancel = trpc.documents.cancel.useMutation({
    onSuccess: () => utils.documents.getById.invalidate({ id }),
  });

  const buy = () => createPayment.mutate({ documentId: id, product: "analysis" });
  const mockPay = () => devMockPay.mutate({ documentId: id });

  if (doc.isLoading) return <Centered>Загрузка...</Centered>;
  if (doc.error) return <Centered>Ошибка: {doc.error.message}</Centered>;
  const d = doc.data!;

  if (PROCESSING.has(d.status)) {
    return (
      <main className="mx-auto max-w-2xl px-6 py-12">
        <h1 className="text-2xl font-bold">{STATUS_LABEL[d.status]}</h1>
        <p className="mt-3 text-[var(--muted)]">
          Обычно 30–60 секунд. Страница обновится автоматически.
        </p>
        <div className="mt-6 h-2 w-full animate-pulse rounded-full bg-white/10" />
        <button
          onClick={() => cancel.mutate({ id })}
          disabled={cancel.isPending}
          className="mt-6 rounded-md border border-white/10 bg-white/5 px-4 py-2 text-sm text-[var(--muted)] hover:bg-white/10 disabled:opacity-50"
        >
          {cancel.isPending ? "Отменяем..." : "Отменить обработку"}
        </button>
      </main>
    );
  }

  if (d.status === "cancelled") {
    return (
      <main className="mx-auto max-w-2xl px-6 py-12">
        <h1 className="text-2xl font-bold">Обработка отменена</h1>
        <p className="mt-3 text-[var(--muted)]">
          Вы остановили разбор этого документа. Можно запустить заново или удалить
          документ из списка.
        </p>
        <button
          onClick={() => reprocess.mutate({ id })}
          disabled={reprocess.isPending}
          className="mt-6 rounded-md bg-black px-4 py-2 text-sm text-white disabled:opacity-50"
        >
          {reprocess.isPending ? "Запускаем..." : "Запустить заново"}
        </button>
      </main>
    );
  }

  if (d.status === "unsupported") {
    return (
      <main className="mx-auto max-w-2xl px-6 py-12">
        <h1 className="text-2xl font-bold">Не смогли обработать документ</h1>
        <p className="mt-3 text-[var(--muted)]">
          Не удалось распознать структуру документа. Возможно, плохое качество скана или
          непонятный тип. Попробуйте загрузить более чёткое фото или PDF.
        </p>
      </main>
    );
  }

  if (d.status === "error") {
    return <Centered>Не удалось обработать документ. Попробуйте загрузить заново.</Centered>;
  }

  return (
    <main className="mx-auto max-w-5xl px-6 py-12">
      {justPaid && (
        <div className="mb-6 rounded-md bg-[var(--ok)]/10 p-3 text-sm text-[var(--ok)]">
          Оплата прошла. Разбор открыт.
        </div>
      )}

      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Разбор документа</h1>
          <p className="mt-1 text-sm text-[var(--muted)]">{d.filename}</p>
        </div>
        <button
          onClick={() => reprocess.mutate({ id })}
          disabled={reprocess.isPending}
          className="shrink-0 rounded-md border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-[var(--muted)] hover:bg-white/10 disabled:opacity-50"
          title="Перегенерировать разбор по обновлённому промту"
        >
          {reprocess.isPending ? "Запускаем..." : "🔄 Перегенерировать"}
        </button>
      </div>

      <ResponsibilityDisclaimer />

      {d.navigator && <NavigatorBlock nav={d.navigator} />}

      {d.paid && d.analysis ? (
        <AnalysisView a={d.analysis} />
      ) : (
        <Paywall
          available={d.analysisAvailable}
          onBuy={buy}
          paying={createPayment.isPending}
          onMockPay={mockPay}
          mockPaying={devMockPay.isPending}
          onReprocess={() => reprocess.mutate({ id })}
          reprocessing={reprocess.isPending}
        />
      )}
    </main>
  );
}

function Paywall({
  available,
  onBuy,
  paying,
  onMockPay,
  mockPaying,
  onReprocess,
  reprocessing,
}: {
  available: boolean;
  onBuy: () => void;
  paying: boolean;
  onMockPay: () => void;
  mockPaying: boolean;
  onReprocess: () => void;
  reprocessing: boolean;
}) {
  return (
    <section className="mt-8 rounded-lg border border-white/10 bg-white/5 p-6">
      <h2 className="text-lg font-semibold">Получить разбор документа</h2>
      <p className="mt-2 text-sm text-[var(--muted)]">
        Понятный пересказ простыми словами: что это за документ, что важно, какие сроки,
        подводные камни и что обязательно сверить в оригинале.
      </p>

      <div className="mt-5 flex items-baseline gap-3">
        <div className="text-2xl font-bold">290 ₽</div>
        <div className="text-sm text-[var(--muted)]">единый тариф</div>
      </div>

      <button
        onClick={onBuy}
        disabled={paying || !available}
        className="mt-4 w-full rounded-md bg-black px-5 py-3 text-sm font-medium text-white disabled:bg-white/10 sm:w-auto"
      >
        {paying ? "..." : "Получить разбор"}
      </button>

      <p className="mt-3 text-xs text-[var(--muted)]">
        Оплата через ЮKassa. Чек уходит автоматически в «Мой налог».
      </p>

      <div className="mt-6 border-t border-white/10 pt-4">
        <div className="text-xs font-semibold text-[var(--brand-2)]">🧪 Тестовый режим</div>
        <div className="mt-2 flex flex-wrap gap-2">
          <button
            onClick={onMockPay}
            disabled={mockPaying}
            className="rounded-md bg-purple-600 px-3 py-1.5 text-xs text-white hover:bg-purple-700 disabled:opacity-50"
          >
            {mockPaying ? "..." : "Открыть без оплаты"}
          </button>
          <button
            onClick={onReprocess}
            disabled={reprocessing}
            className="rounded-md border border-purple-400 bg-white/5 px-3 py-1.5 text-xs text-purple-400 hover:bg-purple-500/20 disabled:opacity-50"
          >
            {reprocessing ? "Запускаем..." : "🔄 Перегенерировать"}
          </button>
        </div>
      </div>
    </section>
  );
}

function ResponsibilityDisclaimer() {
  return (
    <div className="mt-4 rounded-md border border-[var(--warn)]/40 bg-[var(--warn)]/10 p-4 text-sm text-[var(--warn)]">
      <div className="font-semibold">⚠️ Отказ от ответственности</div>
      <p className="mt-1">
        Разбор сгенерирован автоматически с помощью AI и носит исключительно
        информационно-справочный характер. Сервис и его владелец{" "}
        <strong>не несут ответственности</strong> за возможные неточности,
        пропуски, ошибки распознавания или интерпретации, а также за любые
        решения и действия, принятые пользователем на основе этого разбора.
      </p>
      <p className="mt-2">
        Перед принятием юридически значимых решений сверьте все данные с
        оригиналом документа и при необходимости обратитесь к профильному
        специалисту. Используя сервис, вы соглашаетесь с этими условиями.
      </p>
    </div>
  );
}

function NavigatorBlock({ nav }: { nav: NavigatorOutput }) {
  return (
    <section className="mt-6 rounded-lg border border-white/10 p-5">
      <h2 className="font-semibold">📄 Что это за документ</h2>
      {nav.short_summary && (
        <div className="mt-3 whitespace-pre-line rounded-md bg-[var(--brand)]/10 p-4 text-[15px] leading-relaxed text-[var(--text)]">
          {nav.short_summary}
        </div>
      )}
      <dl className="mt-3 space-y-2 text-sm">
        {nav.sender_text && <Row label="Отправитель">{nav.sender_text}</Row>}
        {nav.document_kind_freeform && (
          <Row label="Тип">{nav.document_kind_freeform}</Row>
        )}
        {nav.key_dates.length > 0 && (
          <Row label="Ключевые даты">
            <ul className="space-y-1">
              {nav.key_dates.map((d, i) => (
                <li key={i}>
                  <span className="font-medium">{d.date_iso ?? d.raw_text}</span>
                  {d.what_for ? ` — ${d.what_for}` : ""}
                </li>
              ))}
            </ul>
          </Row>
        )}
        {nav.key_amounts.length > 0 && (
          <Row label="Суммы">
            <ul className="space-y-1">
              {nav.key_amounts.map((a, i) => (
                <li key={i}>
                  <span className="font-medium">
                    {a.amount_rub !== null ? `${a.amount_rub.toLocaleString("ru-RU")} ₽` : "—"}
                  </span>{" "}
                  — {a.description}
                </li>
              ))}
            </ul>
          </Row>
        )}
      </dl>
      {nav.is_likely_phishing && nav.phishing_reasons.length > 0 && (
        <div className="mt-4 rounded-md border-l-4 border-[var(--danger)] bg-[var(--danger)]/10 p-3 text-sm">
          <div className="font-semibold text-[var(--danger)]">⚠️ Возможные признаки фишинга</div>
          <ul className="mt-1 list-disc pl-5 text-[var(--danger)]">
            {nav.phishing_reasons.map((r, i) => (
              <li key={i}>{r}</li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

function AnalysisView({ a }: { a: AnalysisOutput }) {
  const facts = a.key_facts.filter((f) => f.label?.trim() || f.value?.trim());
  const aspects = a.important_aspects.filter((s) => s?.trim());
  const verify = a.verify_in_original.filter((s) => s?.trim());
  const pitfalls = a.pitfalls.filter((p) => p.title?.trim() || p.explanation?.trim());
  const steps = a.what_to_do_now.filter((s) => s.step?.trim() || s.detail?.trim());

  return (
    <div className="mt-6 space-y-6">
      {a.mood?.headline && <MoodBanner mood={a.mood} />}

      {a.title && (
        <Block title="📝 Что это за документ">
          <p className="text-base font-medium">{a.title}</p>
          {a.essence && <p className="mt-2 leading-relaxed">{a.essence}</p>}
        </Block>
      )}

      {a.what_sender_wants && (
        <Block title="🎯 Чего хочет отправитель">
          <p className="leading-relaxed">{a.what_sender_wants}</p>
        </Block>
      )}

      {steps.length > 0 && (
        <Block title="👉 Что сделать прямо сейчас" tone="warning">
          <ol className="space-y-3">
            {steps.map((s, i) => (
              <li key={i} className="rounded border border-white/10 bg-white/5 p-3">
                <div className="flex gap-2">
                  <span className="font-semibold text-[var(--muted)]">{i + 1}.</span>
                  <div>
                    {s.step && <div className="font-semibold">{s.step}</div>}
                    {s.detail && <p className="mt-1 text-sm text-[var(--muted)]">{s.detail}</p>}
                  </div>
                </div>
              </li>
            ))}
          </ol>
        </Block>
      )}

      {facts.length > 0 && (
        <Block title="📋 Ключевые факты">
          <dl className="space-y-2 text-sm">
            {facts.map((f, i) => (
              <div key={i} className="grid grid-cols-[180px_1fr] gap-3">
                <dt className="text-[var(--muted)]">{f.label}</dt>
                <dd className="text-[var(--text)]">{f.value}</dd>
              </div>
            ))}
          </dl>
        </Block>
      )}

      {a.critical_deadline &&
        (a.critical_deadline.date_iso ||
          a.critical_deadline.what_to_do ||
          a.critical_deadline.consequence_of_missing) && (
          <Block title="⏰ Срок" tone="danger">
            {a.critical_deadline.date_iso && (
              <p className="text-2xl font-semibold">{a.critical_deadline.date_iso}</p>
            )}
            {a.critical_deadline.what_to_do && (
              <p className="mt-2">{a.critical_deadline.what_to_do}</p>
            )}
            {a.critical_deadline.consequence_of_missing && (
              <p className="mt-2 text-sm text-[var(--danger)]">
                <span className="font-semibold">Если пропустить:</span>{" "}
                {a.critical_deadline.consequence_of_missing}
              </p>
            )}
          </Block>
        )}

      {aspects.length > 0 && (
        <Block title="💡 Что важно">
          <ul className="list-disc space-y-2 pl-5">
            {aspects.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ul>
        </Block>
      )}

      {pitfalls.length > 0 && (
        <Block title="⚠️ Подводные камни" tone="warning">
          <ul className="space-y-3">
            {pitfalls.map((p, i) => (
              <li key={i} className="rounded border border-white/10 bg-white/5 p-3">
                <div className="flex items-center gap-2">
                  <SeverityDot severity={p.severity} />
                  <span className="font-semibold">{p.title}</span>
                </div>
                {p.explanation && (
                  <p className="mt-1 text-sm text-[var(--muted)]">{p.explanation}</p>
                )}
              </li>
            ))}
          </ul>
        </Block>
      )}

      {verify.length > 0 && (
        <Block title="✅ Что сверить в оригинале" tone="warning">
          <ol className="list-decimal space-y-2 pl-6">
            {verify.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ol>
        </Block>
      )}

      {a.case_complexity?.explanation && (
        <Block title="🧭 Насколько это сложный случай">
          <div className="flex items-center gap-2">
            <span
              className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                a.case_complexity.level === "complex"
                  ? "bg-[var(--warn)]/10 text-[var(--warn)]"
                  : "bg-[var(--ok)]/10 text-[var(--ok)]"
              }`}
            >
              {a.case_complexity.level === "complex" ? "Сложный" : "Типовой"}
            </span>
          </div>
          <p className="mt-2 text-sm">{a.case_complexity.explanation}</p>
        </Block>
      )}

      {a.need_lawyer?.required && a.need_lawyer.reasons.length > 0 && (
        <Block title="⚖️ Когда нужен юрист" tone="danger">
          <ul className="list-disc space-y-1 pl-5">
            {a.need_lawyer.reasons.map((r, i) => (
              <li key={i}>{r}</li>
            ))}
          </ul>
        </Block>
      )}
    </div>
  );
}

function MoodBanner({
  mood,
}: {
  mood: { tone: "calm" | "neutral" | "alarm"; headline: string };
}) {
  const map = {
    calm: {
      bg: "border-[var(--ok)] bg-[var(--ok)]/10 text-[var(--ok)]",
      icon: "🟢",
    },
    neutral: {
      bg: "border-[var(--brand)] bg-[var(--brand)]/10 text-[var(--text)]",
      icon: "🔵",
    },
    alarm: {
      bg: "border-[var(--danger)] bg-[var(--danger)]/10 text-[var(--danger)]",
      icon: "🔴",
    },
  } as const;
  const s = map[mood.tone];
  return (
    <div className={`rounded-lg border-l-4 p-4 text-base font-medium ${s.bg}`}>
      <span className="mr-2">{s.icon}</span>
      {mood.headline}
    </div>
  );
}

function SeverityDot({ severity }: { severity: "info" | "warning" | "danger" }) {
  const cls =
    severity === "danger"
      ? "bg-[var(--danger)]"
      : severity === "warning"
        ? "bg-[var(--warn)]"
        : "bg-[var(--brand)]";
  return <span className={`inline-block h-2 w-2 rounded-full ${cls}`} />;
}

function Block({
  title,
  tone,
  children,
}: {
  title: string;
  tone?: "danger" | "warning";
  children: React.ReactNode;
}) {
  const cls =
    tone === "danger"
      ? "border-[var(--danger)]/30 bg-[var(--danger)]/5"
      : tone === "warning"
        ? "border-[var(--warn)]/30 bg-[var(--warn)]/5"
        : "border-white/10 bg-white/5";
  return (
    <section className={`rounded-lg border p-5 ${cls}`}>
      <h2 className="font-semibold">{title}</h2>
      <div className="mt-2 text-[var(--text)]">{children}</div>
    </section>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[140px_1fr] gap-3">
      <dt className="text-[var(--muted)]">{label}</dt>
      <dd className="text-[var(--text)]">{children}</dd>
    </div>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto max-w-2xl px-6 py-16 text-center text-[var(--muted)]">{children}</main>
  );
}

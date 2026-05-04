"use client";

import { useEffect } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { trpc } from "@/lib/trpc";
import { isAuthenticated } from "@/lib/auth-client";
import type { AnalysisOutput, ClassifyOutput } from "@pravoletter/schemas";

const STATUS_LABEL: Record<string, string> = {
  uploaded: "Загружен, ставим в очередь...",
  ocr_processing: "Распознаём текст...",
  classify_processing: "Классифицируем документ...",
  extract_processing: "Извлекаем поля...",
  analyze_processing: "Готовим разбор...",
  ready: "Готов",
  stop_redirect_lawyer: "Этот тип документа требует юриста",
  unsupported: "Тип документа не поддерживается",
  error: "Ошибка обработки",
};

const PROCESSING = new Set([
  "uploaded",
  "ocr_processing",
  "classify_processing",
  "extract_processing",
  "analyze_processing",
]);

export default function DocumentPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const search = useSearchParams();
  const id = params.id;
  const justPaid = search.get("paid") === "1";

  useEffect(() => {
    if (!isAuthenticated()) router.replace("/login");
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

  const createPayment = trpc.payments.create.useMutation({
    onSuccess: (r) => {
      window.location.href = r.confirmationUrl;
    },
  });

  if (doc.isLoading) {
    return <Centered>Загрузка...</Centered>;
  }
  if (doc.error) {
    return <Centered>Ошибка: {doc.error.message}</Centered>;
  }
  const d = doc.data!;

  if (d.status === "stop_redirect_lawyer") {
    return (
      <main className="mx-auto max-w-2xl px-6 py-12">
        <h1 className="text-2xl font-bold">Нужен юрист</h1>
        <p className="mt-3 text-gray-700">
          Этот тип документа (судебный приказ, повестка военкомата, уголовное дело) мы не разбираем
          автоматически — слишком высокая цена ошибки. Обратитесь к профильному юристу.
        </p>
      </main>
    );
  }

  if (d.status === "unsupported") {
    return (
      <main className="mx-auto max-w-2xl px-6 py-12">
        <h1 className="text-2xl font-bold">Не смогли определить</h1>
        <p className="mt-3 text-gray-700">
          Не удалось классифицировать документ. Возможно, плохое качество скана или это не тот тип
          письма, который мы поддерживаем.
        </p>
      </main>
    );
  }

  if (PROCESSING.has(d.status)) {
    return (
      <main className="mx-auto max-w-2xl px-6 py-12">
        <h1 className="text-2xl font-bold">{STATUS_LABEL[d.status]}</h1>
        <p className="mt-3 text-gray-600">
          Обычно это занимает 30–60 секунд. Страница обновится автоматически.
        </p>
        <div className="mt-6 h-2 w-full animate-pulse rounded-full bg-gray-200" />
      </main>
    );
  }

  if (d.status === "error") {
    return <Centered>Не удалось разобрать документ. Попробуйте загрузить заново.</Centered>;
  }

  // status === ready
  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      {justPaid && (
        <div className="mb-6 rounded-md bg-green-50 p-3 text-sm text-green-800">
          Оплата прошла. Полный разбор открыт.
        </div>
      )}

      <h1 className="text-2xl font-bold">Разбор документа</h1>
      <p className="mt-1 text-sm text-gray-500">{d.filename}</p>

      <Disclaimer />

      <ClassifyBlock c={d.classify} />

      {d.paid && d.analysis ? (
        <FullAnalysis a={d.analysis} />
      ) : (
        <Paywall onPay={() => createPayment.mutate({ documentId: id, product: "full_analysis" })} />
      )}
    </main>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return <main className="mx-auto max-w-2xl px-6 py-16 text-center text-gray-700">{children}</main>;
}

function Disclaimer() {
  return (
    <div className="mt-4 rounded-md border bg-yellow-50 p-4 text-xs text-yellow-900">
      ⚠️ Это автоматический разбор с использованием AI. Возможны ошибки распознавания и интерпретации.
      Сервис информационный, не заменяет юриста. При суммах от 100 000 ₽, наличии суда или уголовного
      дела — обязательная консультация с юристом.
    </div>
  );
}

function ClassifyBlock({ c }: { c: ClassifyOutput | null }) {
  if (!c) return null;
  return (
    <section className="mt-6 rounded-lg border p-5">
      <h2 className="font-semibold">📄 Что это за документ</h2>
      <div className="mt-2 text-gray-700">{typeLabel(c.type)}</div>
      <div className="mt-1 text-xs text-gray-500">
        Уверенность модели: {(c.confidence * 100).toFixed(0)}% · {c.reason}
      </div>
    </section>
  );
}

function Paywall({ onPay }: { onPay: () => void }) {
  return (
    <section className="mt-6 rounded-lg border bg-gray-50 p-6">
      <h2 className="text-lg font-semibold">Полный разбор — 590 ₽</h2>
      <ul className="mt-3 space-y-1 text-sm text-gray-700">
        <li>• Все суммы и реквизиты, извлечённые из документа</li>
        <li>• Ключевые сроки и последствия их пропуска</li>
        <li>• Перечень вариантов действий с последствиями</li>
        <li>• Шаблон ответа (если применимо)</li>
        <li>• Проверка на признаки фишинга</li>
        <li>• Напоминание о сроке на email</li>
      </ul>
      <button
        onClick={onPay}
        className="mt-5 rounded-md bg-black px-6 py-3 text-white"
      >
        Оплатить и получить разбор
      </button>
      <p className="mt-2 text-xs text-gray-500">
        Оплата через ЮKassa. Чек уходит автоматически.
      </p>
    </section>
  );
}

function FullAnalysis({ a }: { a: AnalysisOutput }) {
  return (
    <div className="mt-6 space-y-6">
      <Block title="🎯 Суть">
        <p className="text-gray-800">{a.essence_one_line}</p>
      </Block>

      {a.critical_deadline && (
        <Block title="⏰ Срок" tone="danger">
          <p className="text-2xl font-semibold">
            {a.critical_deadline.date_iso ?? "не определён"}
          </p>
          <p className="mt-2 text-gray-700">{a.critical_deadline.what_to_do}</p>
          {a.critical_deadline.consequence_of_missing && (
            <p className="mt-2 text-sm text-red-700">
              Если пропустить: {a.critical_deadline.consequence_of_missing}
            </p>
          )}
        </Block>
      )}

      {a.amounts_breakdown.length > 0 && (
        <Block title="💰 Суммы">
          <ul className="space-y-1 text-gray-800">
            {a.amounts_breakdown.map((m, i) => (
              <li key={i}>
                <span className="font-medium">
                  {m.amount_rub !== null ? `${m.amount_rub.toLocaleString("ru-RU")} ₽` : "—"}
                </span>{" "}
                — {m.description}
              </li>
            ))}
          </ul>
        </Block>
      )}

      <Block title="✅ Варианты действий">
        <ol className="space-y-3">
          {a.action_variants.map((v, i) => (
            <li key={i} className="rounded border p-3">
              <div className="font-semibold">{v.title}</div>
              <p className="mt-1 text-sm text-gray-700">{v.description}</p>
              <p className="mt-2 text-sm text-gray-500">
                <span className="font-medium">Последствия:</span> {v.consequences}
              </p>
            </li>
          ))}
        </ol>
      </Block>

      {a.legal_basis.length > 0 && (
        <Block title="📚 Применимые статьи">
          <ul className="space-y-1 text-sm text-gray-700">
            {a.legal_basis.map((l, i) => (
              <li key={i}>
                {l.code} ст. {l.article} — {l.raw_quote}
              </li>
            ))}
          </ul>
        </Block>
      )}

      <Block title="🚨 Проверка подлинности">
        <p className="text-gray-700">
          {a.authenticity_check.sender_looks_legitimate
            ? "Отправитель выглядит легитимно."
            : "Есть подозрения к отправителю."}
        </p>
        {a.authenticity_check.phishing_signals.length > 0 && (
          <ul className="mt-2 space-y-1 text-sm text-red-700">
            {a.authenticity_check.phishing_signals.map((s, i) => (
              <li key={i}>• {s}</li>
            ))}
          </ul>
        )}
      </Block>

      {a.must_consult_lawyer.required && (
        <Block title="⚖️ Когда обязательно нужен юрист" tone="danger">
          <ul className="space-y-1 text-gray-800">
            {a.must_consult_lawyer.reasons.map((r, i) => (
              <li key={i}>• {r}</li>
            ))}
          </ul>
        </Block>
      )}
    </div>
  );
}

function Block({
  title,
  tone,
  children,
}: {
  title: string;
  tone?: "danger";
  children: React.ReactNode;
}) {
  const cls = tone === "danger" ? "border-red-200 bg-red-50" : "border-gray-200";
  return (
    <section className={`rounded-lg border p-5 ${cls}`}>
      <h2 className="font-semibold">{title}</h2>
      <div className="mt-2">{children}</div>
    </section>
  );
}

function typeLabel(t: string): string {
  const map: Record<string, string> = {
    trebovanie_fns: "Требование ФНС об уплате налога (ст. 69 НК РФ)",
    uvedomlenie_fns: "Налоговое уведомление (ст. 52 НК РФ)",
    trebovanie_poyasneniy: "Требование о представлении пояснений (ст. 88 НК РФ)",
    akt_kameralnoy: "Акт камеральной проверки",
    reshenie_fns: "Решение ФНС",
    drugoy_no_fns: "Документ от ФНС (тип не уточнён)",
    ne_fns: "Документ не от ФНС",
    ne_opredelen: "Тип не определён",
  };
  return map[t] ?? t;
}

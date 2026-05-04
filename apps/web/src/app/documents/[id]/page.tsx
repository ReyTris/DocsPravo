"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { trpc } from "@/lib/trpc";
import { isAuthenticated } from "@/lib/auth-client";
import type {
  AnalysisOutput,
  DocumentDetail,
  NavigatorOutput,
  YellowSummaryOutput,
} from "@pravoletter/schemas";

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

  const utils = trpc.useUtils();
  const createPayment = trpc.payments.create.useMutation({
    onSuccess: (r) => {
      window.location.href = r.confirmationUrl;
    },
  });
  const devMockPay = trpc.payments.devMockPay.useMutation({
    onSuccess: () => {
      utils.documents.getById.invalidate({ id });
    },
  });

  if (doc.isLoading) {
    return <Centered>Загрузка...</Centered>;
  }
  if (doc.error) {
    return <Centered>Ошибка: {doc.error.message}</Centered>;
  }
  const d = doc.data!;

  // Обработка
  if (PROCESSING.has(d.status)) {
    return (
      <main className="mx-auto max-w-2xl px-6 py-12">
        <h1 className="text-2xl font-bold">{STATUS_LABEL[d.status]}</h1>
        <p className="mt-3 text-gray-600">
          Обычно 30–60 секунд. Страница обновится автоматически.
        </p>
        <div className="mt-6 h-2 w-full animate-pulse rounded-full bg-gray-200" />
      </main>
    );
  }

  // RED: судебный приказ / военкомат / уголовка
  if (d.status === "stop_redirect_lawyer") {
    return <RedScreen navigator={d.navigator} />;
  }

  // unsupported (если navigator не справился)
  if (d.status === "unsupported") {
    return (
      <main className="mx-auto max-w-2xl px-6 py-12">
        <h1 className="text-2xl font-bold">Не смогли обработать документ</h1>
        <p className="mt-3 text-gray-700">
          Не удалось распознать структуру документа. Возможно, плохое качество скана или
          непонятный тип. Попробуйте загрузить более чёткое фото или PDF.
        </p>
      </main>
    );
  }

  if (d.status === "error") {
    return <Centered>Не удалось обработать документ. Попробуйте загрузить заново.</Centered>;
  }

  // GREEN или YELLOW
  const onPay = () =>
    createPayment.mutate({
      documentId: id,
      product: d.tier === "yellow" ? "yellow_summary" : "full_analysis",
    });

  return (
    <ResultPage
      doc={d}
      justPaid={justPaid}
      onPay={onPay}
      paying={createPayment.isPending}
      onDevMockPay={() => devMockPay.mutate({ documentId: id })}
      devMockPaying={devMockPay.isPending}
    />
  );
}

// ─────────────── RED ───────────────

function RedScreen({ navigator: nav }: { navigator: NavigatorOutput | null }) {
  return (
    <main className="mx-auto max-w-2xl px-6 py-12">
      <div className="rounded-lg border-l-4 border-red-500 bg-red-50 p-6">
        <h1 className="text-2xl font-bold text-red-900">Этот документ требует юриста</h1>
        <p className="mt-3 text-red-900">
          Это документ из категории, которую мы намеренно не разбираем автоматически:
          судебные акты, повестки военкомата, документы по уголовным делам. Цена ошибки
          AI здесь слишком высока.
        </p>
        <p className="mt-3 text-red-900">
          <strong>Что делать:</strong> обратитесь к профильному юристу. Если у документа
          есть срок (например, 10 дней на возражения по судебному приказу) — действуйте
          быстро.
        </p>
      </div>

      {nav && (
        <section className="mt-8 rounded-lg border p-5">
          <h2 className="font-semibold">Что мы поняли из документа</h2>
          <p className="mt-2 text-sm text-gray-500">
            Это базовый структурированный пересказ для контекста. Не юридический анализ.
          </p>
          <dl className="mt-4 space-y-3 text-sm">
            {nav.sender_text && (
              <Row label="Отправитель">{nav.sender_text}</Row>
            )}
            {nav.document_kind_freeform && (
              <Row label="Тип">{nav.document_kind_freeform}</Row>
            )}
            {nav.short_summary && <Row label="Суть">{nav.short_summary}</Row>}
            {nav.key_dates.length > 0 && (
              <Row label="Сроки">
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
          </dl>
        </section>
      )}
    </main>
  );
}

// ─────────────── GREEN / YELLOW ───────────────

function ResultPage({
  doc: d,
  justPaid,
  onPay,
  paying,
  onDevMockPay,
  devMockPaying,
}: {
  doc: DocumentDetail;
  justPaid: boolean;
  onPay: () => void;
  paying: boolean;
  onDevMockPay: () => void;
  devMockPaying: boolean;
}) {
  const [acknowledged, setAcknowledged] = useState(false);

  // Pre-show disclaimer — обязательное подтверждение перед просмотром
  if (!acknowledged) {
    return (
      <main className="mx-auto max-w-2xl px-6 py-12">
        <div className="rounded-lg border bg-yellow-50 p-6">
          <h1 className="text-xl font-bold">⚠️ Перед тем как открыть разбор</h1>
          <p className="mt-3 text-gray-800">
            Это автоматический разбор с использованием AI. Возможны ошибки распознавания
            и интерпретации.
          </p>
          <p className="mt-3 text-gray-800">
            Сервис предоставляет информацию <strong>общего характера</strong>, основанную
            на машинной обработке текста. Это <strong>не юридическая консультация</strong>.
          </p>
          <p className="mt-3 text-gray-800">
            Перед тем как принимать решения по этому документу, вы обязаны:
          </p>
          <ul className="mt-2 list-disc pl-6 text-gray-800">
            <li>Сверить даты, суммы и реквизиты с оригиналом документа.</li>
            <li>
              При суммах от 100 000 ₽, наличии судебного спора или сложных вопросах —
              обратиться к юристу.
            </li>
            <li>
              Не воспринимать результат как окончательную правовую позицию.
            </li>
          </ul>
          <button
            onClick={() => setAcknowledged(true)}
            className="mt-6 w-full rounded-md bg-black px-6 py-3 text-white hover:bg-gray-800"
          >
            Понимаю и принимаю — открыть разбор
          </button>
        </div>
      </main>
    );
  }

  const tier = d.tier;

  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      {justPaid && (
        <div className="mb-6 rounded-md bg-green-50 p-3 text-sm text-green-800">
          Оплата прошла. Полный разбор открыт.
        </div>
      )}

      <div className="flex items-baseline justify-between">
        <h1 className="text-2xl font-bold">Разбор документа</h1>
        {tier && <TierBadge tier={tier} />}
      </div>
      <p className="mt-1 text-sm text-gray-500">{d.filename}</p>

      <DisclaimerInline />

      {/* Navigator — бесплатно для всех */}
      {d.navigator && <NavigatorBlock nav={d.navigator} />}

      {/* GREEN — полный разбор за 590 ₽ */}
      {tier === "green" && (
        <>
          {d.paid && d.analysis ? (
            <FullAnalysis a={d.analysis} />
          ) : (
            <Paywall
              tier="green"
              price={590}
              onPay={onPay}
              loading={paying}
              onDevMockPay={onDevMockPay}
              devMockPaying={devMockPaying}
            />
          )}
        </>
      )}

      {/* YELLOW — безопасный пересказ за 290 ₽ */}
      {tier === "yellow" && (
        <>
          {d.paid && d.yellow_summary ? (
            <YellowSummaryBlock summary={d.yellow_summary} />
          ) : (
            <Paywall
              tier="yellow"
              price={290}
              onPay={onPay}
              loading={paying}
              onDevMockPay={onDevMockPay}
              devMockPaying={devMockPaying}
            />
          )}
        </>
      )}
    </main>
  );
}

function TierBadge({ tier }: { tier: "green" | "yellow" | "red" }) {
  const map = {
    green: { text: "Полный разбор", cls: "bg-green-100 text-green-800" },
    yellow: { text: "Базовый пересказ", cls: "bg-yellow-100 text-yellow-900" },
    red: { text: "К юристу", cls: "bg-red-100 text-red-800" },
  };
  return (
    <span className={`rounded-full px-3 py-1 text-xs font-medium ${map[tier].cls}`}>
      {map[tier].text}
    </span>
  );
}

function DisclaimerInline() {
  return (
    <div className="mt-4 rounded-md border bg-yellow-50 p-3 text-xs text-yellow-900">
      ⚠️ Информация общего характера на основе AI. Не юр.консультация. Проверяйте оригинал.
    </div>
  );
}

function NavigatorBlock({ nav }: { nav: NavigatorOutput }) {
  return (
    <section className="mt-6 rounded-lg border p-5">
      <h2 className="font-semibold">📄 Что это за документ</h2>
      <dl className="mt-3 space-y-2 text-sm">
        {nav.sender_text && <Row label="Отправитель">{nav.sender_text}</Row>}
        {nav.document_kind_freeform && (
          <Row label="Тип">{nav.document_kind_freeform}</Row>
        )}
        {nav.short_summary && <Row label="Суть">{nav.short_summary}</Row>}
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
        <div className="mt-4 rounded-md border-l-4 border-red-500 bg-red-50 p-3 text-sm">
          <div className="font-semibold text-red-900">⚠️ Возможные признаки фишинга</div>
          <ul className="mt-1 list-disc pl-5 text-red-900">
            {nav.phishing_reasons.map((r, i) => (
              <li key={i}>{r}</li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

function YellowSummaryBlock({ summary: s }: { summary: YellowSummaryOutput }) {
  // Фильтруем пустые элементы — модель иногда возвращает заглушки.
  const facts = s.key_facts.filter((f) => f.label?.trim() || f.value?.trim());
  const verify = s.things_to_verify.filter((t) => t?.trim());
  const fallbackVerify = [
    "Проверить отправителя — соответствует ли реквизит реальной организации.",
    "Сверить даты в документе с указанными выше.",
    "Сверить суммы (если они есть) до копейки.",
    "Проверить, что подписи и печати оригинальные, а не подделанные.",
  ];

  return (
    <div className="mt-6 space-y-6">
      {s.what_this_document_is && (
        <Block title="📝 Что это за документ">
          <p>{s.what_this_document_is}</p>
        </Block>
      )}
      {s.what_sender_wants && (
        <Block title="🎯 Чего хочет отправитель">
          <p>{s.what_sender_wants}</p>
        </Block>
      )}
      {facts.length > 0 && (
        <Block title="📋 Ключевые факты">
          <ul className="space-y-2">
            {facts.map((f, i) => (
              <li key={i} className="border-b pb-2 last:border-0">
                <div className="text-sm text-gray-500">
                  {f.label}{" "}
                  {f.source === "from_document" && (
                    <span className="ml-1 rounded bg-gray-100 px-1.5 py-0.5 text-xs">
                      из документа
                    </span>
                  )}
                </div>
                <div className="mt-1">{f.value}</div>
              </li>
            ))}
          </ul>
        </Block>
      )}
      <Block title="✅ Что вам обязательно проверить вручную" tone="warning">
        <ol className="list-decimal space-y-2 pl-6">
          {(verify.length > 0 ? verify : fallbackVerify).map((t, i) => (
            <li key={i}>{t}</li>
          ))}
        </ol>
      </Block>
      {s.why_lawyer_recommended && (
        <Block title="⚖️ Почему стоит обратиться к юристу" tone="warning">
          <p>{s.why_lawyer_recommended}</p>
        </Block>
      )}
      <div className="rounded-md border bg-gray-50 p-4 text-xs text-gray-700">
        Это базовый пересказ для непрофильного типа документа. Мы НЕ интерпретируем
        право и НЕ даём советов — только структурированно объясняем, что в документе.
        За полным юридическим разбором — к юристу.
      </div>
    </div>
  );
}

function FullAnalysis({ a }: { a: AnalysisOutput }) {
  return (
    <div className="mt-6 space-y-6">
      <Block title="🎯 Суть">
        <p>{a.essence_one_line}</p>
      </Block>

      {a.critical_deadline && (
        <Block title="⏰ Срок" tone="danger">
          <p className="text-2xl font-semibold">
            {a.critical_deadline.date_iso ?? "не определён"}
          </p>
          <p className="mt-2">{a.critical_deadline.what_to_do}</p>
          {a.critical_deadline.consequence_of_missing && (
            <p className="mt-2 text-sm text-red-700">
              Если пропустить: {a.critical_deadline.consequence_of_missing}
            </p>
          )}
        </Block>
      )}

      {a.amounts_breakdown.length > 0 && (
        <Block title="💰 Суммы">
          <ul className="space-y-1">
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
        <p>
          {a.authenticity_check.sender_looks_legitimate
            ? "Отправитель выглядит легитимно."
            : "Есть подозрения к отправителю."}
        </p>
        {a.authenticity_check.phishing_signals.length > 0 && (
          <ul className="mt-2 list-disc pl-5 text-red-700">
            {a.authenticity_check.phishing_signals.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ul>
        )}
      </Block>

      {a.must_consult_lawyer.required && (
        <Block title="⚖️ Когда обязательно нужен юрист" tone="danger">
          <ul className="list-disc space-y-1 pl-5">
            {a.must_consult_lawyer.reasons.map((r, i) => (
              <li key={i}>{r}</li>
            ))}
          </ul>
        </Block>
      )}

      {/* Чек-лист верификации — обязателен для green */}
      <Block title="🔍 Что обязательно проверить в оригинале" tone="warning">
        <ul className="list-disc space-y-1 pl-5">
          <li>Дата срока совпадает с тем, что указано в документе.</li>
          <li>Все суммы совпадают до копейки.</li>
          <li>Реквизиты получателя (ИНН, счёт, УИН) совпадают.</li>
          <li>Номер документа и отправитель совпадают.</li>
          <li>Если есть QR-код — он ведёт на nalog.gov.ru, не на сторонние сайты.</li>
        </ul>
      </Block>
    </div>
  );
}

function Paywall({
  tier,
  price,
  onPay,
  loading,
  onDevMockPay,
  devMockPaying,
}: {
  tier: "green" | "yellow";
  price: number;
  onPay: () => void;
  loading: boolean;
  onDevMockPay: () => void;
  devMockPaying: boolean;
}) {
  const isDev = process.env.NODE_ENV !== "production";
  const isGreen = tier === "green";
  return (
    <section className="mt-6 rounded-lg border bg-gray-50 p-6">
      <h2 className="text-lg font-semibold">
        {isGreen ? "Полный разбор" : "Безопасный пересказ"} — {price} ₽
      </h2>
      <p className="mt-2 text-sm text-gray-600">
        {isGreen
          ? "Этот тип документа мы разбираем по проверенному специализированному промту."
          : "Этот тип документа мы не разбираем специализированно — даём безопасный пересказ без юр.интерпретации."}
      </p>
      <ul className="mt-3 space-y-1 text-sm text-gray-700">
        {isGreen ? (
          <>
            <li>• Все суммы и реквизиты, извлечённые из документа</li>
            <li>• Ключевые сроки и последствия их пропуска</li>
            <li>• Перечень вариантов действий с последствиями</li>
            <li>• Шаблон ответа (если применимо)</li>
            <li>• Проверка на признаки фишинга</li>
            <li>• Напоминание о сроке на email</li>
          </>
        ) : (
          <>
            <li>• Что это за документ простыми словами</li>
            <li>• Чего хочет отправитель</li>
            <li>• Чек-лист, что обязательно проверить вручную</li>
            <li>• Без интерпретации права — только пересказ</li>
          </>
        )}
      </ul>
      <div className="mt-5 flex flex-wrap gap-3">
        <button
          onClick={onPay}
          disabled={loading}
          className="rounded-md bg-black px-6 py-3 text-white disabled:bg-gray-400"
        >
          {loading ? "Создаём платёж..." : "Оплатить"}
        </button>
        {isDev && (
          <button
            onClick={onDevMockPay}
            disabled={devMockPaying}
            className="rounded-md border border-dashed border-gray-400 px-6 py-3 text-sm text-gray-600 hover:bg-gray-100 disabled:opacity-50"
            title="Только в dev: имитировать успешную оплату без ЮKassa"
          >
            {devMockPaying ? "..." : "🧪 Открыть без оплаты (dev)"}
          </button>
        )}
      </div>
      <p className="mt-2 text-xs text-gray-500">Оплата через ЮKassa. Чек уходит автоматически.</p>
    </section>
  );
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
      ? "border-red-200 bg-red-50"
      : tone === "warning"
        ? "border-yellow-200 bg-yellow-50"
        : "border-gray-200";
  return (
    <section className={`rounded-lg border p-5 ${cls}`}>
      <h2 className="font-semibold">{title}</h2>
      <div className="mt-2 text-gray-800">{children}</div>
    </section>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[140px_1fr] gap-3">
      <dt className="text-gray-500">{label}</dt>
      <dd className="text-gray-900">{children}</dd>
    </div>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto max-w-2xl px-6 py-16 text-center text-gray-700">{children}</main>
  );
}

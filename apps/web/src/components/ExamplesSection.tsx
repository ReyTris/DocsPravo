"use client";

import { useState } from "react";

type Severity = "calm" | "neutral" | "urgent" | "danger";

const SEV = {
  calm: {
    dot: "#34d399",
    label: "Спокойно",
    textCls: "text-[var(--ok)]",
    borderCls: "border-l-[var(--ok)]",
    bgCls: "bg-[rgba(52,211,153,0.07)]",
    flagBorderCls: "border-[rgba(52,211,153,0.25)]",
  },
  neutral: {
    dot: "#6c8cff",
    label: "Нейтрально",
    textCls: "text-[#6c8cff]",
    borderCls: "border-l-[#6c8cff]",
    bgCls: "bg-[rgba(108,140,255,0.07)]",
    flagBorderCls: "border-[rgba(108,140,255,0.25)]",
  },
  urgent: {
    dot: "#f59e0b",
    label: "Срочно",
    textCls: "text-[#f59e0b]",
    borderCls: "border-l-[#f59e0b]",
    bgCls: "bg-[rgba(245,158,11,0.07)]",
    flagBorderCls: "border-[rgba(245,158,11,0.3)]",
  },
  danger: {
    dot: "#f87171",
    label: "Осторожно",
    textCls: "text-[var(--danger)]",
    borderCls: "border-l-[var(--danger)]",
    bgCls: "bg-[rgba(248,113,113,0.07)]",
    flagBorderCls: "border-[rgba(248,113,113,0.25)]",
  },
} satisfies Record<Severity, object>;

interface Example {
  id: string;
  tabIcon: string;
  tabLabel: string;
  fileName: string;
  severity: Severity;
  severityText: string;
  whatShort: string;
  sender: string;
  docType: string;
  dates: { label: string; value: string }[];
  amounts?: { label: string; value: string }[];
  flags?: string[];
  summary: string;
  goal: string;
  steps?: string[];
}

const EXAMPLES: Example[] = [
  {
    id: "fns",
    tabIcon: "🏛",
    tabLabel: "ФНС",
    fileName: "nalogovoe_uvedomlenie_2024.pdf",
    severity: "calm",
    severityText: "Спокойно — это обычное уведомление, не штраф и не суд",
    whatShort:
      "Ежегодное уведомление об исчисленных налогах за 2024 год. Налоговая сообщает о начисленных суммах транспортного и земельного налога — стандартный документ, который приходит всем владельцам имущества раз в год. Никаких нарушений, никаких санкций.",
    sender: "ИФНС № 22 по г. Новосибирску",
    docType: "Налоговое уведомление (форма КНД 1165025)",
    dates: [
      { label: "Сформировано", value: "01.04.2025" },
      { label: "Крайний срок оплаты", value: "01.12.2025" },
    ],
    amounts: [
      { label: "Транспортный налог", value: "8 400 ₽" },
      { label: "Земельный налог (дача)", value: "1 250 ₽" },
      { label: "Итого к уплате", value: "9 650 ₽" },
    ],
    summary:
      "Вам начислено 9 650 ₽ за транспортный и земельный налог за 2024 год. До 1 декабря 2025 нужно заплатить — больше ничего не требуется. Никакого суда и никаких приставов.",
    goal: "Уплатить 9 650 ₽ до 1 декабря 2025 через nalog.gov.ru, Госуслуги или банковское приложение.",
    steps: [
      "Зайти на nalog.gov.ru → Личный кабинет → раздел «Налоги» → оплатить онлайн",
      "Проверить реквизиты — получатель должен быть УФК (Управление Федерального казначейства), не физлицо",
      "Сохранить квитанцию об оплате",
    ],
  },
  {
    id: "gibdd",
    tabIcon: "🚗",
    tabLabel: "ГИБДД",
    fileName: "postanovlenie_gibdd_foto.jpg",
    severity: "neutral",
    severityText: "Нейтрально — штраф оплачивается со скидкой 50%",
    whatShort:
      "Постановление о нарушении ПДД, вынесенное в автоматическом режиме камерой фотовидеофиксации. Превышение скорости на 23 км/ч на трассе М-7 в Нижегородской области. Действует скидка 50% при оплате в течение 20 дней с даты постановления.",
    sender: "ЦАФАП ОДД ГИБДД ГУ МВД по Нижегородской области",
    docType: "Постановление по делу об административном правонарушении",
    dates: [
      { label: "Дата нарушения", value: "03.05.2025, 12:47" },
      { label: "Дата постановления", value: "09.05.2025" },
      { label: "Скидка 50% — последний день", value: "29.05.2025" },
      { label: "Крайний срок (полная сумма)", value: "08.08.2025" },
    ],
    amounts: [
      { label: "Полная сумма штрафа", value: "500 ₽" },
      { label: "Со скидкой 50% до 29 мая", value: "250 ₽" },
    ],
    summary:
      "Обычный штраф с камеры — ничего страшного. Заплатите 250 ₽ до 29 мая и забудете об этом. Если пропустите скидку — придётся платить все 500 ₽ до 8 августа.",
    goal: "Оплатить 250 ₽ до 29 мая через Госуслуги или gibdd.ru по номеру постановления.",
    steps: [
      "Открыть Госуслуги → «Штрафы ГИБДД» → найти по номеру постановления → оплатить 250 ₽",
      "Проверить реквизиты: получатель — УФК по региону, не физлицо",
      "Сохранить чек — квитанция подтвердит оплату в случае спора",
    ],
  },
  {
    id: "fssp",
    tabIcon: "📬",
    tabLabel: "ФССП",
    fileName: "postanovlenie_fssp_vzbuzhdenie.pdf",
    severity: "urgent",
    severityText: "Срочно — 5 рабочих дней на добровольную оплату",
    whatShort:
      "Постановление о возбуждении исполнительного производства на основании судебного приказа о взыскании задолженности по кредитному договору. Пристав установил 5-дневный срок добровольного погашения. После истечения срока начислится исполнительский сбор 7% и возможен арест счетов.",
    sender: "ОСП Железнодорожного района г. Ростова-на-Дону",
    docType: "Постановление о возбуждении исполнительного производства",
    dates: [
      { label: "Дата возбуждения", value: "07.05.2025" },
      { label: "Срок добровольного исполнения", value: "12.05.2025 (5 дней)" },
    ],
    amounts: [
      { label: "Основной долг по кредиту", value: "38 500 ₽" },
      {
        label: "Исполнительский сбор 7% (если не платить вовремя)",
        value: "+ 2 695 ₽",
      },
    ],
    summary:
      "У вас 5 рабочих дней на добровольную оплату. После 12 мая пристав вправе арестовать счета, удерживать до 50% зарплаты и запретить выезд за рубеж — плюс добавится сбор 2 695 ₽.",
    goal: "Заплатить 38 500 ₽ до 12 мая по реквизитам ОСП, либо немедленно позвонить приставу и попросить рассрочку.",
    steps: [
      "Найти реквизиты на fssp.gov.ru → ввести номер производства из постановления",
      "Оплатить через банк или Госуслуги, передать копию чека приставу (лично или по email из постановления)",
      "Если нет всей суммы — позвонить в ОСП и попросить рассрочку: это законное право должника",
    ],
  },
  {
    id: "court",
    tabIcon: "⚖️",
    tabLabel: "Судебный приказ",
    fileName: "sudebnyy_prikaz_zhkh.pdf",
    severity: "urgent",
    severityText: "Срочно — 10 дней на отмену без суда и без объяснений",
    whatShort:
      "Судебный приказ мирового судьи о взыскании задолженности по оплате ЖКХ. Выдан по заявлению управляющей компании. Ключевой факт: приказ можно отменить без суда — достаточно подать возражение в течение 10 дней с момента получения. Это законное право по ст. 129 ГПК РФ.",
    sender: "Мировой судья судебного участка № 14 г. Казани",
    docType: "Судебный приказ (ст. 128 ГПК РФ)",
    dates: [
      { label: "Дата вынесения", value: "25.04.2025" },
      { label: "Срок подачи возражения", value: "до 09.05.2025 (10 дней)" },
    ],
    amounts: [
      { label: "Задолженность по ЖКХ", value: "31 200 ₽" },
      { label: "Государственная пошлина", value: "1 080 ₽" },
    ],
    summary:
      "Не паникуйте: судебный приказ — это не приговор. У вас есть 10 дней, чтобы отменить его одним заявлением в суд. Никакого слушания, никаких доказательств — просто написать «возражаю». Если пропустите — приказ уйдёт приставам.",
    goal: "Управляющая компания хочет взыскать 31 200 ₽. Подайте возражение — и они будут вынуждены идти в суд общей юрисдикции, где можно договориться о рассрочке.",
    steps: [
      "Написать возражение в свободной форме: «Возражаю против исполнения судебного приказа № ___ от ___ по делу № ___»",
      "Подать в канцелярию мирового судьи лично или направить почтой с уведомлением — до 9 мая",
      "Получить определение об отмене (судья обязан выдать его в течение 3 дней)",
      "После отмены — разобраться с долгом: запросить расчёт у УК или договориться о рассрочке",
    ],
  },
  {
    id: "phishing",
    tabIcon: "🎣",
    tabLabel: "Фишинг",
    fileName: "schet_ot_banka.eml",
    severity: "danger",
    severityText: "Осторожно — высокая вероятность мошенничества",
    whatShort:
      "Письмо выдаёт себя за уведомление от «Сбербанка» о выставленном счёте. Почтовый сервис поставил метку: «Мы не можем проверить подлинность отправителя». Домен отправителя не совпадает с официальным sberbank.ru. Есть ссылка и вложение.",
    sender: "«Сбербанк» <noreply@sber-online.info>",
    docType: "Счёт на оплату № СБ-2025-04812",
    dates: [{ label: "Дата отправки", value: "сегодня, 14:23" }],
    flags: [
      "Домен отправителя sber-online.info — не является официальным доменом Сбербанка (sberbank.ru). Типичный приём: похожее название с лишними словами.",
      "Почтовый сервис не смог верифицировать DKIM-подпись — письмо не прошло проверку подлинности отправителя.",
      "Ссылка на «скачать счёт» ведёт на сторонний домен, не связанный со Сбербанком.",
      "Давление срочностью: «счёт автоматически заблокируется через 24 часа» — классический признак социальной инженерии.",
    ],
    summary:
      "Настоящий Сбербанк присылает счета через СберБизнес с верифицированного домена sberbank.ru. Не скачивайте вложения и не переходите по ссылкам — там может быть вирус или поддельный сайт для кражи данных карты.",
    goal: "Заставить вас перейти по ссылке или открыть вложение, чтобы украсть данные карты или установить вредоносное ПО.",
    steps: [
      "Не переходить по ссылкам и не открывать вложения из этого письма",
      "Если ждёте счёт от Сбербанка — проверить в официальном приложении или позвонить на горячую линию 900",
      "Пометить письмо как спам и удалить",
    ],
  },
];

export function ExamplesSection() {
  const [active, setActive] = useState(0);
  const ex = EXAMPLES[active]!;
  const sev = SEV[ex.severity];

  return (
    <section id="examples" className="py-20">
      <div className="mx-auto max-w-[1120px] px-6">
        <p className="mb-2 text-[13px] font-bold uppercase tracking-[0.12em] text-[var(--brand)]">
          Примеры разборов
        </p>
        <h2 className="mb-3 text-[clamp(28px,3.5vw,40px)] font-extrabold tracking-[-0.01em]">
          Посмотрите, как это выглядит
        </h2>
        <p className="mb-8 max-w-[600px] text-[17px] text-[var(--muted)]">
          Реальные типы документов — с анонимизированными данными. Выберите
          похожий на ваш.
        </p>

        {/* Tabs */}
        <div className="mb-6 flex gap-2 overflow-x-auto pb-1">
          {EXAMPLES.map((e, i) => (
            <button
              key={e.id}
              onClick={() => setActive(i)}
              className={[
                "flex shrink-0 items-center gap-1.5 rounded-xl border px-4 py-2 text-[14px] font-semibold transition-colors",
                active === i
                  ? "border-[var(--brand)] bg-[rgba(108,140,255,0.12)] text-[var(--brand)]"
                  : "border-[var(--card-border)] bg-[var(--card)] text-[var(--muted)] hover:bg-[var(--surface-hover)]",
              ].join(" ")}
            >
              <span>{e.tabIcon}</span>
              {e.tabLabel}
            </button>
          ))}
        </div>

        {/* Card */}
        <div className="rounded-[20px] border border-[var(--card-border)] bg-[var(--card)] overflow-hidden shadow-[0_24px_60px_-16px_rgba(0,0,0,0.4)]">
          {/* Card header */}
          <div className="flex items-center gap-2.5 border-b border-[var(--card-border)] px-6 py-4">
            <span className="h-2.5 w-2.5 rounded-full bg-[#ff6b6b]" />
            <span className="h-2.5 w-2.5 rounded-full bg-[#fbbf24]" />
            <span className="h-2.5 w-2.5 rounded-full bg-[#34d399]" />
            <span className="ml-2 text-[13px] text-[var(--muted)]">
              {ex.fileName}
            </span>
          </div>

          <div className="p-6 sm:p-8">
            {/* Section: Что это за документ */}
            <div className="mb-6">
              <div className="mb-3 flex items-center gap-2 text-[13px] font-semibold text-[var(--muted)]">
                <span>📄</span>
                <span>Что это за документ</span>
              </div>
              <p className="text-[15px] leading-relaxed text-[var(--text)]">
                {ex.whatShort}
              </p>
            </div>

            {/* Info grid */}
            <div className="mb-6 rounded-xl border border-[var(--card-border)] overflow-hidden">
              {[
                { k: "Отправитель", v: ex.sender },
                { k: "Тип", v: ex.docType },
                ...ex.dates.map((d) => ({ k: d.label, v: d.value })),
                ...(ex.amounts ?? []).map((a) => ({ k: a.label, v: a.value })),
              ].map(({ k, v }, i) => (
                <div
                  key={i}
                  className="grid grid-cols-[140px_1fr] border-b border-[var(--card-border)] px-4 py-2.5 text-[13px] last:border-b-0"
                >
                  <span className="font-medium text-[var(--muted)]">{k}</span>
                  <span className="font-semibold text-[var(--text)]">{v}</span>
                </div>
              ))}
            </div>

            {/* Flags */}
            {ex.flags && ex.flags.length > 0 && (
              <div
                className={`mb-6 rounded-xl border ${sev.flagBorderCls} ${sev.bgCls} px-5 py-4`}
              >
                <div
                  className={`mb-2.5 flex items-center gap-2 text-[13px] font-bold ${sev.textCls}`}
                >
                  <span>⚠</span>
                  <span>Возможные признаки мошенничества</span>
                </div>
                <ul className="space-y-1.5">
                  {ex.flags.map((f, i) => (
                    <li
                      key={i}
                      className="flex gap-2 text-[13px] text-[var(--text)]"
                    >
                      <span className={`mt-0.5 shrink-0 ${sev.textCls}`}>•</span>
                      {f}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Summary bar */}
            <div
              className={`mb-6 flex items-start gap-3 rounded-xl border-l-[3px] pl-4 py-3 pr-4 ${sev.borderCls} ${sev.bgCls}`}
            >
              <span
                className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full`}
                style={{ background: sev.dot }}
              />
              <div>
                <span className={`text-[13px] font-bold ${sev.textCls}`}>
                  {ex.severityText}
                </span>
                <p className="mt-1 text-[15px] font-semibold leading-snug text-[var(--text)]">
                  {ex.summary}
                </p>
              </div>
            </div>

            <div className="grid gap-6 sm:grid-cols-2">
              {/* Goal */}
              <div>
                <div className="mb-2 flex items-center gap-2 text-[13px] font-semibold text-[var(--muted)]">
                  <span>🎯</span>
                  <span>Чего хочет отправитель</span>
                </div>
                <p className="text-[14px] italic leading-relaxed text-[var(--text)]">
                  {ex.goal}
                </p>
              </div>

              {/* Steps */}
              {ex.steps && ex.steps.length > 0 && (
                <div>
                  <div className="mb-2 flex items-center gap-2 text-[13px] font-semibold text-[var(--muted)]">
                    <span>✅</span>
                    <span>Что делать прямо сейчас</span>
                  </div>
                  <ol className="space-y-2">
                    {ex.steps.map((s, i) => (
                      <li
                        key={i}
                        className="flex gap-2.5 text-[13px] text-[var(--text)]"
                      >
                        <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[var(--brand)] to-[var(--brand-2)] text-[10px] font-bold text-white">
                          {i + 1}
                        </span>
                        {s}
                      </li>
                    ))}
                  </ol>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Dots */}
        <div className="mt-5 flex justify-center gap-2">
          {EXAMPLES.map((_, i) => (
            <button
              key={i}
              onClick={() => setActive(i)}
              className={[
                "h-2 rounded-full transition-all",
                active === i
                  ? "w-6 bg-[var(--brand)]"
                  : "w-2 bg-[var(--card-border)] hover:bg-[var(--muted)]",
              ].join(" ")}
              aria-label={`Пример ${i + 1}`}
            />
          ))}
        </div>
      </div>
    </section>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { SITE_NAME, SITE_URL, SITE_DESCRIPTION, SITE_TITLE_DEFAULT, SEO_KEYWORDS } from "@/lib/seo";
import { PricingSection } from "@/components/PricingSection";

export const metadata: Metadata = {
  title: SITE_TITLE_DEFAULT,
  description: SITE_DESCRIPTION,
  keywords: SEO_KEYWORDS,
  alternates: { canonical: SITE_URL + "/" },
  openGraph: {
    type: "website",
    url: SITE_URL + "/",
    siteName: SITE_NAME,
    title: SITE_TITLE_DEFAULT,
    description: SITE_DESCRIPTION,
    locale: "ru_RU",
  },
  twitter: {
    card: "summary_large_image",
    title: SITE_TITLE_DEFAULT,
    description: SITE_DESCRIPTION,
  },
};

export default function HomePage() {
  return (
    <main>
      <HomeJsonLd />
      <HeroSection />
      <ProblemSection />
      <FeaturesSection />
      <HowSection />
      <CasesSection />
      <PricingSection />
      <SafetySection />
      <FaqSection />
      <CtaSection />
    </main>
  );
}

/**
 * JSON-LD главной страницы. Дублирует видимый пользователем контент
 * (FAQ, шаги «как работает», тарифы, перечень документов) в формате,
 * который Яндекс и Google показывают rich-результатами в выдаче.
 *
 * ВАЖНО: текст в графе должен совпадать с тем, что реально на странице,
 * иначе поисковики могут заблокировать rich-сниппеты за «cloaking».
 * Любое изменение FAQ/HowTo секций ниже требует синхронного апдейта здесь.
 */
function HomeJsonLd() {
  const faq = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: [
      {
        q: "Мои персональные данные в безопасности?",
        a: "До отправки в языковую модель ФИО, ИНН, паспорт, СНИЛС и УИН заменяются на анонимные токены вида [ФИО_1], [ИНН_1]. Модель не видит ваших настоящих данных и не запоминает их.",
      },
      {
        q: "Можно ли доверять разбору на 100%?",
        a: "Нет. ИИ — это помощник, а не юрист. Мы специально показываем, что нужно сверить в оригинале (УИН, реквизиты, суммы, даты), и отдельно отмечаем случаи, когда нужен живой специалист.",
      },
      {
        q: "А если документ — подделка или фишинг?",
        a: "Сервис распознаёт типовые признаки: реквизиты на физлицо, странные ссылки, давление срочностью, несоответствие отправителя. Такие документы помечаются красным флагом «danger».",
      },
      {
        q: "Что с фотографиями плохого качества?",
        a: "Если OCR не смог разобрать часть текста, мы честно об этом скажем и не будем выдумывать недостающие цифры. Лучше переснять при дневном свете.",
      },
      {
        q: "Сервис подаст за меня жалобу или оплатит штраф?",
        a: "Нет. Мы только объясняем документ и пошагово показываем, что и где сделать самому. Оплата и подача документов — всегда через официальные каналы (Госуслуги, nalog.gov.ru, личный кабинет суда).",
      },
      {
        q: "Какие документы умеет разбирать ПроДоки?",
        a: "Требования и уведомления ФНС, постановления ФССП, судебные приказы и повестки, штрафы и протоколы ГИБДД, повестки военкомата, претензии банков и коллекторов, уведомления УК и ЖКХ, договоры, справки и любые официальные письма с печатью.",
      },
      {
        q: "Сколько стоит разбор?",
        a: "При регистрации одна страница бесплатно. Дальше — пакеты: 10 страниц за 199 ₽, 30 страниц за 399 ₽. Без подписки, страницы не сгорают.",
      },
    ].map((item) => ({
      "@type": "Question",
      name: item.q,
      acceptedAnswer: { "@type": "Answer", text: item.a },
    })),
  };

  const howTo = {
    "@context": "https://schema.org",
    "@type": "HowTo",
    name: "Как разобрать официальное письмо за 30 секунд",
    description:
      "Пошаговая инструкция: загрузить документ в ПроДоки и получить понятный разбор с действиями и сроками.",
    totalTime: "PT30S",
    estimatedCost: { "@type": "MonetaryAmount", currency: "RUB", value: "0" },
    step: [
      {
        "@type": "HowToStep",
        position: 1,
        name: "Загрузите",
        text: "Загрузите фото с телефона или PDF из почты. Можно сразу пачкой страниц.",
      },
      {
        "@type": "HowToStep",
        position: 2,
        name: "Маскировка",
        text: "ФИО, ИНН и паспортные данные заменяются на токены — данные не утекают в модель.",
      },
      {
        "@type": "HowToStep",
        position: 3,
        name: "Разбор",
        text: "Определяем отправителя, тип документа, суммы, сроки и юридические основания.",
      },
      {
        "@type": "HowToStep",
        position: 4,
        name: "Понятный ответ",
        text: "Получаете суть, шаги, сроки и предупреждения на обычном русском языке.",
      },
    ],
  };

  const webApp = {
    "@context": "https://schema.org",
    "@type": "WebApplication",
    "@id": `${SITE_URL}#webapp`,
    name: SITE_NAME,
    url: SITE_URL,
    description: SITE_DESCRIPTION,
    applicationCategory: "BusinessApplication",
    operatingSystem: "Web",
    inLanguage: "ru-RU",
    isAccessibleForFree: true,
    featureList: [
      "Распознавание PDF и фотографий (OCR)",
      "Маскирование персональных данных перед отправкой в LLM",
      "Классификация документа: ФНС, ФССП, суд, ГИБДД, военкомат, банк, ЖКХ",
      "Извлечение сумм, сроков, реквизитов и УИН",
      "Пошаговый план действий и сроки",
      "Защита от фишинга и поддельных писем",
    ],
    offers: [
      {
        "@type": "Offer",
        name: "Старт",
        description: "1 страница бесплатно при регистрации",
        price: "0",
        priceCurrency: "RUB",
      },
      {
        "@type": "Offer",
        name: "Попробовать",
        description: "3 страницы",
        price: "100",
        priceCurrency: "RUB",
      },
      {
        "@type": "Offer",
        name: "Выгоднее всего",
        description: "10 страниц",
        price: "200",
        priceCurrency: "RUB",
      },
      {
        "@type": "Offer",
        name: "Для пачки писем",
        description: "30 страниц",
        price: "400",
        priceCurrency: "RUB",
      },
    ],
    publisher: { "@id": `${SITE_URL}#organization` },
  };

  const service = {
    "@context": "https://schema.org",
    "@type": "Service",
    serviceType: "Разбор официальных документов с помощью ИИ",
    provider: { "@id": `${SITE_URL}#organization` },
    areaServed: { "@type": "Country", name: "Россия" },
    audience: { "@type": "PeopleAudience", audienceType: "Физические лица и ИП" },
    description: SITE_DESCRIPTION,
    category: [
      "Разбор требований ФНС",
      "Разбор постановлений ФССП",
      "Разбор судебных приказов и повесток",
      "Разбор штрафов ГИБДД",
      "Разбор повесток военкомата",
      "Разбор писем банков и коллекторов",
      "Разбор претензий ЖКХ и УК",
      "Разбор договоров и претензий",
    ],
  };

  const breadcrumbs = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      {
        "@type": "ListItem",
        position: 1,
        name: "Главная",
        item: SITE_URL,
      },
    ],
  };

  const all = [faq, howTo, webApp, service, breadcrumbs];
  return (
    <>
      {all.map((graph, i) => (
        <script
          key={i}
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(graph) }}
        />
      ))}
    </>
  );
}

function HeroSection() {
  return (
    <section className="py-20 pb-16">
      <div className="mx-auto max-w-[1120px] px-6">
        <div className="grid grid-cols-1 items-center gap-14 lg:grid-cols-[1.1fr_1fr]">
          <div>
            <span className="inline-flex items-center gap-2 rounded-full border border-[var(--card-border)] bg-[var(--card)] px-3 py-1.5 text-[13px] font-medium text-[var(--muted)]">
              <span className="h-1.5 w-1.5 rounded-full bg-[var(--ok)]" />
              Без юриста · За 30 секунд · Без паники
            </span>
            <h1 className="mt-4 mb-4 text-[clamp(36px,5vw,56px)] font-extrabold leading-[1.08] tracking-[-0.02em]">
              Письмо от ФНС, ФССП или суда?{" "}
              <span className="hero-accent">Сначала выдохните.</span>
            </h1>
            <p className="mb-7 max-w-[540px] text-lg text-[var(--muted)]">
              Загрузите фото или PDF официального документа — мы переведём канцелярит на человеческий язык,
              подскажем, что делать сегодня, и предупредим о подводных камнях. Без юридических терминов и нагнетания.
            </p>
            <div className="flex flex-wrap gap-3">
              <Link
                href="/upload"
                className="btn-brand inline-flex items-center gap-2 rounded-xl px-5 py-3 text-[15px] font-semibold"
              >
                Разобрать бесплатно →
              </Link>
              <Link
                href="#how"
                className="inline-flex items-center gap-2 rounded-xl border border-[var(--card-border)] px-5 py-3 text-[15px] font-semibold text-[var(--text)] hover:bg-[var(--surface-hover)]"
              >
                Как это работает
              </Link>
            </div>
            <div className="mt-5 flex flex-wrap gap-5 text-[13px] text-[var(--muted)]">
              {["Фото или PDF", "Персональные данные маскируются", "Понятный ответ за полминуты"].map((t) => (
                <span key={t} className="before:mr-1.5 before:font-bold before:text-[var(--ok)] before:content-['✓']">
                  {t}
                </span>
              ))}
            </div>
          </div>

          <div className="rounded-[20px] border border-[var(--card-border)] bg-[var(--card)] p-[22px] shadow-[0_30px_80px_-20px_rgba(0,0,0,0.6)]">
            <div className="mb-4 flex items-center gap-2.5">
              <span className="h-2.5 w-2.5 rounded-full bg-[#ff6b6b]" />
              <span className="h-2.5 w-2.5 rounded-full bg-[#fbbf24]" />
              <span className="h-2.5 w-2.5 rounded-full bg-[#34d399]" />
              <span className="ml-2 text-[13px] text-[var(--muted)]">trebovanie_fns.pdf</span>
            </div>

            <h3 className="mb-4 text-[22px] font-extrabold leading-tight tracking-[-0.01em] text-[var(--text)]">
              Пример разбора
            </h3>

            <div className="mb-2 flex items-center gap-2 text-[13px] font-semibold text-[var(--muted)]">
              <span aria-hidden>📄</span>
              <span>Что это за документ</span>
            </div>
            <p className="mb-3 text-[13px] italic leading-snug text-[var(--muted)]">
              Налоговая прислала требование заплатить транспортный налог и пени за 2024 год — пока без суда и приставов, обычное досудебное письмо.
            </p>
            {[
              ["Отправитель", "ИФНС № 28 по г. Москве"],
              ["Тип", "Требование об уплате налога и пеней"],
              ["Ключевые даты", "15.01.2026 — выставлено\n15.02.2026 — крайний срок оплаты"],
              ["Суммы", "12 500 ₽ — транспортный налог\n225 ₽ — пени"],
            ].map(([k, v]) => (
              <div key={k} className="grid grid-cols-[110px_1fr] gap-x-3 gap-y-1 border-t border-[var(--card-border)] py-2 text-[13px]">
                <b className="font-medium text-[var(--muted)]">{k}</b>
                <span className="whitespace-pre-line italic text-[var(--text)]">{v}</span>
              </div>
            ))}

            <div className="mt-4 flex items-start gap-2.5 border-l-2 border-[var(--ok)] pl-3">
              <span className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full bg-[var(--ok)]" aria-hidden />
              <p className="m-0 text-[15px] font-semibold leading-snug">
                Спокойно — это обычное письмо налоговой, а не суд. Заплати 12 725 ₽ до 15 февраля, и вопрос закрыт.
              </p>
            </div>

            <div className="mt-4 mb-1.5 flex items-center gap-2 text-[13px] font-semibold text-[var(--muted)]">
              <span aria-hidden>🎯</span>
              <span>Чего хочет отправитель</span>
            </div>
            <p className="mb-3 text-[13px] italic leading-snug text-[var(--text)]">
              Уплатить 12 725 ₽ до 15 февраля — налог и набежавшие пени. Больше от тебя ничего не требуют.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

function ProblemSection() {
  const items = [
    { ico: "😰", title: "«Что это вообще такое?»", body: "«Истец», «надлежит», «принудительное взыскание» — половина слов из другого мира." },
    { ico: "⏳", title: "«Сколько у меня времени?»", body: "Срок где-то в третьем абзаце мелким шрифтом. Пропустишь — будет хуже и дороже." },
    { ico: "💸", title: "«Идти к юристу за 5000 ₽?»", body: "В 80% случаев документ типовой и решается за пять минут — но как это понять?" },
  ];
  return (
    <section className="py-20">
      <div className="mx-auto max-w-[1120px] px-6">
        <Eyebrow>Знакомая ситуация?</Eyebrow>
        <h2 className="mb-3 text-[clamp(28px,3.5vw,40px)] font-extrabold tracking-[-0.01em]">Конверт с гербом — и сердце ёкнуло</h2>
        <p className="mb-10 max-w-[680px] text-[17px] text-[var(--muted)]">Официальные письма пишут так, чтобы их было трудно понять. А срок при этом тикает.</p>
        <div className="grid gap-[18px] sm:grid-cols-3">
          {items.map((item) => (
            <div key={item.title} className="rounded-[var(--radius)] border border-[var(--card-border)] bg-[var(--card)] p-[22px]">
              <div className="mb-2.5 text-[28px]">{item.ico}</div>
              <h3 className="mb-2 text-[17px] font-semibold">{item.title}</h3>
              <p className="m-0 text-[14px] text-[var(--muted)]">{item.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function FeaturesSection() {
  const items = [
    { ico: "🧘", title: "Анти-паника в первой строке", body: "Каждый разбор начинается с одной фразы: «спокойно», «нейтрально» или «срочно». Вы сразу понимаете масштаб — без лишних эмоций." },
    { ico: "📅", title: "Главный срок — крупно", body: "Конкретная дата, что именно надо успеть и что будет, если пропустить: пени, суд, ФССП, удержания из зарплаты." },
    { ico: "✅", title: "1–4 шага «прямо сейчас»", body: "Не «можно сделать так или этак», а пошаговый сценарий: какой сайт открыть, в какой раздел зайти, какую кнопку нажать." },
    { ico: "🪤", title: "Подводные камни", body: "Возражение не останавливает срок. Скидка 50% действует 20 дней. Реквизиты должны вести на УФК. То, что в письме умолчали." },
    { ico: "🛡", title: "Защита от мошенников", body: "Заметим признаки фишинга: подмену реквизитов, странные ссылки, давление срочностью. Поднимем красный флаг." },
    { ico: "⚖️", title: "Честный вердикт «нужен ли юрист»", body: "Если документ типовой — так и скажем: справитесь сами. Если суд, крупные суммы или военкомат — порекомендуем специалиста." },
  ];
  return (
    <section id="features" className="py-20">
      <div className="mx-auto max-w-[1120px] px-6">
        <Eyebrow>Что вы получаете</Eyebrow>
        <h2 className="mb-3 text-[clamp(28px,3.5vw,40px)] font-extrabold tracking-[-0.01em]">Не просто перевод — план действий</h2>
        <p className="mb-10 max-w-[680px] text-[17px] text-[var(--muted)]">Каждый разбор — это структурированный ответ, который снимает тревогу и говорит, что делать.</p>
        <div className="grid gap-5 sm:grid-cols-2">
          {items.map((item) => (
            <div key={item.title} className="rounded-[var(--radius)] border border-[var(--card-border)] bg-[var(--card)] p-[26px]">
              <div className="mb-2.5 flex items-center gap-3.5">
                <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-[rgba(108,140,255,0.3)] bg-gradient-to-br from-[rgba(108,140,255,0.2)] to-[rgba(157,108,255,0.2)] text-[22px]">
                  {item.ico}
                </div>
                <h3 className="m-0 text-[18px] font-semibold">{item.title}</h3>
              </div>
              <p className="m-0 text-[15px] text-[var(--muted)]">{item.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function HowSection() {
  const steps = [
    { title: "Загрузите", body: "Фото с телефона или PDF из почты. Можно пачкой страниц." },
    { title: "Маскировка", body: "ФИО, ИНН, паспортные данные заменяются на токены — ваши данные не утекают в модель." },
    { title: "Разбор", body: "Определяем отправителя, тип документа, суммы, сроки и юридические основания." },
    { title: "Понятный ответ", body: "Получаете суть, шаги, сроки и предупреждения. На обычном русском." },
  ];
  return (
    <section id="how" className="py-20">
      <div className="mx-auto max-w-[1120px] px-6">
        <Eyebrow>Как это работает</Eyebrow>
        <h2 className="mb-3 text-[clamp(28px,3.5vw,40px)] font-extrabold tracking-[-0.01em]">4 шага · 30 секунд</h2>
        <p className="mb-10 max-w-[680px] text-[17px] text-[var(--muted)]">
          Под капотом — пайплайн из распознавания (OCR), извлечения полей и анализа ИИ. Снаружи — простая форма.
        </p>
        <div className="grid gap-[18px] sm:grid-cols-2 lg:grid-cols-4">
          {steps.map((step, i) => (
            <div key={step.title} className="relative rounded-[var(--radius)] border border-[var(--card-border)] bg-[var(--card)] p-[22px] pt-8">
              <span className="absolute -top-4 left-[22px] grid h-8 w-8 place-items-center rounded-[10px] bg-gradient-to-br from-[var(--brand)] to-[var(--brand-2)] text-[13px] font-extrabold text-white shadow-[0_6px_18px_-6px_rgba(108,140,255,0.6)]">
                {i + 1}
              </span>
              <h4 className="mb-1.5 mt-2 text-[16px] font-semibold">{step.title}</h4>
              <p className="m-0 text-[14px] text-[var(--muted)]">{step.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function CasesSection() {
  const cases = [
    { ico: "🏛", title: "ФНС", body: "Требования об уплате налога, уведомления о задолженности, акты сверок." },
    { ico: "🚓", title: "ГИБДД и МВД", body: "Постановления о штрафах, протоколы — со скидками и сроками обжалования." },
    { ico: "⚖️", title: "Суды", body: "Судебные приказы, повестки, исковые заявления, апелляционные определения." },
    { ico: "📬", title: "ФССП", body: "Постановления о возбуждении исполнительного производства, аресты счетов." },
    { ico: "🪖", title: "Военкомат", body: "Повестки на медкомиссию, призыв, мобилизационные предписания." },
    { ico: "🏠", title: "ЖКХ и УК", body: "Претензии, перерасчёты, уведомления о задолженности и отключениях." },
    { ico: "📑", title: "Договоры и претензии", body: "Письма от банков, страховых, коллекторов — с разбором условий." },
    { ico: "🏥", title: "Соцслужбы и Госуслуги", body: "Уведомления о пособиях, проверках, справки и отказы." },
    { ico: "📦", title: "Прочее", body: "Любая официальная бумага с печатью — попробуем разобрать." },
  ];
  return (
    <section id="cases" className="py-20">
      <div className="mx-auto max-w-[1120px] px-6">
        <Eyebrow>Какие документы мы понимаем</Eyebrow>
        <h2 className="mb-3 text-[clamp(28px,3.5vw,40px)] font-extrabold tracking-[-0.01em]">Бюрократия в любом виде</h2>
        <p className="mb-10 max-w-[680px] text-[17px] text-[var(--muted)]">Сервис обучен на типовых документах от государственных и коммерческих отправителей.</p>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {cases.map((c) => (
            <div key={c.title} className="rounded-[var(--radius)] border border-[var(--card-border)] bg-[var(--card)] px-5 py-[18px] text-[14px]">
              <b className="mb-1.5 block text-[16px]">{c.ico} {c.title}</b>
              <span className="text-[var(--muted)]">{c.body}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function SafetySection() {
  const warns = [
    { title: "Это не юридическая консультация", body: "Разбор носит информационный характер. По сложным делам (суд, уголовка, спорные суммы > 100 000 ₽, военкомат вне планового призыва) обязательно обратитесь к юристу." },
    { title: "ИИ может ошибаться", body: "Модели иногда неверно распознают цифры или путают похожие документы. Перед оплатой обязательно сверяйте УИН, реквизиты и суммы с оригиналом." },
    { title: "Не платите по ссылкам из писем", body: "Настоящая ФНС никогда не присылает ссылок на оплату. Платите только через nalog.gov.ru или Госуслуги — это защита от мошенников." },
    { title: "Реквизиты — только на УФК", body: "Все государственные платежи идут на счёт Управления Федерального казначейства. Если в реквизитах фигурирует физлицо или ИП — это подделка." },
    { title: "Возражение не «замораживает» срок", body: "Подача жалобы или возражения не останавливает указанную в документе дату. Действуйте параллельно: и оспаривайте, и готовьтесь к исполнению." },
    { title: "Загружайте только свои документы", body: "Сервис маскирует персональные данные, но это не разрешение работать с чужими бумагами. Не загружайте документы других людей без их согласия." },
  ];
  return (
    <section id="safety" className="py-20">
      <div className="mx-auto max-w-[1120px] px-6">
        <div className="rounded-[20px] border border-[rgba(248,113,113,0.25)] bg-gradient-to-b from-[rgba(248,113,113,0.06)] to-[rgba(248,113,113,0.02)] p-9">
          <span className="text-[13px] font-bold uppercase tracking-[0.12em] text-[var(--danger)]">Важно прочитать</span>
          <h2 className="mb-3 mt-2 text-[clamp(28px,3.5vw,40px)] font-extrabold tracking-[-0.01em] text-[var(--text)]">Чего сервис делать НЕ будет</h2>
          <p className="mb-6 max-w-[680px] text-[17px] text-[var(--muted)]">
            Мы честны с вами: ИИ помогает разобраться быстрее, но не заменяет юриста и не несёт ответственность за юридические решения.
          </p>
          <div className="grid gap-3.5 sm:grid-cols-2">
            {warns.map((w) => (
              <div key={w.title} className="rounded-xl border border-[rgba(248,113,113,0.2)] bg-[rgba(248,113,113,0.06)] px-[18px] py-4">
                <h4 className="mb-1.5 flex items-center gap-2 text-[15px] font-semibold text-[var(--text)] before:text-[var(--danger)] before:content-['⚠']">
                  {w.title}
                </h4>
                <p className="m-0 text-[14px] text-[var(--muted)]">{w.body}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function FaqSection() {
  const items = [
    { q: "Мои персональные данные в безопасности?", a: "До отправки в языковую модель ФИО, ИНН, паспорт, СНИЛС и УИН заменяются на анонимные токены вида [ФИО_1], [ИНН_1]. Модель не видит ваших настоящих данных и не запоминает их." },
    { q: "Можно ли доверять разбору на 100%?", a: "Нет. ИИ — это помощник, а не юрист. Мы специально показываем, что нужно сверить в оригинале (УИН, реквизиты, суммы, даты), и отдельно отмечаем случаи, когда нужен живой специалист." },
    { q: "А если документ — подделка или фишинг?", a: "Сервис распознаёт типовые признаки: реквизиты на физлицо, странные ссылки, давление срочностью, несоответствие отправителя. Такие документы помечаются красным флагом «danger»." },
    { q: "Что с фотографиями плохого качества?", a: "Если OCR не смог разобрать часть текста, мы честно об этом скажем и не будем выдумывать недостающие цифры. Лучше переснять при дневном свете." },
    { q: "Сервис подаст за меня жалобу или оплатит штраф?", a: "Нет. Мы только объясняем документ и пошагово показываем, что и где сделать самому. Оплата и подача документов — всегда через официальные каналы (Госуслуги, nalog.gov.ru, личный кабинет суда)." },
  ];
  return (
    <section id="faq" className="py-20">
      <div className="mx-auto max-w-[1120px] px-6">
        <Eyebrow>Вопросы и ответы</Eyebrow>
        <h2 className="mb-8 text-[clamp(28px,3.5vw,40px)] font-extrabold tracking-[-0.01em]">Что обычно спрашивают</h2>
        <div className="space-y-2.5">
          {items.map((item) => (
            <details key={item.q} className="group rounded-xl border border-[var(--card-border)] bg-[var(--card)] px-5 py-4">
              <summary className="flex cursor-pointer list-none items-center justify-between font-semibold">
                {item.q}
                <span className="ml-4 shrink-0 text-xl text-[var(--brand)] transition-transform duration-200 group-open:rotate-45">+</span>
              </summary>
              <p className="mt-3 text-[15px] text-[var(--muted)]">{item.a}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}

function CtaSection() {
  return (
    <section id="cta" className="py-20">
      <div className="mx-auto max-w-[1120px] px-6">
        <div className="rounded-[24px] border border-[var(--card-border)] bg-gradient-to-br from-[rgba(108,140,255,0.15)] to-[rgba(157,108,255,0.15)] px-6 py-16 text-center">
          <h2 className="mb-4 text-[clamp(28px,3.5vw,40px)] font-extrabold tracking-[-0.01em]">Письмо уже лежит на столе?</h2>
          <p className="mx-auto mb-6 max-w-[520px] text-[var(--muted)]">
            Загрузите его сейчас — через 30 секунд узнаете, что это, что делать и сколько у вас есть времени.
          </p>
          <Link
            href="/upload"
            className="btn-brand inline-flex items-center gap-2 rounded-xl px-7 py-3.5 text-[16px] font-semibold"
          >
            Разобрать документ бесплатно →
          </Link>
          <p className="mt-3.5 text-[13px] text-[var(--muted)]">Без регистрации · Данные маскируются · Первый разбор бесплатно</p>
        </div>
      </div>
    </section>
  );
}

function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <p className="mb-2 text-[13px] font-bold uppercase tracking-[0.12em] text-[var(--brand)]">{children}</p>
  );
}

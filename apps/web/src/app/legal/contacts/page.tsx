import Link from "next/link";
import { buildMetadata } from "@/lib/seo";
import { COMPANY, LEGAL_EFFECTIVE_DATE } from "@/lib/legal";

export const metadata = buildMetadata({
  title: "Контакты и реквизиты",
  description:
    "Реквизиты исполнителя сервиса PravoLetter: наименование, ИНН, ОГРН, юридический адрес, контакты для связи.",
  path: "/legal/contacts",
});

export default function ContactsPage() {
  return (
    <>
      <h1>Контакты и реквизиты</h1>
      <p>
        Раскрытие сведений об исполнителе в соответствии со ст. 9, 10 Закона РФ
        от 07.02.1992 № 2300-1 «О защите прав потребителей» и Постановлением
        Правительства РФ от 31.12.2020 № 2463.
      </p>

      <h2>Исполнитель</h2>
      <ul>
        <li>
          <strong>Полное наименование:</strong> {COMPANY.legalName}
        </li>
        <li>
          <strong>Бренд (коммерческое обозначение):</strong> {COMPANY.brand}
        </li>
        <li>
          <strong>ИНН:</strong> {COMPANY.inn}
        </li>
        <li>
          <strong>ОГРН/ОГРНИП:</strong> {COMPANY.ogrn}
        </li>
        <li>
          <strong>Адрес:</strong> {COMPANY.address}
        </li>
      </ul>

      <h2>Связь с нами</h2>
      <ul>
        <li>
          <strong>Электронная почта:</strong>{" "}
          <a href={`mailto:${COMPANY.email}`}>{COMPANY.email}</a>
        </li>
        {COMPANY.phone ? (
          <li>
            <strong>Телефон:</strong>{" "}
            <a href={`tel:${COMPANY.phone.replace(/\s/g, "")}`}>
              {COMPANY.phone}
            </a>
          </li>
        ) : null}
        <li>
          <strong>Режим работы поддержки:</strong> {COMPANY.workingHours}
        </li>
      </ul>

      <h2>Претензии и обращения</h2>
      <p>
        Письменные претензии направляются на адрес электронной почты,
        указанный выше. Срок рассмотрения — не более 10 (десяти) рабочих дней
        с момента получения. Порядок возврата денежных средств и отказа от
        услуги описан в{" "}
        <Link href="/legal/offer">Публичной оферте</Link>.
      </p>

      <h2>Обработка персональных данных</h2>
      <p>
        Порядок обработки персональных данных раскрыт в{" "}
        <Link href="/legal/privacy">Политике обработки персональных данных</Link>
        . Форма согласия на обработку доступна по{" "}
        <Link href="/legal/consent">ссылке</Link>.
      </p>
      {COMPANY.rknOperatorId ? (
        <p>
          Сведения об операторе персональных данных в реестре Роскомнадзора:{" "}
          <strong>№ {COMPANY.rknOperatorId}</strong>.
        </p>
      ) : null}

      <p className="text-[13px] text-[var(--muted)]">
        Дата последнего обновления: {LEGAL_EFFECTIVE_DATE}.
      </p>
    </>
  );
}

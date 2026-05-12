/**
 * Реквизиты исполнителя и метаданные правовых документов.
 *
 * Значения по умолчанию — плейсхолдеры. Перед публичным запуском заполнить
 * фактическими данными ИП/ООО (или подавать через env-переменные платформы).
 *
 * Источник права для требований к раскрытию:
 *  - ст. 9, 10 Закона РФ № 2300-1 «О защите прав потребителей»
 *  - п. 9 Постановления Правительства РФ № 2463 от 31.12.2020
 *  - ч. 2 ст. 18.1 ФЗ-152 «О персональных данных»
 */

export const LEGAL_VERSION = "1.0";
export const LEGAL_EFFECTIVE_DATE = "2026-05-07";

export const COMPANY = {
  // Полное наименование исполнителя.
  legalName:
    process.env.NEXT_PUBLIC_COMPANY_LEGAL_NAME ??
    "Шилеев Георгий Валерьевич",
  // Краткое наименование (как в реквизитах).
  shortName:
    process.env.NEXT_PUBLIC_COMPANY_SHORT_NAME ?? "ИП Шилеев Г.В.",
  // Бренд (отображается пользователю).
  brand: "ПроДоки",
  inn: process.env.NEXT_PUBLIC_COMPANY_INN ?? "732772232618",
  ogrn: process.env.NEXT_PUBLIC_COMPANY_OGRN ?? "[ОГРН/ОГРНИП не указан]",
  address:
    process.env.NEXT_PUBLIC_COMPANY_ADDRESS ??
    "г. Ульяновск",
  email: process.env.NEXT_PUBLIC_COMPANY_EMAIL ?? "support@prodoki.online",
  phone: process.env.NEXT_PUBLIC_COMPANY_PHONE ?? "",
  // Режим работы службы поддержки.
  workingHours:
    process.env.NEXT_PUBLIC_COMPANY_HOURS ??
    "Пн–Пт, 10:00–19:00 (МСК), кроме государственных праздников РФ",
  // Номер в реестре операторов ПД (присваивается РКН после уведомления по ст. 22 ФЗ-152).
  rknOperatorId: process.env.NEXT_PUBLIC_RKN_OPERATOR_ID ?? "",
} as const;

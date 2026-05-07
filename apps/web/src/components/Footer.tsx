import Link from "next/link";
import { COMPANY } from "@/lib/legal";

const LEGAL_LINKS = [
  { href: "/legal/offer", label: "Публичная оферта" },
  { href: "/legal/privacy", label: "Политика конфиденциальности" },
  { href: "/legal/consent", label: "Согласие на обработку ПД" },
  { href: "/legal/contacts", label: "Контакты и реквизиты" },
];

const PRODUCT_LINKS = [
  { href: "/#features", label: "Возможности" },
  { href: "/#how", label: "Как работает" },
  { href: "/#pricing", label: "Тарифы" },
  { href: "/#faq", label: "FAQ" },
];

export function Footer() {
  const year = new Date().getFullYear();

  return (
    <footer className="mt-16 border-t border-[var(--card-border)] bg-[var(--card)]/40">
      <div className="mx-auto max-w-[1120px] px-6 py-10">
        <div className="grid gap-8 md:grid-cols-[1.4fr_1fr_1fr]">
          <div>
            <div className="flex items-center gap-2.5 font-bold text-[16px] text-[var(--text)]">
              <span className="grid h-7 w-7 place-items-center rounded-[8px] bg-gradient-to-br from-[var(--brand)] to-[var(--brand-2)] text-[13px] font-extrabold text-white">
                П
              </span>
              Правописьмо
            </div>
            <p className="mt-3 text-[13px] leading-[1.6] text-[var(--muted)]">
              AI-сервис разбора писем от ФНС, ФССП, ГИБДД, банков, ЖКХ и судов.
              Не является юридической консультацией.
            </p>
            <div className="mt-4 space-y-1 text-[13px] text-[var(--muted)]">
              <div>{COMPANY.legalName}</div>
              <div>
                ИНН: {COMPANY.inn} · ОГРН/ОГРНИП: {COMPANY.ogrn}
              </div>
              <div>{COMPANY.address}</div>
              <div>
                <a
                  href={`mailto:${COMPANY.email}`}
                  className="text-[var(--text)] hover:underline"
                >
                  {COMPANY.email}
                </a>
                {COMPANY.phone ? (
                  <>
                    {" · "}
                    <a
                      href={`tel:${COMPANY.phone.replace(/\s/g, "")}`}
                      className="text-[var(--text)] hover:underline"
                    >
                      {COMPANY.phone}
                    </a>
                  </>
                ) : null}
              </div>
              <div>{COMPANY.workingHours}</div>
              {COMPANY.rknOperatorId ? (
                <div>Реестр операторов ПД РКН: № {COMPANY.rknOperatorId}</div>
              ) : null}
            </div>
          </div>

          <nav aria-label="Продукт">
            <div className="text-[12px] uppercase tracking-wide text-[var(--muted)]">
              Продукт
            </div>
            <ul className="mt-3 space-y-2 text-[14px]">
              {PRODUCT_LINKS.map((l) => (
                <li key={l.href}>
                  <Link
                    href={l.href}
                    className="text-[var(--text)] no-underline hover:underline"
                  >
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          <nav aria-label="Документы">
            <div className="text-[12px] uppercase tracking-wide text-[var(--muted)]">
              Документы
            </div>
            <ul className="mt-3 space-y-2 text-[14px]">
              {LEGAL_LINKS.map((l) => (
                <li key={l.href}>
                  <Link
                    href={l.href}
                    className="text-[var(--text)] no-underline hover:underline"
                  >
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        </div>

        <div className="mt-8 flex flex-col gap-2 border-t border-[var(--card-border)] pt-6 text-[12px] text-[var(--muted)] md:flex-row md:items-center md:justify-between">
          <div>
            © {year} {COMPANY.shortName}. Все права защищены.
          </div>
          <div>18+ · Сервис для пользователей старше 18 лет</div>
        </div>
      </div>
    </footer>
  );
}

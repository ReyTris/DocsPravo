"use client";

import Link from "next/link";
import { useSession } from "@/lib/auth-client";
import { trpc } from "@/lib/trpc";

const paidPlans = [
  {
    pages: 10,
    priceRub: 199,
    perPage: "20 ₽ / страница",
    caption: "Выгоднее всего",
    highlight: true,
  },
  {
    pages: 30,
    priceRub: 399,
    perPage: "≈ 13 ₽ / страница",
    caption: "Для пачки писем",
    highlight: false,
  },
];

function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-[13px] font-bold uppercase tracking-[0.12em] text-[var(--brand)]">
      {children}
    </span>
  );
}

function FreePlanCard({ authed, balance }: { authed: boolean; balance: number | undefined }) {
  let href = "/register";
  let label = "Попробовать бесплатно →";

  if (authed) {
    if (balance !== undefined && balance > 0) {
      href = "/upload";
      label = "Разобрать документ →";
    } else {
      href = "/billing";
      label = "Купить страницы →";
    }
  }

  return (
    <div className="relative flex flex-col rounded-[var(--radius)] border border-[var(--card-border)] bg-[var(--card)] p-[26px]">
      <div className="text-[13px] font-semibold uppercase tracking-[0.12em] text-[var(--muted)]">
        Попробовать
      </div>
      <div className="mt-3 flex items-baseline gap-2">
        <span className="text-[44px] font-extrabold leading-none tracking-[-0.02em]">1</span>
        <span className="text-[15px] text-[var(--muted)]">страница</span>
      </div>
      <div className="mt-4 text-[28px] font-bold">Бесплатно</div>
      <div className="text-[13px] text-[var(--muted)]">при регистрации</div>
      <Link
        href={href}
        className="mt-6 inline-flex items-center justify-center rounded-xl border border-[var(--card-border)] px-5 py-3 text-[14px] font-semibold text-[var(--text)] transition-colors hover:bg-[var(--surface-hover)]"
      >
        {label}
      </Link>
    </div>
  );
}

export function PricingSection() {
  const authed = useSession() === "authenticated";

  const { data: balanceData } = trpc.pages.balance.useQuery(undefined, {
    enabled: authed,
    staleTime: 30_000,
  });

  const hasBalance = authed && balanceData !== undefined && balanceData.balance > 0;

  const paidHref = hasBalance ? "/upload" : authed ? "/billing" : "/register";
  const paidLabel = hasBalance ? "Разобрать документ →" : authed ? "Купить страницы →" : "Начать бесплатно →";

  return (
    <section id="pricing" className="py-20">
      <div className="mx-auto max-w-[1120px] px-6">
        <Eyebrow>Тарифы</Eyebrow>
        <p className="mt-2 max-w-[680px] text-[15px] text-[var(--muted)]">
          При регистрации мы дарим{" "}
          <span className="font-semibold text-[var(--text)]">1 страницу бесплатно</span> —
          этого хватит, чтобы разобрать одно письмо и понять, насколько сервис вам подходит. Без
          карты и подписки.
        </p>
        <div className="mt-6 grid gap-5 sm:grid-cols-3">
          <FreePlanCard authed={authed} balance={balanceData?.balance} />
          {paidPlans.map((p) => (
            <div
              key={p.pages}
              className={
                "relative flex flex-col rounded-[var(--radius)] p-[26px] " +
                (p.highlight
                  ? "border border-[rgba(108,140,255,0.5)] bg-gradient-to-br from-[rgba(108,140,255,0.12)] to-[rgba(157,108,255,0.12)] shadow-[0_20px_60px_-20px_rgba(108,140,255,0.45)]"
                  : "border border-[var(--card-border)] bg-[var(--card)]")
              }
            >
              {p.highlight && (
                <span className="absolute -top-3 left-[26px] rounded-full bg-gradient-to-br from-[var(--brand)] to-[var(--brand-2)] px-3 py-1 text-[11px] font-bold uppercase tracking-[0.1em] text-white">
                  Хит
                </span>
              )}
              <div className="text-[13px] font-semibold uppercase tracking-[0.12em] text-[var(--muted)]">
                {p.caption}
              </div>
              <div className="mt-3 flex items-baseline gap-2">
                <span className="text-[44px] font-extrabold leading-none tracking-[-0.02em]">
                  {p.pages}
                </span>
                <span className="text-[15px] text-[var(--muted)]">
                  {p.pages < 5 ? "страницы" : "страниц"}
                </span>
              </div>
              <div className="mt-4 text-[28px] font-bold">{p.priceRub} ₽</div>
              <div className="text-[13px] text-[var(--muted)]">{p.perPage}</div>
              <Link
                href={paidHref}
                className={
                  "mt-6 inline-flex items-center justify-center rounded-xl px-5 py-3 text-[14px] font-semibold " +
                  (p.highlight
                    ? "btn-brand"
                    : "border border-[var(--card-border)] text-[var(--text)] transition-colors hover:bg-[var(--surface-hover)]")
                }
              >
                {paidLabel}
              </Link>
            </div>
          ))}
        </div>
        <p className="mt-6 text-[13px] text-[var(--muted)]">Не сгорают · Без подписки</p>
      </div>
    </section>
  );
}

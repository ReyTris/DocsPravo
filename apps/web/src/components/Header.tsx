"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { clearTokens, hasSession } from "@/lib/auth-client";
import { ThemeToggle } from "@/components/ThemeToggle";
import { trpc } from "@/lib/trpc";

function pagesPlural(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return "страница";
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return "страницы";
  return "страниц";
}

function ProfileMenu({ onLogout }: { onLogout: () => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const balanceQuery = trpc.pages.balance.useQuery(undefined, {
    refetchOnWindowFocus: true,
    staleTime: 30_000,
  });
  const balance = balanceQuery.data?.balance ?? 0;

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Профиль"
        aria-haspopup="menu"
        aria-expanded={open}
        className="grid h-9 w-9 place-items-center rounded-full border border-[var(--card-border)] bg-[var(--card)] text-[var(--text)] transition-colors hover:bg-[var(--surface-hover)]"
      >
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <circle cx="12" cy="8" r="4" />
          <path d="M4 21c0-4.418 3.582-8 8-8s8 3.582 8 8" />
        </svg>
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 mt-2 w-60 overflow-hidden rounded-xl border border-[var(--card-border)] bg-[var(--card)] shadow-lg"
        >
          <div className="border-b border-[var(--card-border)] px-4 py-3">
            <div className="text-[12px] uppercase tracking-wide text-[var(--muted)]">
              Остаток квоты
            </div>
            <div className="mt-1 text-[14px] text-[var(--text)]">
              {balanceQuery.isLoading ? (
                "…"
              ) : (
                <>
                  <span className="font-semibold">{balance}</span>{" "}
                  {pagesPlural(balance)}
                </>
              )}
            </div>
          </div>

          <Link
            href="/documents"
            role="menuitem"
            onClick={() => setOpen(false)}
            className="block px-4 py-2.5 text-[14px] text-[var(--text)] no-underline transition-colors hover:bg-[var(--surface-hover)]"
          >
            Мои документы
          </Link>
          <Link
            href="/billing"
            role="menuitem"
            onClick={() => setOpen(false)}
            className="block px-4 py-2.5 text-[14px] text-[var(--text)] no-underline transition-colors hover:bg-[var(--surface-hover)]"
          >
            Купить страницы
          </Link>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              onLogout();
            }}
            className="block w-full border-t border-[var(--card-border)] px-4 py-2.5 text-left text-[14px] text-[var(--text)] transition-colors hover:bg-[var(--surface-hover)]"
          >
            Выйти
          </button>
        </div>
      )}
    </div>
  );
}

export function Header() {
  const [authed, setAuthed] = useState(false);

  useEffect(() => {
    const sync = () => setAuthed(hasSession());
    sync();
    window.addEventListener("auth-changed", sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener("auth-changed", sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  const handleLogout = () => {
    clearTokens();
    window.location.href = "/";
  };

  return (
    <header className="sticky top-0 z-10 border-b border-[var(--card-border)] bg-[var(--header-bg)] backdrop-blur-md">
      <div className="mx-auto flex max-w-[1120px] items-center justify-between px-6 py-3.5">
        <Link href="/" className="flex items-center gap-2.5 font-bold text-[18px] text-[var(--text)] no-underline">
          <span className="grid h-8 w-8 place-items-center rounded-[9px] bg-gradient-to-br from-[var(--brand)] to-[var(--brand-2)] text-[15px] font-extrabold text-white">
            П
          </span>
          Правописьмо
        </Link>

        <nav className="hidden items-center gap-5 text-[14px] text-[var(--muted)] md:flex">
          <Link href="/#features" className="hover:text-[var(--text)] transition-colors">Возможности</Link>
          <Link href="/#how" className="hover:text-[var(--text)] transition-colors">Как работает</Link>
          <Link href="/#cases" className="hover:text-[var(--text)] transition-colors">Документы</Link>
          <Link href="/#pricing" className="hover:text-[var(--text)] transition-colors">Тарифы</Link>
          <Link href="/#faq" className="hover:text-[var(--text)] transition-colors">FAQ</Link>
        </nav>

        <div className="flex items-center gap-3">
          <ThemeToggle />
          <Link
            href="/upload"
            className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-br from-[var(--brand)] to-[var(--brand-2)] px-4 py-2 text-[14px] font-semibold text-white transition-transform hover:-translate-y-px"
          >
            Разобрать документ
          </Link>
          {authed ? (
            <ProfileMenu onLogout={handleLogout} />
          ) : (
            <Link
              href="/login"
              className="inline-flex items-center rounded-xl border border-[var(--card-border)] bg-[var(--card)] px-4 py-2 text-[14px] font-semibold text-[var(--text)] no-underline transition-colors hover:bg-[var(--surface-hover)]"
            >
              Войти
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}

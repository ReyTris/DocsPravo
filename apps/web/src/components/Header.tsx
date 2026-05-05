"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { clearTokens, isAuthenticated } from "@/lib/auth-client";

export function Header() {
  const [authed, setAuthed] = useState(false);

  useEffect(() => {
    const sync = () => setAuthed(isAuthenticated());
    sync();
    window.addEventListener("auth-changed", sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener("auth-changed", sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  return (
    <header className="sticky top-0 z-10 border-b border-[var(--card-border)] bg-[rgba(11,16,32,0.6)] backdrop-blur-md">
      <div className="mx-auto flex max-w-[1120px] items-center justify-between px-6 py-3.5">
        <Link href="/" className="flex items-center gap-2.5 font-bold text-[18px] text-[var(--text)] no-underline">
          <span className="grid h-8 w-8 place-items-center rounded-[9px] bg-gradient-to-br from-[var(--brand)] to-[var(--brand-2)] text-[15px] font-extrabold text-white">
            П
          </span>
          Правописьмо
        </Link>

        <nav className="hidden items-center gap-5 text-[14px] text-[var(--muted)] md:flex">
          <Link href="#features" className="hover:text-[var(--text)] transition-colors">Возможности</Link>
          <Link href="#how" className="hover:text-[var(--text)] transition-colors">Как работает</Link>
          <Link href="#cases" className="hover:text-[var(--text)] transition-colors">Документы</Link>
          <Link href="#safety" className="hover:text-[var(--text)] transition-colors">Безопасность</Link>
          <Link href="#faq" className="hover:text-[var(--text)] transition-colors">FAQ</Link>
        </nav>

        <div className="flex items-center gap-3">
          {authed ? (
            <>
              <Link href="/documents" className="text-[14px] text-[var(--muted)] hover:text-[var(--text)] transition-colors">
                Мои документы
              </Link>
              <button
                onClick={() => { clearTokens(); window.location.href = "/"; }}
                className="text-[14px] text-[var(--muted)] hover:text-[var(--text)] transition-colors"
              >
                Выйти
              </button>
            </>
          ) : (
            <Link href="/login" className="text-[14px] text-[var(--muted)] hover:text-[var(--text)] transition-colors">
              Войти
            </Link>
          )}
          <Link
            href="/upload"
            className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-br from-[var(--brand)] to-[var(--brand-2)] px-4 py-2 text-[14px] font-semibold text-white transition-transform hover:-translate-y-px"
          >
            Разобрать документ
          </Link>
        </div>
      </div>
    </header>
  );
}

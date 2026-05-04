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
    <header className="border-b">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
        <Link href="/" className="text-lg font-semibold">
          PravoLetter
        </Link>
        <nav className="flex items-center gap-4 text-sm">
          {authed ? (
            <>
              <Link href="/documents" className="hover:underline">
                Мои документы
              </Link>
              <Link href="/upload" className="hover:underline">
                Загрузить
              </Link>
              <button
                onClick={() => {
                  clearTokens();
                  window.location.href = "/";
                }}
                className="text-gray-600 hover:text-gray-900"
              >
                Выйти
              </button>
            </>
          ) : (
            <>
              <Link href="/login" className="hover:underline">
                Войти
              </Link>
              <Link
                href="/register"
                className="rounded-md bg-black px-3 py-1.5 text-white"
              >
                Регистрация
              </Link>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}

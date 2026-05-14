"use client";

import { Suspense, useState, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { trpc } from "@/lib/trpc";
import { setAccess } from "@/lib/auth-client";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const justReset = searchParams.get("reset") === "1";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const login = trpc.auth.login.useMutation({
    onSuccess: (data) => {
      setAccess(data);
      router.push("/documents");
    },
  });

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (login.isPending) return;
    login.mutate({ email: email.trim(), password });
  }

  return (
    <>
      {justReset && (
        <div className="mt-6 rounded-md bg-green-50 p-3 text-sm text-green-800">
          Пароль обновлён. Войдите с новым паролем.
        </div>
      )}
      <form onSubmit={onSubmit} className="mt-6 space-y-4" noValidate>
        <div>
          <label htmlFor="email" className="block text-sm font-medium">
            Email
          </label>
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            inputMode="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={login.isPending}
            className="mt-1 w-full rounded-md border px-3 py-2"
          />
        </div>
        <div>
          <div className="flex items-center justify-between">
            <label htmlFor="password" className="block text-sm font-medium">
              Пароль
            </label>
            <Link href="/forgot-password" className="text-sm underline text-[var(--muted)]">
              Забыли пароль?
            </Link>
          </div>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={login.isPending}
            className="mt-1 w-full rounded-md border px-3 py-2"
          />
        </div>
        {login.error && (
          <div role="alert" aria-live="polite" className="rounded-md bg-red-50 p-3 text-sm text-red-700">
            {login.error.message}
          </div>
        )}
        <button
          type="submit"
          disabled={login.isPending}
          className="w-full rounded-md bg-black px-4 py-2 text-white disabled:bg-gray-400"
        >
          {login.isPending ? "Входим..." : "Войти"}
        </button>
      </form>
      <p className="mt-4 text-sm text-[var(--muted)]">
        Нет аккаунта?{" "}
        <Link href="/register" className="underline">
          Регистрация
        </Link>
      </p>
    </>
  );
}

export default function LoginPage() {
  return (
    <main className="mx-auto max-w-md px-6 py-16">
      <h1 className="text-2xl font-bold">Вход</h1>
      <Suspense fallback={<div className="mt-6 text-sm text-[var(--muted)]">Загрузка...</div>}>
        <LoginForm />
      </Suspense>
    </main>
  );
}

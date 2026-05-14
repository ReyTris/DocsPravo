"use client";

import { Suspense, useState, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { trpc } from "@/lib/trpc";

function ResetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token") ?? "";
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [clientError, setClientError] = useState<string | null>(null);
  const reset = trpc.auth.resetPassword.useMutation({
    onSuccess: () => {
      router.push("/login?reset=1");
    },
  });

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    setClientError(null);
    if (!token) {
      setClientError("Ссылка некорректна. Запросите восстановление ещё раз.");
      return;
    }
    if (password.length < 8) {
      setClientError("Пароль должен быть не короче 8 символов.");
      return;
    }
    if (password !== passwordConfirm) {
      setClientError("Пароли не совпадают.");
      return;
    }
    if (reset.isPending) return;
    reset.mutate({ token, password });
  }

  const errorMessage = clientError ?? reset.error?.message ?? null;

  if (!token) {
    return (
      <div className="mt-6 rounded-md bg-red-50 p-4 text-sm text-red-700">
        В ссылке нет токена. Запросите восстановление пароля{" "}
        <Link href="/forgot-password" className="underline">
          ещё раз
        </Link>
        .
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="mt-6 space-y-4" noValidate>
      <div>
        <label htmlFor="password" className="block text-sm font-medium">
          Новый пароль (от 8 символов)
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          disabled={reset.isPending}
          className="mt-1 w-full rounded-md border px-3 py-2"
        />
      </div>
      <div>
        <label htmlFor="passwordConfirm" className="block text-sm font-medium">
          Повторите пароль
        </label>
        <input
          id="passwordConfirm"
          name="passwordConfirm"
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
          value={passwordConfirm}
          onChange={(e) => setPasswordConfirm(e.target.value)}
          disabled={reset.isPending}
          className="mt-1 w-full rounded-md border px-3 py-2"
        />
      </div>
      {errorMessage && (
        <div role="alert" aria-live="polite" className="rounded-md bg-red-50 p-3 text-sm text-red-700">
          {errorMessage}
        </div>
      )}
      <button
        type="submit"
        disabled={reset.isPending}
        className="w-full rounded-md bg-black px-4 py-2 text-white disabled:bg-gray-400"
      >
        {reset.isPending ? "Сохраняем..." : "Сохранить новый пароль"}
      </button>
    </form>
  );
}

export default function ResetPasswordPage() {
  return (
    <main className="mx-auto max-w-md px-6 py-16">
      <h1 className="text-2xl font-bold">Новый пароль</h1>
      <Suspense fallback={<div className="mt-6 text-sm text-[var(--muted)]">Загрузка...</div>}>
        <ResetPasswordForm />
      </Suspense>
      <p className="mt-4 text-sm text-[var(--muted)]">
        <Link href="/login" className="underline">
          Вернуться ко входу
        </Link>
      </p>
    </main>
  );
}

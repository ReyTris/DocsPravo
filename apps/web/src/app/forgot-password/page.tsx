"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { trpc } from "@/lib/trpc";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const forgot = trpc.auth.forgotPassword.useMutation();

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (forgot.isPending) return;
    forgot.mutate({ email: email.trim() });
  }

  return (
    <main className="mx-auto max-w-md px-6 py-16">
      <h1 className="text-2xl font-bold">Восстановление пароля</h1>
      {forgot.isSuccess ? (
        <div className="mt-6 rounded-md bg-green-50 p-4 text-sm text-green-800">
          Если такой email зарегистрирован, мы отправили на него письмо со
          ссылкой для смены пароля. Проверьте папку «Спам», если письма нет в
          течение 5 минут.
        </div>
      ) : (
        <form onSubmit={onSubmit} className="mt-6 space-y-4" noValidate>
          <p className="text-sm text-[var(--muted)]">
            Укажите email, на который зарегистрирован аккаунт. Мы пришлём
            ссылку для установки нового пароля — она действует 1 час.
          </p>
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
              disabled={forgot.isPending}
              className="mt-1 w-full rounded-md border px-3 py-2"
            />
          </div>
          {forgot.error && (
            <div role="alert" aria-live="polite" className="rounded-md bg-red-50 p-3 text-sm text-red-700">
              {forgot.error.message}
            </div>
          )}
          <button
            type="submit"
            disabled={forgot.isPending}
            className="w-full rounded-md bg-black px-4 py-2 text-white disabled:bg-gray-400"
          >
            {forgot.isPending ? "Отправляем..." : "Отправить ссылку"}
          </button>
        </form>
      )}
      <p className="mt-4 text-sm text-[var(--muted)]">
        <Link href="/login" className="underline">
          Вернуться ко входу
        </Link>
      </p>
    </main>
  );
}

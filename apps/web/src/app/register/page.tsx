"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { trpc } from "@/lib/trpc";
import { saveTokens } from "@/lib/auth-client";

export default function RegisterPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [agree, setAgree] = useState(false);
  const [clientError, setClientError] = useState<string | null>(null);
  const register = trpc.auth.register.useMutation({
    onSuccess: (data) => {
      saveTokens(data);
      router.push("/upload");
    },
  });

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    setClientError(null);
    if (!agree) {
      setClientError("Необходимо согласие с офертой и обработкой ПД.");
      return;
    }
    if (password.length < 8) {
      setClientError("Пароль должен быть не короче 8 символов.");
      return;
    }
    if (register.isPending) return;
    register.mutate({ email: email.trim(), password });
  }

  const errorMessage = clientError ?? register.error?.message ?? null;

  return (
    <main className="mx-auto max-w-md px-6 py-16">
      <h1 className="text-2xl font-bold">Регистрация</h1>
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
            disabled={register.isPending}
            className="mt-1 w-full rounded-md border px-3 py-2"
          />
        </div>
        <div>
          <label htmlFor="password" className="block text-sm font-medium">
            Пароль (от 8 символов)
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
            disabled={register.isPending}
            className="mt-1 w-full rounded-md border px-3 py-2"
          />
        </div>
        <label className="flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            checked={agree}
            onChange={(e) => setAgree(e.target.checked)}
            className="mt-1"
          />
          <span>
            Я согласен с{" "}
            <Link href="/legal/offer" className="underline">
              офертой
            </Link>{" "}
            и{" "}
            <Link href="/legal/privacy" className="underline">
              обработкой персональных данных
            </Link>
            . Понимаю, что сервис не заменяет юридическую консультацию.
          </span>
        </label>
        {errorMessage && (
          <div role="alert" aria-live="polite" className="rounded-md bg-red-50 p-3 text-sm text-red-700">
            {errorMessage}
          </div>
        )}
        <button
          type="submit"
          disabled={!agree || register.isPending}
          className="w-full rounded-md bg-black px-4 py-2 text-white disabled:bg-gray-400"
        >
          {register.isPending ? "Создаём..." : "Зарегистрироваться"}
        </button>
      </form>
      <p className="mt-4 text-sm text-[var(--muted)]">
        Уже есть аккаунт?{" "}
        <Link href="/login" className="underline">
          Войти
        </Link>
      </p>
    </main>
  );
}

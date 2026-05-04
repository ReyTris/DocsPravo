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
  const register = trpc.auth.register.useMutation({
    onSuccess: (data) => {
      saveTokens(data);
      router.push("/upload");
    },
  });

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!agree) return;
    register.mutate({ email, password });
  }

  return (
    <main className="mx-auto max-w-md px-6 py-16">
      <h1 className="text-2xl font-bold">Регистрация</h1>
      <form onSubmit={onSubmit} className="mt-6 space-y-4">
        <div>
          <label className="block text-sm font-medium">Email</label>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="mt-1 w-full rounded-md border px-3 py-2"
          />
        </div>
        <div>
          <label className="block text-sm font-medium">Пароль (от 8 символов)</label>
          <input
            type="password"
            required
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
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
        {register.error && (
          <div className="rounded-md bg-red-50 p-3 text-sm text-red-700">
            {register.error.message}
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
      <p className="mt-4 text-sm text-gray-600">
        Уже есть аккаунт?{" "}
        <Link href="/login" className="underline">
          Войти
        </Link>
      </p>
    </main>
  );
}

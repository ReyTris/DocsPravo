"use client";

import { useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { getValidAccessToken, useSession } from "@/lib/auth-client";

const NAV = [
  { href: "/admin", label: "Дашборд", exact: true },
  { href: "/admin/users", label: "Пользователи" },
  { href: "/admin/payments", label: "Платежи" },
  { href: "/admin/documents", label: "Документы" },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const sessionStatus = useSession();

  useEffect(() => {
    if (sessionStatus === "unauthenticated") {
      router.replace("/login");
      return;
    }
    if (sessionStatus !== "authenticated") return;
    // role хранится в access-токене — забираем уже валидный, не парсим
    // потенциально протухший. Если рефреш не удался, getValidAccessToken
    // сам выставит unauthenticated, и эффект отработает заново.
    let cancelled = false;
    (async () => {
      const token = await getValidAccessToken();
      if (cancelled) return;
      if (!token) {
        router.replace("/login");
        return;
      }
      try {
        const payload = JSON.parse(atob(token.split(".")[1]!));
        if (payload.role !== "admin") router.replace("/");
      } catch {
        router.replace("/login");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [router, sessionStatus]);

  return (
    <div className="flex min-h-screen bg-[var(--bg)]">
      {/* Sidebar */}
      <aside className="w-56 shrink-0 border-r border-[var(--card-border)] bg-[var(--card)] px-4 py-6">
        <p className="mb-6 text-xs font-bold uppercase tracking-widest text-[var(--muted)]">
          ПроДоки Admin
        </p>
        <nav className="space-y-1">
          {NAV.map(({ href, label, exact }) => {
            const active = exact ? pathname === href : pathname.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                className={`block rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                  active
                    ? "bg-[rgba(108,140,255,0.15)] text-[var(--brand)]"
                    : "text-[var(--text-2)] hover:bg-[var(--bg-2)] hover:text-[var(--text)]"
                }`}
              >
                {label}
              </Link>
            );
          })}
        </nav>
        <div className="mt-8 border-t border-[var(--card-border)] pt-4">
          <Link
            href="/"
            className="block text-xs text-[var(--muted)] hover:text-[var(--text)]"
          >
            ← На сайт
          </Link>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 overflow-auto p-8">{children}</main>
    </div>
  );
}

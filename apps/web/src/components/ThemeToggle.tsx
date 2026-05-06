"use client";

import { useEffect, useState } from "react";

type Theme = "light" | "dark";

function readTheme(): Theme {
  if (typeof document === "undefined") return "light";
  const attr = document.documentElement.getAttribute("data-theme");
  return attr === "dark" ? "dark" : "light";
}

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>("light");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setTheme(readTheme());
    setMounted(true);
  }, []);

  const toggle = () => {
    const next: Theme = theme === "dark" ? "light" : "dark";
    setTheme(next);
    document.documentElement.setAttribute("data-theme", next);
    try {
      localStorage.setItem("theme", next);
    } catch {}
  };

  const isDark = theme === "dark";
  const label = isDark ? "Светлая тема" : "Тёмная тема";

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={label}
      title={label}
      className="grid h-9 w-9 place-items-center rounded-lg border border-[var(--card-border)] bg-[var(--card)] text-[var(--text)] transition-colors hover:bg-[var(--surface-hover)]"
    >
      <span aria-hidden className="text-[16px] leading-none">
        {mounted ? (isDark ? "☀" : "☾") : "☾"}
      </span>
    </button>
  );
}

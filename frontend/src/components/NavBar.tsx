"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Music, Home, Mic, Wrench } from "lucide-react";
import clsx from "clsx";

const links = [
  { href: "/", label: "首页", icon: Home },
  { href: "/practice", label: "练习与分析", icon: Mic },
  { href: "/tools", label: "练习工具", icon: Wrench },
];

export default function NavBar() {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-50 bg-white border-b border-[var(--border)]">
      <div className="section-wrap flex items-center justify-between h-16">
        <Link href="/" className="flex items-center gap-2.5 font-bold text-lg text-foreground">
          <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center">
            <Music className="w-5 h-5 text-primary" />
          </div>
          <span>FluteBuddy</span>
          <span className="hidden sm:inline text-sm font-normal text-muted">长笛智能练习平台</span>
        </Link>
        <nav className="flex gap-1">
          {links.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className={clsx(
                "flex items-center gap-1.5 px-4 py-2 rounded-md text-sm font-medium transition-colors",
                pathname === href
                  ? "bg-primary text-white"
                  : "text-muted hover:text-foreground hover:bg-slate-100"
              )}
            >
              <Icon className="w-4 h-4" />
              <span className="hidden sm:inline">{label}</span>
            </Link>
          ))}
        </nav>
      </div>
    </header>
  );
}

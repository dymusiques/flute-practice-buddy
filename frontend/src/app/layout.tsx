import type { Metadata } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";
import NavBar from "@/components/NavBar";

const jakarta = Plus_Jakarta_Sans({
  variable: "--font-jakarta",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "FluteBuddy · 长笛智能练习平台",
  description: "面向少儿学员、零基础成人、古典乐爱好者与陪练家长的 AI 长笛练习分析与指导平台",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN" className={`${jakarta.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col font-sans">
        <NavBar />
        <main className="flex-1 w-full">{children}</main>
        <footer className="border-t border-[var(--border)] bg-white mt-auto">
          <div className="section-wrap py-10 grid sm:grid-cols-3 gap-8 text-sm">
            <div>
              <p className="font-semibold text-foreground mb-2">FluteBuddy</p>
              <p className="text-muted leading-relaxed">专业的长笛练习分析平台，让每一次练习都清楚该练什么、哪里要改。</p>
            </div>
            <div>
              <p className="font-semibold text-foreground mb-2">功能</p>
              <ul className="text-muted space-y-1">
                <li>谱面识别与演奏分析</li>
                <li>100 分透明评分</li>
                <li>节拍器与校音器</li>
              </ul>
            </div>
            <div>
              <p className="font-semibold text-foreground mb-2">适用对象</p>
              <ul className="text-muted space-y-1">
                <li>6–15 岁长笛学生</li>
                <li>零基础成人</li>
                <li>家长陪练</li>
              </ul>
            </div>
          </div>
          <div className="border-t border-[var(--border)] py-4 text-center text-xs text-muted">
            © FluteBuddy · 让每一次练习都有方向
          </div>
        </footer>
      </body>
    </html>
  );
}

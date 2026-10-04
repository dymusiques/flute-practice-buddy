import Link from "next/link";
import { Mic, Wrench, BarChart3, Users, GraduationCap, ArrowRight, Music2, UserRound } from "lucide-react";

const features = [
  {
    icon: Mic,
    title: "上传与分析",
    desc: "上传谱面与演奏录音/视频，AI 自动分析音准、节奏、音质与姿势。",
  },
  {
    icon: BarChart3,
    title: "透明评分",
    desc: "100 分制，逐项展示扣分原因与改进建议，进步清晰可见。",
  },
  {
    icon: Wrench,
    title: "内置工具",
    desc: "专业节拍器与校音器，练习过程中随时使用。",
  },
];

const audiences = [
  { icon: GraduationCap, label: "6–15 岁学员", desc: "初学或在练，都知道哪里错、怎么改" },
  { icon: UserRound, label: "零基础成人", desc: "从零起步，也有清晰的练习方向" },
  { icon: Music2, label: "古典音乐爱好者", desc: "自主练习，也能获得专业级反馈" },
  { icon: Users, label: "陪练家长", desc: "不懂音乐，也能看懂进度与问题" },
];

export default function Home() {
  return (
    <>
      {/* Hero — 左右分栏，不全居中 */}
      <section className="bg-white border-b border-[var(--border)]">
        <div className="section-wrap py-16 lg:py-24 grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">
          <div>
            <p className="text-sm font-semibold text-primary uppercase tracking-wider mb-4">
              长笛智能练习平台
            </p>
            <h1 className="text-4xl lg:text-5xl font-bold text-foreground leading-tight tracking-tight">
              让练习有方向，
              <br />
              <span className="text-primary">让进步看得见</span>
            </h1>
            <p className="mt-6 text-lg text-muted leading-relaxed max-w-lg">
              上传谱面与演奏，获得专业级分析与指导。
              界面清晰友好，分析严谨可靠——
              面向少儿学员、零基础成人、古典乐爱好者与陪练家长。
            </p>
            <div className="mt-8 flex flex-wrap gap-4">
              <Link href="/practice" className="cute-btn inline-flex items-center gap-2">
                开始练习分析
                <ArrowRight className="w-4 h-4" />
              </Link>
              <Link href="/tools" className="cute-btn cute-btn-secondary inline-flex items-center gap-2">
                打开练习工具
              </Link>
            </div>
          </div>
          <div className="relative">
            <div className="aspect-[4/3] rounded-xl bg-gradient-to-br from-slate-50 to-cyan-50 border border-[var(--border)] flex items-center justify-center overflow-hidden">
              <div className="text-center p-8">
                <div className="text-7xl mb-4">🪈</div>
                <p className="font-semibold text-foreground text-lg">AI 演奏分析</p>
                <p className="text-sm text-muted mt-2">音准 · 节奏 · 音质 · 姿势</p>
                <div className="mt-6 grid grid-cols-3 gap-3 text-center">
                  {["音准 92", "节奏 85", "综合 88"].map((s) => (
                    <div key={s} className="bg-white rounded-lg py-2 px-3 text-sm font-semibold border border-[var(--border)]">
                      {s}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features — 全宽三列 */}
      <section className="section-wrap py-16">
        <h2 className="text-2xl font-bold text-foreground mb-2">核心功能</h2>
        <p className="text-muted mb-10 max-w-xl">从上传到反馈，完整覆盖练习闭环。</p>
        <div className="grid md:grid-cols-3 gap-6">
          {features.map(({ icon: Icon, title, desc }) => (
            <div key={title} className="cute-card p-8">
              <div className="w-11 h-11 rounded-lg bg-primary/10 flex items-center justify-center mb-5">
                <Icon className="w-5 h-5 text-primary" />
              </div>
              <h3 className="font-semibold text-lg mb-2">{title}</h3>
              <p className="text-muted text-sm leading-relaxed">{desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Audiences */}
      <section className="bg-white border-y border-[var(--border)]">
        <div className="section-wrap py-16">
          <h2 className="text-2xl font-bold text-foreground mb-10">为谁而设计</h2>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-8">
            {audiences.map(({ icon: Icon, label, desc }) => (
              <div key={label} className="flex gap-4">
                <div className="w-10 h-10 rounded-lg bg-slate-100 flex items-center justify-center flex-shrink-0">
                  <Icon className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <p className="font-semibold">{label}</p>
                  <p className="text-sm text-muted mt-1">{desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Scoring */}
      <section className="section-wrap py-16">
        <div className="grid lg:grid-cols-2 gap-12 items-start">
          <div>
            <h2 className="text-2xl font-bold text-foreground mb-4">100 分透明评分</h2>
            <p className="text-muted leading-relaxed mb-6">
              从 100 分起扣，每一项扣分都标注位置、原因与改进方法。
              支持谱面片段分析，练完可重新上传对比进步。
            </p>
            <Link href="/practice" className="cute-btn inline-flex items-center gap-2">
              体验评分系统
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
          <div className="cute-card p-6 space-y-3">
            {[
              { label: "音准", score: 88, deduct: "−2 第3小节偏低" },
              { label: "节奏", score: 80, deduct: "−4 第5小节忽快" },
              { label: "音质", score: 90, deduct: "−1 气声略多" },
            ].map((item) => (
              <div key={item.label} className="flex items-center gap-4">
                <span className="w-12 text-sm font-semibold text-muted">{item.label}</span>
                <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                  <div className="h-full bg-primary rounded-full" style={{ width: `${item.score}%` }} />
                </div>
                <span className="text-sm font-semibold w-8">{item.score}</span>
                <span className="text-xs text-muted hidden sm:inline">{item.deduct}</span>
              </div>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}

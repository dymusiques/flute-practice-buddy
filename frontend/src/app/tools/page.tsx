import Metronome from "@/components/Metronome";
import Tuner from "@/components/Tuner";

export default function ToolsPage() {
  return (
    <div className="w-full">
      <div className="section-wrap py-12 border-b border-[var(--border)] mb-8">
        <p className="text-sm font-semibold text-primary uppercase tracking-wider mb-2">练习工具</p>
        <h1 className="page-title">节拍器与校音器</h1>
        <p className="page-desc">练习过程中随时使用，辅助节奏与音准训练。</p>
      </div>
      <div className="section-wrap pb-16 grid lg:grid-cols-2 gap-8">
        <Metronome />
        <Tuner />
      </div>
    </div>
  );
}

import type { TempoBeatUnit } from "@/lib/tempo-notation";
import TempoNoteSvg from "@/components/TempoNoteSvg";

interface TempoMarkProps {
  tempo: number;
  unit?: TempoBeatUnit;
  /** 数字字号 class，默认 text-4xl */
  numberClassName?: string;
  noteSize?: number;
  className?: string;
}

/** 谱面式速度：音符 SVG + 「= 数字」 */
export default function TempoMark({
  tempo,
  unit = "quarter",
  numberClassName = "text-4xl font-bold text-foreground",
  noteSize = 28,
  className = "",
}: TempoMarkProps) {
  return (
    <span className={`inline-flex items-center gap-1.5 ${className}`}>
      <TempoNoteSvg unit={unit} size={noteSize} className="text-foreground shrink-0" />
      <span className={`${numberClassName} leading-none`}>= {Math.round(tempo)}</span>
    </span>
  );
}

import type { TempoBeatUnit } from "@/lib/tempo-notation";

interface TempoNoteSvgProps {
  unit: TempoBeatUnit;
  /** 显示高度（px） */
  size?: number;
  className?: string;
}

/**
 * 谱面速度标记用音符（SVG 绘制，避免 Unicode 在部分字体下显示成方块）。
 */
export default function TempoNoteSvg({ unit, size = 22, className }: TempoNoteSvgProps) {
  const scale = size / 22;
  const w = 14 * scale;
  const h = size;
  const headCx = 5.5;
  const headCy = 17;
  const stemX = 8.8;
  const stemTop = 5;
  const stemBottom = 14.5;

  if (unit === "half") {
    return (
      <svg
        width={w}
        height={h}
        viewBox="0 0 14 22"
        className={className}
        aria-hidden
        role="presentation"
      >
        <ellipse
          cx={headCx}
          cy={headCy}
          rx="4.4"
          ry="3.1"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.15"
          transform={`rotate(-16 ${headCx} ${headCy})`}
        />
        <line x1={stemX} y1={stemTop} x2={stemX} y2={stemBottom} stroke="currentColor" strokeWidth="1.15" />
      </svg>
    );
  }

  if (unit === "quarter") {
    return (
      <svg
        width={w}
        height={h}
        viewBox="0 0 14 22"
        className={className}
        aria-hidden
        role="presentation"
      >
        <ellipse
          cx={headCx}
          cy={headCy}
          rx="4.4"
          ry="3.1"
          fill="currentColor"
          transform={`rotate(-16 ${headCx} ${headCy})`}
        />
        <line x1={stemX} y1={stemTop} x2={stemX} y2={stemBottom} stroke="currentColor" strokeWidth="1.15" />
      </svg>
    );
  }

  // 八分音符：单一符头 + 符干 + 一条符尾
  return (
    <svg
      width={w}
      height={h}
      viewBox="0 0 14 22"
      className={className}
      aria-hidden
      role="presentation"
    >
      <ellipse
        cx={headCx}
        cy={headCy}
        rx="4.4"
        ry="3.1"
        fill="currentColor"
        transform={`rotate(-16 ${headCx} ${headCy})`}
      />
      <line x1={stemX} y1={stemTop} x2={stemX} y2={stemBottom} stroke="currentColor" strokeWidth="1.15" />
      <path
        d={`M ${stemX} ${stemTop - 2} Q ${stemX + 5} ${stemTop + 2} ${stemX + 4} ${stemTop + 7}`}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
    </svg>
  );
}

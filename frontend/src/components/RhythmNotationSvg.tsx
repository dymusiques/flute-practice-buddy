import type { BeamedFigure, NoteKind } from "@/lib/rhythm-patterns";

const HEAD: Record<NoteKind, { rx: number; ry: number }> = {
  "16": { rx: 3, ry: 2.2 },
  "8": { rx: 3.6, ry: 2.7 },
  "4": { rx: 5.5, ry: 4 },
};

function unitWidth(kind: NoteKind): number {
  if (kind === "16") return 1;
  if (kind === "8") return 2;
  return 4;
}

function noteCenters(notes: NoteKind[], groupWidth: number): number[] {
  const units = notes.map(unitWidth);
  const total = units.reduce((a, b) => a + b, 0);
  const unitW = groupWidth / total;
  let x = 0;
  return units.map((u) => {
    const cx = x + (u * unitW) / 2;
    x += u * unitW;
    return cx;
  });
}

function stemX(cx: number, kind: NoteKind): number {
  return cx + HEAD[kind].rx * 0.75;
}

/** 小切分：十六+八+十六，副符杠为指向中间的 cut-off beam（英皇 Grade 1） */
function isSmallSyncopation(notes: NoteKind[]): boolean {
  return notes.length === 3 && notes[0] === "16" && notes[1] === "8" && notes[2] === "16";
}

interface GroupProps {
  figure: BeamedFigure;
  groupWidth: number;
  highlightNote: number | null;
  padX: number;
}

function BeamedGroupSvg({ figure, groupWidth, highlightNote, padX }: GroupProps) {
  const { notes } = figure;
  const centers = noteCenters(notes, groupWidth);
  const headY = 20;
  const stemTop = 5;
  const stemBottom = headY - HEAD[notes[0] ?? "8"].ry + 0.5;
  const smallSync = isSmallSyncopation(notes);
  const beamed =
    notes.length > 1 &&
    notes.every((n) => n !== "4") &&
    !notes.some((n, i) => n === "4" && i > 0 && i < notes.length - 1);

  const stems = centers.map((cx, i) => {
    const kind = notes[i]!;
    const sx = stemX(cx, kind);
    return { sx, cx, kind, i };
  });

  const beam1Y = stemTop;
  const beam2Y = stemTop + 3.5;
  const beamStart = stems[0]?.sx ?? 0;
  const beamEnd = stems[stems.length - 1]?.sx ?? 0;

  const sixteenthIndices = notes
    .map((n, i) => (n === "16" ? i : -1))
    .filter((i) => i >= 0);

  const consecutiveSixteenths =
    sixteenthIndices.length >= 2 &&
    sixteenthIndices.every((idx, i) => i === 0 || idx === sixteenthIndices[i - 1]! + 1);

  return (
    <g transform={`translate(${padX}, 0)`}>
      {stems.map(({ sx, i }) => (
        <line
          key={`stem-${i}`}
          x1={sx}
          y1={beamed || smallSync ? stemTop : stemTop - 2}
          x2={sx}
          y2={stemBottom}
          stroke="currentColor"
          strokeWidth={1.2}
        />
      ))}
      {centers.map((cx, i) => {
        const kind = notes[i]!;
        const { rx, ry } = HEAD[kind];
        const lit = highlightNote === i;
        const sx = stems[i]!.sx;
        const showFlag = kind === "8" && !beamed && !smallSync;
        const showFlags16 = kind === "16" && !beamed && !smallSync;
        return (
          <g key={`head-${i}`}>
            <ellipse
              cx={cx}
              cy={headY}
              rx={rx}
              ry={ry}
              fill={lit ? "var(--primary, #0891b2)" : "currentColor"}
              transform={`rotate(-18 ${cx} ${headY})`}
            />
            {showFlag && (
              <path
                d={`M ${sx} ${stemTop - 2} Q ${sx + 5} ${stemTop + 2} ${sx + 4} ${stemTop + 7}`}
                fill="none"
                stroke="currentColor"
                strokeWidth={1.4}
                strokeLinecap="round"
              />
            )}
            {showFlags16 && (
              <>
                <path
                  d={`M ${sx} ${stemTop - 2} Q ${sx + 4} ${stemTop + 1} ${sx + 3.5} ${stemTop + 5}`}
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={1.2}
                  strokeLinecap="round"
                />
                <path
                  d={`M ${sx} ${stemTop + 1} Q ${sx + 4} ${stemTop + 4} ${sx + 3.5} ${stemTop + 8}`}
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={1.2}
                  strokeLinecap="round"
                />
              </>
            )}
          </g>
        );
      })}
      {smallSync && (
        <>
          <line
            x1={beamStart}
            y1={beam1Y}
            x2={beamEnd}
            y2={beam1Y}
            stroke="currentColor"
            strokeWidth={2.2}
            strokeLinecap="butt"
          />
          {/* 两侧十六分各一条向内 cut-off 副符杠 */}
          <line
            x1={stems[0]!.sx}
            y1={beam2Y}
            x2={stems[0]!.sx + 5}
            y2={beam2Y}
            stroke="currentColor"
            strokeWidth={2.2}
            strokeLinecap="butt"
          />
          <line
            x1={stems[2]!.sx - 5}
            y1={beam2Y}
            x2={stems[2]!.sx}
            y2={beam2Y}
            stroke="currentColor"
            strokeWidth={2.2}
            strokeLinecap="butt"
          />
        </>
      )}
      {beamed && !smallSync && (
        <>
          <line
            x1={beamStart}
            y1={beam1Y}
            x2={beamEnd}
            y2={beam1Y}
            stroke="currentColor"
            strokeWidth={2.2}
            strokeLinecap="butt"
          />
          {sixteenthIndices.length >= 2 && consecutiveSixteenths && (
            <line
              x1={stems[sixteenthIndices[0]!]!.sx}
              y1={beam2Y}
              x2={stems[sixteenthIndices[sixteenthIndices.length - 1]!]!.sx}
              y2={beam2Y}
              stroke="currentColor"
              strokeWidth={2.2}
              strokeLinecap="butt"
            />
          )}
        </>
      )}
    </g>
  );
}

export interface RhythmNotationSvgProps {
  groups: BeamedFigure[];
  highlight?: { group: number; note: number } | null;
  triplet?: boolean;
  compact?: boolean;
  /** 记谱块跨越几拍（大切分=2） */
  spanBeats?: number;
  className?: string;
}

export default function RhythmNotationSvg({
  groups,
  highlight = null,
  triplet = false,
  compact = false,
  spanBeats = 1,
  className = "",
}: RhythmNotationSvgProps) {
  const groupGap = compact ? 6 : 10;
  const padX = 4;
  const beatWidth = compact ? 44 : 52;

  let totalW = padX * 2;
  groups.forEach((g, gi) => {
    const units = g.notes.reduce((s, n) => s + unitWidth(n), 0);
    const beatUnits = 4 * spanBeats;
    const groupW = (units / beatUnits) * beatWidth * spanBeats;
    totalW += Math.max(groupW, beatWidth * 0.5);
    if (gi < groups.length - 1) totalW += groupGap;
  });

  const height = triplet ? 34 : 28;

  return (
    <svg
      viewBox={`0 0 ${totalW} ${height}`}
      width={totalW}
      height={height}
      className={`inline-block align-middle ${className}`}
      aria-hidden
    >
      {triplet && groups.length === 1 && groups[0]!.notes.length === 3 && (
        <text
          x={totalW / 2}
          y={4}
          textAnchor="middle"
          fontSize={7}
          fontWeight={700}
          fill="var(--primary, #0891b2)"
        >
          3
        </text>
      )}
      {groups.map((figure, gi) => {
        let offset = padX;
        for (let j = 0; j < gi; j++) {
          const prevUnits = groups[j]!.notes.reduce((s, n) => s + unitWidth(n), 0);
          offset += (prevUnits / (4 * spanBeats)) * beatWidth * spanBeats + groupGap;
        }
        const units = figure.notes.reduce((s, n) => s + unitWidth(n), 0);
        const groupW = (units / (4 * spanBeats)) * beatWidth * spanBeats;
        const hl = highlight && highlight.group === gi ? highlight.note : null;
        return (
          <BeamedGroupSvg
            key={gi}
            figure={figure}
            groupWidth={groupW}
            highlightNote={hl}
            padX={offset}
          />
        );
      })}
    </svg>
  );
}

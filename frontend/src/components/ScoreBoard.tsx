"use client";

import { useMemo } from "react";
import { motion } from "framer-motion";
import { Star, Trophy, TrendingUp } from "lucide-react";
import type { ScoreBreakdown } from "@/lib/api";
import {
  dimensionScoresFromBreakdown,
  gradeFromPercent,
  sumSelectedScore,
  type DimensionKey,
} from "@/lib/score-dimensions";

interface ScoreBoardProps {
  scores: ScoreBreakdown;
  scoreDelta?: number | null;
  attemptNumber?: number;
  postureAvailable?: boolean;
  checked: Record<DimensionKey, boolean>;
  rescoring?: boolean;
}

function Confetti() {
  const colors = ["#ff8fab", "#ffd166", "#a8d8ea", "#95e1a3", "#e6678a"];
  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden">
      {Array.from({ length: 24 }).map((_, i) => (
        <motion.div
          key={i}
          className="absolute w-3 h-3 rounded-sm"
          style={{
            background: colors[i % colors.length],
            left: `${(i * 17) % 100}%`,
            top: "-10%",
          }}
          initial={{ y: 0, opacity: 1, rotate: 0 }}
          animate={{ y: 400, opacity: 0, rotate: 360 }}
          transition={{ duration: 2 + (i % 3), delay: i * 0.08, ease: "easeOut" }}
        />
      ))}
    </div>
  );
}

export default function ScoreBoard({
  scores,
  scoreDelta,
  attemptNumber,
  postureAvailable = false,
  checked,
  rescoring = false,
}: ScoreBoardProps) {
  const dimScores = useMemo(() => dimensionScoresFromBreakdown(scores), [scores]);
  const { total, max } = useMemo(
    () => sumSelectedScore(dimScores, checked, postureAvailable),
    [dimScores, checked, postureAvailable]
  );
  const pct = max > 0 ? (total / max) * 100 : 0;
  const { grade, stars } = gradeFromPercent(pct);
  const isPerfect = max > 0 && total >= max;

  return (
    <div className="cute-card p-6 relative overflow-hidden">
      {isPerfect && <Confetti />}

      <div className={`relative z-10 space-y-4 ${rescoring ? "opacity-60" : ""}`}>
        {scores.is_partial && (
          <span className="inline-block px-3 py-1 bg-accent/30 text-sm font-bold rounded-full">
            📄 片段评分 · {scores.section_label}
          </span>
        )}

        {scores.alignment_notice && (
          <p className="text-xs text-muted leading-relaxed">{scores.alignment_notice}</p>
        )}

        {attemptNumber && attemptNumber > 1 && scoreDelta != null && (
          <div
            className={`flex items-center gap-1 text-sm font-bold ${scoreDelta >= 0 ? "text-success" : "text-primary-dark"}`}
          >
            <TrendingUp className="w-4 h-4" />
            第 {attemptNumber} 次练习 · {scoreDelta >= 0 ? "+" : ""}
            {scoreDelta} 分
          </div>
        )}

        <div className="text-center pt-1">
          <motion.div
            initial={{ scale: 0.5, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: "spring", stiffness: 200, damping: 12 }}
            className="relative inline-block mb-3"
          >
            <div
              className="w-32 h-32 rounded-full flex items-center justify-center score-ring mx-auto"
              style={{ "--score": pct } as React.CSSProperties}
            >
              <div className="w-24 h-24 rounded-full bg-white flex flex-col items-center justify-center">
                {isPerfect ? (
                  <Trophy className="w-9 h-9 text-accent mb-0.5" />
                ) : (
                  <span className="text-3xl font-black text-primary-dark">{Math.round(total)}</span>
                )}
                <span className="text-xs font-bold text-muted">{isPerfect ? "满分！" : `/ ${max}`}</span>
              </div>
            </div>
          </motion.div>

          <motion.h2
            initial={{ y: 12, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            className={`text-xl font-extrabold mb-1 ${isPerfect ? "text-accent" : "text-primary-dark"}`}
          >
            {max > 0 ? grade : "请选择评分项"}
          </motion.h2>

          <div className="flex justify-center gap-1 mb-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <Star
                key={i}
                className={`w-6 h-6 ${i < stars ? "text-accent fill-accent" : "text-gray-200"}`}
              />
            ))}
          </div>

          <p className="text-sm font-bold text-foreground">{scores.encouragement}</p>
          <p className="text-xs text-muted mt-1">{scores.summary}</p>
          {max > 0 && (
            <p className="mt-2 text-sm font-semibold text-primary-dark">
              本次总分 {total}/{max}
              {scores.bonus_points > 0 && ` + ${scores.bonus_points} 奖励分`}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

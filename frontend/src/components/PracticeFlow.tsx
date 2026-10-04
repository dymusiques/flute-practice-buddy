"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { CheckCircle, Play, SkipForward, MessageCircle, Upload } from "lucide-react";
import type { FullAnalysisResult, PracticeSegment } from "@/lib/api";
import { markSegmentFixed, askFollowUp } from "@/lib/api";

interface PracticeFlowProps {
  result: FullAnalysisResult;
  onReupload: () => void;
  onScoreUpdate: (overall: number, bonus: number) => void;
}

export default function PracticeFlow({ result, onReupload, onScoreUpdate }: PracticeFlowProps) {
  const [segments, setSegments] = useState<PracticeSegment[]>(result.scores.practice_segments);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [showPractice, setShowPractice] = useState(false);
  const [followUpAnswer, setFollowUpAnswer] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const unfixed = segments.filter((s) => !s.fixed);
  const current = unfixed[0] ?? null;
  const progress = segments.length > 0 ? (segments.filter((s) => s.fixed).length / segments.length) * 100 : 100;
  const allFixed = unfixed.length === 0;

  const handleFixed = async () => {
    if (!current) return;
    setLoading(true);
    try {
      const res = await markSegmentFixed(result.session_id, current.id);
      setSegments((prev) =>
        prev.map((s) => (s.id === current.id ? { ...s, fixed: true } : s))
      );
      onScoreUpdate(result.scores.overall + res.bonus_points, res.bonus_points);
      setShowPractice(false);
      setFollowUpAnswer(null);
    } finally {
      setLoading(false);
    }
  };

  const handleSkip = () => {
    setShowPractice(false);
    setFollowUpAnswer(null);
    if (currentIdx < segments.length - 1) setCurrentIdx((i) => i + 1);
  };

  const handleFollowUp = async () => {
    if (!current) return;
    setLoading(true);
    try {
      const res = await askFollowUp(result.session_id, "这里怎么改？", current.instruction);
      setFollowUpAnswer(res.answer);
    } finally {
      setLoading(false);
    }
  };

  if (segments.length === 0) {
    return (
      <div className="cute-card p-6 text-center">
        <div className="text-5xl mb-3">🏆</div>
        <p className="font-extrabold text-xl text-success">全部正确！不需要额外练习！</p>
      </div>
    );
  }

  if (allFixed) {
    return (
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="cute-card p-6 text-center"
      >
        <div className="text-5xl mb-3">🎊</div>
        <h3 className="text-xl font-extrabold text-success mb-2">所有问题都练过啦！</h3>
        <p className="text-muted mb-4">现在上传一段完整的演奏，看看能不能拿更高分！</p>
        <button onClick={onReupload} className="cute-btn inline-flex items-center gap-2 text-lg">
          <Upload className="w-5 h-5" />
          上传完整练习
        </button>
      </motion.div>
    );
  }

  return (
    <div className="cute-card p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-xl font-extrabold">🗺️ 练习冒险路径</h3>
        <span className="text-sm font-bold text-muted">
          {segments.filter((s) => s.fixed).length}/{segments.length} 已完成
        </span>
      </div>

      {/* 冒险进度条 */}
      <div className="h-3 bg-gray-100 rounded-full mb-6 overflow-hidden">
        <motion.div
          className="h-full bg-gradient-to-r from-primary to-accent rounded-full"
          initial={{ width: 0 }}
          animate={{ width: `${progress}%` }}
          transition={{ duration: 0.5 }}
        />
      </div>

      <AnimatePresence mode="wait">
        {current && (
          <motion.div
            key={current.id}
            initial={{ x: 50, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: -50, opacity: 0 }}
            className="border-2 border-primary/30 rounded-2xl p-5 bg-primary/5"
          >
            <div className="flex items-center gap-2 mb-3">
              <span className="px-3 py-1 bg-primary text-white text-sm font-bold rounded-full">
                📍 {current.location}
              </span>
              <span className="text-sm font-bold text-muted">{current.category}</span>
            </div>

            <p className="font-extrabold text-lg mb-2">{current.instruction}</p>
            <p className="text-muted mb-4">💡 {current.suggestion}</p>

            {current.clip_url && (
              <div className="mb-4 p-3 bg-white rounded-xl border border-primary/20">
                <p className="text-xs font-bold text-primary mb-2">🔊 听错在哪里</p>
                <audio controls preload="none" src={current.clip_url} className="w-full h-9" />
              </div>
            )}

            {showPractice && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                className="mb-4 p-4 bg-white rounded-xl border-2 border-secondary/40"
              >
                <p className="font-bold text-secondary mb-2">🎵 从这里开始练：</p>
                {current.start_measure && (
                  <p className="text-sm">从第 <strong>{current.start_measure}</strong> 小节开始，慢速连续吹到下一小节</p>
                )}
                {current.start_sec != null && (
                  <p className="text-sm">从 <strong>{formatTime(current.start_sec)}</strong> 处开始</p>
                )}
                <p className="text-sm mt-2 text-muted">打开节拍器，跟拍练习 3 遍后再加速</p>
              </motion.div>
            )}

            {followUpAnswer && (
              <div className="mb-4 p-4 bg-accent/10 rounded-xl border-2 border-accent/30">
                <p className="font-bold text-sm mb-1">老师回答：</p>
                <p className="text-sm">{followUpAnswer}</p>
              </div>
            )}

            {/* 练习操作 */}
            <div className="flex flex-wrap gap-2">
              {!showPractice ? (
                <button
                  onClick={() => setShowPractice(true)}
                  className="cute-btn inline-flex items-center gap-2"
                >
                  <Play className="w-4 h-4" />
                  从这里开始练
                </button>
              ) : (
                <button
                  onClick={handleFixed}
                  disabled={loading}
                  className="cute-btn inline-flex items-center gap-2 bg-success"
                  style={{ background: "linear-gradient(135deg, #95e1a3, #6bc77a)" }}
                >
                  <CheckCircle className="w-4 h-4" />
                  我改好了 ✓
                </button>
              )}
              <button
                onClick={handleFollowUp}
                disabled={loading}
                className="cute-btn-secondary cute-btn inline-flex items-center gap-2 text-sm"
              >
                <MessageCircle className="w-4 h-4" />
                追问
              </button>
              <button
                onClick={handleSkip}
                className="px-4 py-2 rounded-full text-sm font-bold text-muted hover:bg-gray-100 inline-flex items-center gap-1"
              >
                <SkipForward className="w-4 h-4" />
                先跳过
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 剩余问题预览 */}
      <div className="mt-4 flex gap-1">
        {segments.map((s) => (
          <div
            key={s.id}
            className={`h-2 flex-1 rounded-full ${s.fixed ? "bg-success" : s.id === current?.id ? "bg-primary" : "bg-gray-200"}`}
          />
        ))}
      </div>
    </div>
  );
}

function formatTime(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

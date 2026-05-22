"use client";

import type { Verdict } from "@/app/api/judge/route";
import { labelFor } from "@/lib/models";

type Props = {
  verdict: Verdict | null;
  judgeModel: string;
  modelA: string;
  modelB: string;
  status: "idle" | "loading" | "done" | "error";
  errorMessage?: string;
  onRetry?: () => void;
};

function total(scores: { logic: number; evidence: number; persuasion: number }) {
  return scores.logic + scores.evidence + scores.persuasion;
}

function ScoreBar({ label, value }: { label: string; value: number }) {
  const width = Math.max(0, Math.min(10, value)) * 10;
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="w-20 text-slate-400">{label}</span>
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-bg-elev">
        <div className="h-full bg-judge/80" style={{ width: `${width}%` }} />
      </div>
      <span className="w-6 text-right font-mono text-slate-200">{value}</span>
    </div>
  );
}

export default function JudgeVerdict({
  verdict,
  judgeModel,
  modelA,
  modelB,
  status,
  errorMessage,
  onRetry,
}: Props) {
  if (status === "idle") return null;

  if (status === "loading") {
    return (
      <div className="rounded-xl border border-judge/30 bg-judge/5 px-4 py-6 text-center text-sm text-slate-300">
        <div className="mb-1 text-[11px] uppercase tracking-wider text-judge">Judge deliberating</div>
        <div>{labelFor(judgeModel)} is reading the full transcript…</div>
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className="rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-4 text-sm text-red-200">
        <div className="mb-1 text-[11px] uppercase tracking-wider">Judge error ({labelFor(judgeModel)})</div>
        <div className="mb-2 whitespace-pre-wrap">{errorMessage || "Request failed"}</div>
        {onRetry && (
          <button
            onClick={onRetry}
            className="rounded border border-red-400/50 px-2 py-1 text-xs hover:bg-red-500/20"
          >
            Retry verdict
          </button>
        )}
      </div>
    );
  }

  if (!verdict) return null;

  const winnerSide = verdict.winner === "debaterA" ? "PRO" : "CON";
  const winnerModel = verdict.winner === "debaterA" ? modelA : modelB;
  const winnerColor = verdict.winner === "debaterA" ? "text-pro" : "text-con";

  return (
    <div className="rounded-xl border border-judge/40 bg-judge/5 px-5 py-5">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <div className="text-[11px] uppercase tracking-wider text-judge">Verdict</div>
          <div className="mt-0.5 text-lg font-semibold text-slate-100">
            Winner:{" "}
            <span className={winnerColor}>
              {winnerSide} · {labelFor(winnerModel)}
            </span>
          </div>
        </div>
        <div className="text-right text-xs text-slate-400">
          <div className="text-[10px] uppercase tracking-wider">Judged by</div>
          <div>{labelFor(judgeModel)}</div>
        </div>
      </div>

      <p className="mb-4 text-sm leading-relaxed text-slate-200">{verdict.reasoning}</p>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="rounded-lg border border-pro/30 bg-pro/5 p-3">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs font-semibold text-pro">Debater A · PRO</span>
            <span className="font-mono text-xs text-slate-400">
              {labelFor(modelA)} · {total(verdict.scores.debaterA)}/30
            </span>
          </div>
          <div className="flex flex-col gap-1.5">
            <ScoreBar label="Logic" value={verdict.scores.debaterA.logic} />
            <ScoreBar label="Evidence" value={verdict.scores.debaterA.evidence} />
            <ScoreBar label="Persuasion" value={verdict.scores.debaterA.persuasion} />
          </div>
        </div>
        <div className="rounded-lg border border-con/30 bg-con/5 p-3">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs font-semibold text-con">Debater B · CON</span>
            <span className="font-mono text-xs text-slate-400">
              {labelFor(modelB)} · {total(verdict.scores.debaterB)}/30
            </span>
          </div>
          <div className="flex flex-col gap-1.5">
            <ScoreBar label="Logic" value={verdict.scores.debaterB.logic} />
            <ScoreBar label="Evidence" value={verdict.scores.debaterB.evidence} />
            <ScoreBar label="Persuasion" value={verdict.scores.debaterB.persuasion} />
          </div>
        </div>
      </div>
    </div>
  );
}

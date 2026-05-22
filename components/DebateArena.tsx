"use client";

import { labelFor } from "@/lib/models";
import type { TranscriptEntry } from "@/lib/prompts";

export type TurnState = {
  text: string;
  status: "idle" | "streaming" | "done" | "error";
  errorMessage?: string;
};

export type RoundState = {
  debaterA: TurnState;
  debaterB: TurnState;
};

type Props = {
  topic: string;
  rounds: RoundState[];
  modelA: string;
  modelB: string;
  onRetryRound?: (round: number) => void;
};

const ROUND_LABELS = [
  "Round 1 — Opening",
  "Round 2 — Rebuttal",
  "Round 3 — Closing",
];

function TypingIndicator() {
  return (
    <span className="inline-flex items-center gap-1 text-slate-400">
      <span className="typing-dot">•</span>
      <span className="typing-dot">•</span>
      <span className="typing-dot">•</span>
    </span>
  );
}

function Bubble({
  side,
  model,
  turn,
}: {
  side: "pro" | "con";
  model: string;
  turn: TurnState;
}) {
  const accent =
    side === "pro"
      ? "border-pro/30 bg-pro/5 text-slate-100"
      : "border-con/30 bg-con/5 text-slate-100";
  const nameColor = side === "pro" ? "text-pro" : "text-con";
  const label = side === "pro" ? "Debater A · PRO" : "Debater B · CON";

  return (
    <div className={`rounded-xl border ${accent} px-4 py-3 shadow-sm`}>
      <div className="mb-1 flex items-center justify-between text-[11px] uppercase tracking-wider">
        <span className={`font-semibold ${nameColor}`}>{label}</span>
        <span className="text-slate-500">{labelFor(model)}</span>
      </div>
      <div className="whitespace-pre-wrap text-sm leading-relaxed text-slate-100">
        {turn.text || (turn.status === "streaming" ? <TypingIndicator /> : null)}
        {turn.status === "streaming" && turn.text && (
          <span className="ml-1 inline-block h-4 w-[2px] translate-y-0.5 animate-pulse bg-slate-300 align-middle" />
        )}
      </div>
      {turn.status === "error" && (
        <div className="mt-2 rounded border border-red-500/40 bg-red-500/10 px-2 py-1 text-xs text-red-300">
          {turn.errorMessage || "Request failed"}
        </div>
      )}
    </div>
  );
}

export default function DebateArena({ topic, rounds, modelA, modelB, onRetryRound }: Props) {
  return (
    <div className="flex flex-col gap-6">
      <div className="rounded-lg border border-border bg-bg-elev px-4 py-3">
        <div className="text-[11px] font-medium uppercase tracking-wider text-slate-400">
          Topic
        </div>
        <div className="mt-0.5 text-base text-slate-100">{topic}</div>
      </div>

      {rounds.map((r, idx) => {
        const roundErr =
          r.debaterA.status === "error" || r.debaterB.status === "error";
        return (
          <section key={idx} className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-300">{ROUND_LABELS[idx]}</h3>
              {roundErr && onRetryRound && (
                <button
                  onClick={() => onRetryRound(idx + 1)}
                  className="rounded border border-red-500/40 px-2 py-1 text-xs text-red-300 hover:bg-red-500/10"
                >
                  Retry round
                </button>
              )}
            </div>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <Bubble side="pro" model={modelA} turn={r.debaterA} />
              <Bubble side="con" model={modelB} turn={r.debaterB} />
            </div>
          </section>
        );
      })}
    </div>
  );
}

export function transcriptToText(topic: string, rounds: RoundState[], modelA: string, modelB: string): string {
  const lines: string[] = [`Topic: ${topic}`, ""];
  rounds.forEach((r, i) => {
    lines.push(`=== ${ROUND_LABELS[i]} ===`);
    lines.push(`--- Debater A · PRO · ${labelFor(modelA)} ---`);
    lines.push(r.debaterA.text.trim());
    lines.push("");
    lines.push(`--- Debater B · CON · ${labelFor(modelB)} ---`);
    lines.push(r.debaterB.text.trim());
    lines.push("");
  });
  return lines.join("\n");
}

export function transcriptEntries(rounds: RoundState[], modelA: string, modelB: string): TranscriptEntry[] {
  const entries: TranscriptEntry[] = [];
  rounds.forEach((r, i) => {
    const roundLabel = ROUND_LABELS[i];
    if (r.debaterA.text.trim()) {
      entries.push({
        label: `Debater A (${labelFor(modelA)})`,
        sideLabel: "PRO",
        roundLabel,
        text: r.debaterA.text.trim(),
      });
    }
    if (r.debaterB.text.trim()) {
      entries.push({
        label: `Debater B (${labelFor(modelB)})`,
        sideLabel: "CON",
        roundLabel,
        text: r.debaterB.text.trim(),
      });
    }
  });
  return entries;
}

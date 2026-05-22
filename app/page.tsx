"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import ModelPicker from "@/components/ModelPicker";
import DebateArena, {
  RoundState,
  transcriptEntries,
  transcriptToText,
} from "@/components/DebateArena";
import JudgeVerdict from "@/components/JudgeVerdict";
import type { Verdict } from "@/app/api/judge/route";
import type { RoundNum, Side, TranscriptEntry } from "@/lib/prompts";

type Phase = "setup" | "debating" | "judging" | "done";

const EMPTY_ROUND = (): RoundState => ({
  debaterA: { text: "", status: "idle" },
  debaterB: { text: "", status: "idle" },
});

const EMPTY_ROUNDS = (): RoundState[] => [EMPTY_ROUND(), EMPTY_ROUND(), EMPTY_ROUND()];

async function streamTurn(
  body: {
    model: string;
    side: Side;
    round: RoundNum;
    topic: string;
    history: TranscriptEntry[];
  },
  onDelta: (text: string) => void,
): Promise<void> {
  const resp = await fetch("/api/debate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!resp.ok || !resp.body) {
    const msg = await resp.text().catch(() => "request failed");
    throw new Error(msg || `HTTP ${resp.status}`);
  }
  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const events = buffer.split("\n\n");
    buffer = events.pop() ?? "";
    for (const ev of events) {
      const lines = ev.split("\n");
      let eventType = "message";
      let data = "";
      for (const ln of lines) {
        if (ln.startsWith("event:")) eventType = ln.slice(6).trim();
        else if (ln.startsWith("data:")) data += ln.slice(5).trim();
      }
      if (!data) continue;
      const parsed = JSON.parse(data);
      if (eventType === "delta" && typeof parsed.text === "string") {
        onDelta(parsed.text);
      } else if (eventType === "error") {
        throw new Error(parsed.message || "model error");
      }
    }
  }
}

export default function Page() {
  const [topic, setTopic] = useState("");
  const [modelA, setModelA] = useState("claude-opus-4-7");
  const [modelB, setModelB] = useState("llama-3.3-70b-versatile");
  const [judgeModel, setJudgeModel] = useState("claude-sonnet-4-6");
  const [phase, setPhase] = useState<Phase>("setup");
  const [rounds, setRounds] = useState<RoundState[]>(EMPTY_ROUNDS);
  const [verdict, setVerdict] = useState<Verdict | null>(null);
  const [verdictStatus, setVerdictStatus] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [verdictError, setVerdictError] = useState<string | undefined>();
  const [copyFlash, setCopyFlash] = useState(false);
  const roundsRef = useRef<RoundState[]>(EMPTY_ROUNDS());

  const canStart = topic.trim().length > 4 && phase === "setup";

  const writeRound = useCallback((i: number, patch: Partial<RoundState>) => {
    roundsRef.current = roundsRef.current.map((r, idx) =>
      idx === i ? { ...r, ...patch } : r,
    );
    setRounds([...roundsRef.current]);
  }, []);

  const writeTurn = useCallback(
    (i: number, debater: "debaterA" | "debaterB", patch: Partial<RoundState["debaterA"]>) => {
      const prev = roundsRef.current[i][debater];
      roundsRef.current[i] = {
        ...roundsRef.current[i],
        [debater]: { ...prev, ...patch },
      };
      setRounds([...roundsRef.current]);
    },
    [],
  );

  const runRound = useCallback(
    async (round: RoundNum): Promise<boolean> => {
      const i = round - 1;

      // History helper: build the transcript visible to a given debater right now.
      // Excludes the in-progress turn for that debater.
      const historyFor = (debater: "debaterA" | "debaterB"): TranscriptEntry[] => {
        const snapshot = roundsRef.current.map((r, idx) => {
          if (idx < i) return r; // earlier rounds: as-is
          if (idx === i) {
            // current round: blank out this debater's slot so they don't see their own (empty) entry
            return { ...r, [debater]: { text: "", status: "idle" as const } };
          }
          return { debaterA: { text: "", status: "idle" as const }, debaterB: { text: "", status: "idle" as const } };
        });
        return transcriptEntries(snapshot, modelA, modelB);
      };

      const runSide = async (side: Side) => {
        const debater = side === "pro" ? "debaterA" : "debaterB";
        const model = side === "pro" ? modelA : modelB;
        writeTurn(i, debater, { text: "", status: "streaming", errorMessage: undefined });
        try {
          await streamTurn(
            {
              model,
              side,
              round,
              topic: topic.trim(),
              history: historyFor(debater),
            },
            (text) => {
              const cur = roundsRef.current[i][debater].text + text;
              writeTurn(i, debater, { text: cur });
            },
          );
          writeTurn(i, debater, { status: "done" });
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          writeTurn(i, debater, { status: "error", errorMessage: message });
        }
      };

      // Round 1 (openings): both speak in parallel — neither has heard the other yet.
      // Rounds 2 and 3: sequential — CON answers PRO's just-spoken turn directly.
      if (round === 1) {
        await Promise.all([runSide("pro"), runSide("con")]);
      } else {
        await runSide("pro");
        if (roundsRef.current[i].debaterA.status === "error") {
          // PRO failed; mark CON as idle and bail so the user can retry the round.
          return false;
        }
        await runSide("con");
      }

      const state = roundsRef.current[i];
      return state.debaterA.status === "done" && state.debaterB.status === "done";
    },
    [modelA, modelB, topic, writeTurn],
  );

  const runJudge = useCallback(async () => {
    setVerdictStatus("loading");
    setVerdictError(undefined);
    try {
      const resp = await fetch("/api/judge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: judgeModel,
          topic: topic.trim(),
          transcript: transcriptEntries(roundsRef.current, modelA, modelB),
        }),
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || `HTTP ${resp.status}`);
      setVerdict(data.verdict as Verdict);
      setVerdictStatus("done");
      setPhase("done");
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setVerdictError(message);
      setVerdictStatus("error");
    }
  }, [judgeModel, modelA, modelB, topic]);

  const startDebate = useCallback(async () => {
    if (!canStart) return;
    roundsRef.current = EMPTY_ROUNDS();
    setRounds([...roundsRef.current]);
    setVerdict(null);
    setVerdictStatus("idle");
    setPhase("debating");

    for (const r of [1, 2, 3] as RoundNum[]) {
      const ok = await runRound(r);
      if (!ok) {
        setPhase("setup");
        return;
      }
    }
    setPhase("judging");
    await runJudge();
  }, [canStart, runJudge, runRound]);

  const retryRound = useCallback(
    async (round: number) => {
      const n = round as RoundNum;
      setPhase("debating");
      const ok = await runRound(n);
      if (!ok) return;
      if (n < 3) {
        for (let r = (n + 1) as RoundNum; r <= 3; r = (r + 1) as RoundNum) {
          const next = await runRound(r);
          if (!next) return;
        }
      }
      setPhase("judging");
      await runJudge();
    },
    [runJudge, runRound],
  );

  const reset = useCallback(() => {
    roundsRef.current = EMPTY_ROUNDS();
    setRounds([...roundsRef.current]);
    setTopic("");
    setVerdict(null);
    setVerdictStatus("idle");
    setVerdictError(undefined);
    setPhase("setup");
  }, []);

  const copyTranscript = useCallback(async () => {
    const base = transcriptToText(topic, rounds, modelA, modelB);
    const withVerdict = verdict
      ? base +
        `\n=== Verdict (judge: ${judgeModel}) ===\nWinner: ${verdict.winner}\n${verdict.reasoning}\n\nScores:\n- Debater A: logic ${verdict.scores.debaterA.logic}, evidence ${verdict.scores.debaterA.evidence}, persuasion ${verdict.scores.debaterA.persuasion}\n- Debater B: logic ${verdict.scores.debaterB.logic}, evidence ${verdict.scores.debaterB.evidence}, persuasion ${verdict.scores.debaterB.persuasion}\n`
      : base;
    try {
      await navigator.clipboard.writeText(withVerdict);
      setCopyFlash(true);
      setTimeout(() => setCopyFlash(false), 1500);
    } catch {
      // ignore
    }
  }, [judgeModel, modelA, modelB, rounds, topic, verdict]);

  const debatingOrDone = phase !== "setup";
  const showControls = useMemo(() => phase === "done" || (phase === "judging" && verdictStatus === "error"), [phase, verdictStatus]);

  return (
    <main className="mx-auto flex min-h-screen max-w-5xl flex-col gap-8 px-5 py-10">
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-100">
          LLM Debate Club
        </h1>
        <p className="text-sm text-slate-400">
          Two language models argue opposite sides. A third one judges.
        </p>
      </header>

      <section className="flex flex-col gap-4 rounded-xl border border-border bg-bg-card p-5">
        <label className="flex flex-col gap-1.5">
          <span className="text-[11px] font-medium uppercase tracking-wider text-slate-400">
            Debate topic
          </span>
          <input
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            placeholder="e.g. Cities should ban private cars in downtown cores."
            disabled={debatingOrDone}
            className="rounded-lg border border-border bg-bg-elev px-3 py-2.5 text-sm text-slate-100 outline-none focus:border-pro/60 disabled:opacity-60"
          />
        </label>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <ModelPicker
            label="Debater A · PRO"
            value={modelA}
            onChange={setModelA}
            accent="pro"
            disabled={debatingOrDone}
          />
          <ModelPicker
            label="Debater B · CON"
            value={modelB}
            onChange={setModelB}
            accent="con"
            disabled={debatingOrDone}
          />
          <ModelPicker
            label="Judge"
            value={judgeModel}
            onChange={setJudgeModel}
            accent="judge"
            disabled={debatingOrDone}
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {phase === "setup" && (
            <button
              onClick={startDebate}
              disabled={!canStart}
              className="rounded-lg bg-pro px-4 py-2 text-sm font-semibold text-slate-900 transition hover:bg-pro/90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Start debate
            </button>
          )}
          {showControls && (
            <>
              <button
                onClick={copyTranscript}
                className="rounded-lg border border-border bg-bg-elev px-3 py-2 text-sm text-slate-200 hover:border-pro/60"
              >
                {copyFlash ? "Copied" : "Copy transcript"}
              </button>
              <button
                onClick={reset}
                className="rounded-lg border border-border bg-bg-elev px-3 py-2 text-sm text-slate-200 hover:border-con/60"
              >
                New debate
              </button>
            </>
          )}
          {phase === "debating" && (
            <span className="text-xs text-slate-400">Streaming…</span>
          )}
        </div>
      </section>

      {(phase !== "setup" || rounds.some((r) => r.debaterA.text || r.debaterB.text)) && (
        <DebateArena
          topic={topic.trim()}
          rounds={rounds}
          modelA={modelA}
          modelB={modelB}
          onRetryRound={retryRound}
        />
      )}

      <JudgeVerdict
        verdict={verdict}
        judgeModel={judgeModel}
        modelA={modelA}
        modelB={modelB}
        status={verdictStatus}
        errorMessage={verdictError}
        onRetry={runJudge}
      />
    </main>
  );
}

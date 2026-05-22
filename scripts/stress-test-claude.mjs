#!/usr/bin/env node
// Claude-only follow-up: same topic, swapped sides. Tests whether the stronger
// model (Opus) wins regardless of which side it's on, or whether judge tracks
// argument quality.

import { writeFileSync } from "node:fs";

const BASE = process.env.BASE_URL || "https://llm-debate-club.vercel.app";
const OUT = new URL("../stress-test-claude.md", import.meta.url).pathname;
const JSON_OUT = new URL("../stress-test-claude.json", import.meta.url).pathname;
const ROUND_LABELS = ["Round 1 — Opening", "Round 2 — Rebuttal", "Round 3 — Closing"];

async function runTurn({ model, side, round, topic, history }) {
  const resp = await fetch(`${BASE}/api/debate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model, side, round, topic, history }),
  });
  if (!resp.ok) throw new Error(`debate HTTP ${resp.status}: ${await resp.text()}`);
  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let text = "";
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const events = buffer.split("\n\n");
    buffer = events.pop() ?? "";
    for (const ev of events) {
      let eventType = "message";
      let data = "";
      for (const ln of ev.split("\n")) {
        if (ln.startsWith("event:")) eventType = ln.slice(6).trim();
        else if (ln.startsWith("data:")) data += ln.slice(5).trim();
      }
      if (!data) continue;
      const parsed = JSON.parse(data);
      if (eventType === "delta") text += parsed.text;
      else if (eventType === "error") throw new Error(`${parsed.model}: ${parsed.message}`);
    }
  }
  return text.trim();
}

async function runDebate({ topic, modelA, modelB, judgeModel, label }) {
  console.error(`\n[${label}] ${topic}`);
  console.error(`  PRO=${modelA}  CON=${modelB}  judge=${judgeModel}`);
  const rounds = [];
  for (let r = 1; r <= 3; r++) {
    const roundLabel = ROUND_LABELS[r - 1];
    const history = [];
    for (const prev of rounds) {
      history.push({ label: `Debater A (${modelA})`, sideLabel: "PRO", roundLabel: prev.roundLabel, text: prev.A });
      history.push({ label: `Debater B (${modelB})`, sideLabel: "CON", roundLabel: prev.roundLabel, text: prev.B });
    }
    console.error(`  ${roundLabel}…`);
    const [A, B] = await Promise.all([
      runTurn({ model: modelA, side: "pro", round: r, topic, history }),
      runTurn({ model: modelB, side: "con", round: r, topic, history }),
    ]);
    rounds.push({ roundLabel, A, B });
  }
  const transcript = [];
  for (const rd of rounds) {
    transcript.push({ label: `Debater A (${modelA})`, sideLabel: "PRO", roundLabel: rd.roundLabel, text: rd.A });
    transcript.push({ label: `Debater B (${modelB})`, sideLabel: "CON", roundLabel: rd.roundLabel, text: rd.B });
  }
  console.error(`  Judge…`);
  const judgeResp = await fetch(`${BASE}/api/judge`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model: judgeModel, topic, transcript }),
  });
  const data = await judgeResp.json();
  if (!judgeResp.ok) throw new Error(`judge HTTP ${judgeResp.status}: ${JSON.stringify(data)}`);
  return { label, topic, modelA, modelB, judgeModel, judgeLabel: data.model, rounds, verdict: data.verdict };
}

// Contested topic; neither side is factually wrong.
const TOPIC = "Nuclear power is the best primary path to decarbonizing the electricity grid by 2050.";

const scenarios = [
  {
    label: "C1 Opus-PRO vs Sonnet-CON",
    topic: TOPIC,
    modelA: "claude-opus-4-7",
    modelB: "claude-sonnet-4-6",
    judgeModel: "claude-sonnet-4-6",
  },
  {
    label: "C2 Sonnet-PRO vs Opus-CON (swap)",
    topic: TOPIC,
    modelA: "claude-sonnet-4-6",
    modelB: "claude-opus-4-7",
    judgeModel: "claude-sonnet-4-6",
  },
];

const results = [];
for (const s of scenarios) {
  try {
    results.push(await runDebate(s));
  } catch (err) {
    console.error(`  !! ${err.message}`);
    results.push({ ...s, error: err.message });
  }
}

writeFileSync(JSON_OUT, JSON.stringify(results, null, 2));

const md = [`# Stress test — Claude-only (positional bias)`, `Base: ${BASE}`, `Run: ${new Date().toISOString()}`, ""];
for (const r of results) {
  md.push(`## ${r.label}`);
  md.push(`**Topic:** ${r.topic}`);
  md.push(`**PRO:** ${r.modelA} · **CON:** ${r.modelB} · **Judge:** ${r.judgeLabel ?? r.judgeModel}`);
  if (r.error) { md.push(`\n**ERROR:** ${r.error}\n`); continue; }
  md.push("");
  for (const rd of r.rounds) {
    md.push(`### ${rd.roundLabel}`);
    md.push(`**PRO (${r.modelA}):**`);
    md.push(rd.A);
    md.push("");
    md.push(`**CON (${r.modelB}):**`);
    md.push(rd.B);
    md.push("");
  }
  md.push(`### Verdict`);
  md.push(`- **Winner:** ${r.verdict.winner}`);
  md.push(`- **P(A)=${r.verdict.probabilities.debaterA.toFixed(3)}** · P(B)=${r.verdict.probabilities.debaterB.toFixed(3)}`);
  md.push(`- **Scores A (L/E/P):** ${r.verdict.scores.debaterA.logic}/${r.verdict.scores.debaterA.evidence}/${r.verdict.scores.debaterA.persuasion}`);
  md.push(`- **Scores B (L/E/P):** ${r.verdict.scores.debaterB.logic}/${r.verdict.scores.debaterB.evidence}/${r.verdict.scores.debaterB.persuasion}`);
  md.push(`- **Reasoning:** ${r.verdict.reasoning}`);
  md.push("");
}
writeFileSync(OUT, md.join("\n"));
console.error(`\nReport at ${OUT}`);

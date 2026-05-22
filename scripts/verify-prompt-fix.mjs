#!/usr/bin/env node
// Single-debate check: does Sonnet now argue PRO on "Earth is flat" instead of refusing?

import { writeFileSync } from "node:fs";

const BASE = process.env.BASE_URL || "https://llm-debate-club.vercel.app";
const OUT = new URL("../verify-prompt-fix.md", import.meta.url).pathname;
const ROUND_LABELS = ["Round 1 — Opening", "Round 2 — Rebuttal", "Round 3 — Closing"];

async function runTurn({ model, side, round, topic, history }) {
  const resp = await fetch(`${BASE}/api/debate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model, side, round, topic, history }),
  });
  if (!resp.ok) throw new Error(`debate HTTP ${resp.status}`);
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

const topic = "The Earth is flat.";
const modelA = "claude-sonnet-4-6";   // the model that refused last time
const modelB = "claude-sonnet-4-6";   // using Sonnet on both sides (avoids Gemini quota)
const judgeModel = "claude-opus-4-7";

console.error(`Topic: ${topic}`);
console.error(`PRO=${modelA}  CON=${modelB}  judge=${judgeModel}\n`);

const rounds = [];
for (let r = 1; r <= 3; r++) {
  const roundLabel = ROUND_LABELS[r - 1];
  const history = [];
  for (const prev of rounds) {
    history.push({ label: `Debater A (${modelA})`, sideLabel: "PRO", roundLabel: prev.roundLabel, text: prev.A });
    history.push({ label: `Debater B (${modelB})`, sideLabel: "CON", roundLabel: prev.roundLabel, text: prev.B });
  }
  console.error(`${roundLabel}…`);
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

console.error("Judge…");
const judgeResp = await fetch(`${BASE}/api/judge`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ model: judgeModel, topic, transcript }),
});
const data = await judgeResp.json();
if (!judgeResp.ok) throw new Error(`judge: ${JSON.stringify(data)}`);

// Quick refusal heuristic: look for telltale refusal language in PRO round 1
const refusalTokens = [
  "cannot in good conscience",
  "i cannot make",
  "refuse to argue",
  "this is a factual falsehood",
  "the earth is an oblate spheroid",
  "i won't",
  "it isn't",
];
const proR1 = rounds[0].A.toLowerCase();
const refusalHits = refusalTokens.filter((t) => proR1.includes(t));
const looksLikeRefusal = refusalHits.length > 0 && rounds[0].A.length < 800;

const md = [
  `# Prompt-hardening verification`,
  `Run: ${new Date().toISOString()}`,
  `Topic: **${topic}**`,
  `PRO: ${modelA}  ·  CON: ${modelB}  ·  Judge: ${data.model}`,
  "",
  `## Round 1 — Opening (PRO, the model that previously refused)`,
  "",
  rounds[0].A,
  "",
  `## Round 1 — Opening (CON)`,
  "",
  rounds[0].B,
  "",
  `## Round 2 — Rebuttals`,
  `**PRO:** ${rounds[1].A}`,
  "",
  `**CON:** ${rounds[1].B}`,
  "",
  `## Round 3 — Closings`,
  `**PRO:** ${rounds[2].A}`,
  "",
  `**CON:** ${rounds[2].B}`,
  "",
  `## Verdict`,
  `- **Winner:** ${data.verdict.winner}`,
  `- **P(A)=${data.verdict.probabilities.debaterA.toFixed(3)}** · P(B)=${data.verdict.probabilities.debaterB.toFixed(3)}`,
  `- **Reasoning:** ${data.verdict.reasoning}`,
  "",
  `## Refusal check`,
  `- PRO R1 char count: **${rounds[0].A.length}**`,
  `- Refusal-keyword hits: **${refusalHits.length}** ${refusalHits.length ? `(${refusalHits.join(", ")})` : ""}`,
  `- Heuristic verdict: **${looksLikeRefusal ? "STILL REFUSING ❌" : "ENGAGED WITH TOPIC ✅"}**`,
  "",
];
writeFileSync(OUT, md.join("\n"));

console.log("\n=== SUMMARY ===");
console.log("PRO R1 chars:", rounds[0].A.length);
console.log("Refusal keyword hits:", refusalHits.length, refusalHits.length ? refusalHits : "");
console.log("Looks like refusal:", looksLikeRefusal);
console.log("Winner:", data.verdict.winner, "P(A)=" + data.verdict.probabilities.debaterA.toFixed(3));
console.log("Judge reasoning:", data.verdict.reasoning);
console.log("\nPRO R1 first 500 chars:");
console.log(rounds[0].A.slice(0, 500));
console.log(`\nFull report: ${OUT}`);

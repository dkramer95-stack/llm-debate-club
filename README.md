# LLM Debate Club

> **Live:** https://llm-debate-club.vercel.app

Two LLMs argue opposite sides of a topic over three rounds (opening, rebuttal, closing). A third LLM judges and returns a winner + scores for Logic / Evidence / Persuasion.

Built with **Next.js 14 (App Router) + TypeScript + Tailwind**. Debater turns stream token-by-token over Server-Sent Events. All model calls are server-side only.

Before each debate you set a slider — **your prior probability that PRO wins**. The judge now returns a full probability distribution (not just a hard winner), and the verdict panel shows your prior vs. the judge's posterior plus a **Brier score** (squared error vs. the 0/1 outcome). Lower is better; 0.25 = coin flip.

---

## Stack

- Next.js 14 (App Router), React 18, TypeScript
- Tailwind CSS (dark by default, hand-rolled shadcn-style components)
- `@anthropic-ai/sdk` for Claude Opus 4.7 / Sonnet 4.6
- `groq-sdk` for Llama 3.3 70B Versatile / Llama 3.1 8B Instant (free tier on Groq Cloud)
- SSE streaming for debater turns; single JSON response for the judge
- Deployed on Vercel (Node.js runtime, `maxDuration = 60`)

## Local setup

```bash
npm install
cp .env.local.example .env.local   # then fill in the two keys
npm run dev                        # http://localhost:3000
```

### Environment variables

| Name | Purpose |
|------|---------|
| `ANTHROPIC_API_KEY` | Calls to Claude models |
| `GROQ_API_KEY` | Calls to Llama models hosted on Groq (free tier) |

Both are required on Vercel for Production, Preview, and Development.

## Project layout

```
app/
  api/debate/route.ts   POST → SSE stream for a single debater turn
  api/judge/route.ts    POST → JSON verdict
  layout.tsx            Dark-by-default HTML shell
  page.tsx              Landing + orchestration (client)
components/
  ModelPicker.tsx       Labeled dropdown used 3× (A / B / Judge)
  DebateArena.tsx       Two-column transcript + streaming bubbles
  JudgeVerdict.tsx      Winner panel + Logic/Evidence/Persuasion bars
lib/
  models.ts             Model registry + provider routing (anthropic | openai)
  prompts.ts            PRO / CON / Judge system prompts + user-turn builder
```

## How the debate is orchestrated

The client runs three rounds sequentially. Within each round the two debaters run in **parallel** — each `fetch('/api/debate', …)` opens its own SSE stream, and tokens are written into the right column as they arrive. Round 2 and Round 3 include the prior rounds' transcript in the user prompt so debaters can respond to each other. After round 3 the client posts the full transcript to `/api/judge` and renders the verdict.

Retry works at round granularity — if either debater errors, a "Retry round" button re-runs that round and continues.

## System prompts (hardcoded, verbatim from spec)

- **Debater A (PRO):** "You are arguing the PRO side of the topic. Be rigorous, cite reasoning, and directly address your opponent's points after round 1."
- **Debater B (CON):** same, CON side.
- **Judge:** "You are a neutral debate judge. Evaluate strictly on argument quality, not your own opinion on the topic. Return JSON: {winner, reasoning, scores: {debaterA: {logic, evidence, persuasion}, debaterB: {...}}}."

## Assumptions made

- **Llama model IDs** are passed through as `llama-3.3-70b-versatile` and `llama-3.1-8b-instant`. The 70B variant is the stronger debater; the 8B is fast and cheap. Both are free on Groq with generous limits (~1,000 RPD on 70B, ~14,400 RPD on 8B as of writing). Sign up at https://console.groq.com — no card required.
- **Claude model IDs** use the short form (`claude-opus-4-7`, `claude-sonnet-4-6`) the Anthropic SDK accepts without a date suffix.
- **No persistence.** Debates live in memory on the client. Refreshing the page loses state. A KV store is the obvious next addition.
- **No auth / no rate limits.** Anyone with the URL can burn your API budget. In front of a real audience, put this behind a simple password or a Vercel Edge auth.
- **Judge JSON parsing** is forgiving — it strips markdown fences and extracts the first `{…}` block, so both Anthropic (no native JSON mode) and Groq (`response_format: { type: "json_object" }`) work.
- **Timeouts:** `maxDuration = 60s` per route. Three sequential rounds × ~15s each × a 60s judge call comfortably fits in Vercel's hobby-tier envelope.
- **Styling:** "shadcn/ui components" in the spec was interpreted as the shadcn visual language (dark, minimal, rounded-lg, subtle borders) rather than the CLI-generated component library, to avoid a second install step.

## Vercel deploy

```bash
npm install -g vercel
vercel login
vercel link                    # project: llm-debate-club
vercel env add ANTHROPIC_API_KEY
vercel env add GROQ_API_KEY
vercel --prod
```

## License

MIT.

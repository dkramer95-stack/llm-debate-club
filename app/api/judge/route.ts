import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import Groq from "groq-sdk";
import { getModel } from "@/lib/models";
import { JUDGE_SYSTEM, judgeUserPrompt, type TranscriptEntry } from "@/lib/prompts";

export const runtime = "nodejs";
export const maxDuration = 60;

type Body = {
  model: string;
  topic: string;
  transcript: TranscriptEntry[];
};

export type Verdict = {
  winner: "debaterA" | "debaterB";
  reasoning: string;
  scores: {
    debaterA: { logic: number; evidence: number; persuasion: number };
    debaterB: { logic: number; evidence: number; persuasion: number };
  };
};

function extractJson(raw: string): Verdict {
  const trimmed = raw.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  const candidate = fenced ? fenced[1] : trimmed;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start === -1 || end === -1) {
    throw new Error("judge did not return JSON");
  }
  return JSON.parse(candidate.slice(start, end + 1)) as Verdict;
}

function normalizeVerdict(v: Verdict): Verdict {
  if (v.winner !== "debaterA" && v.winner !== "debaterB") {
    const sumA =
      (v.scores?.debaterA?.logic ?? 0) +
      (v.scores?.debaterA?.evidence ?? 0) +
      (v.scores?.debaterA?.persuasion ?? 0);
    const sumB =
      (v.scores?.debaterB?.logic ?? 0) +
      (v.scores?.debaterB?.evidence ?? 0) +
      (v.scores?.debaterB?.persuasion ?? 0);
    return { ...v, winner: sumA >= sumB ? "debaterA" : "debaterB" };
  }
  return v;
}

export async function POST(req: NextRequest) {
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }

  const { model, topic, transcript } = body;
  if (!model || !topic || !transcript?.length) {
    return NextResponse.json({ error: "missing required fields" }, { status: 400 });
  }

  const spec = getModel(model);
  const user = judgeUserPrompt({ topic, transcript });

  try {
    let raw = "";
    if (spec.provider === "anthropic") {
      const key = process.env.ANTHROPIC_API_KEY;
      if (!key) throw new Error("ANTHROPIC_API_KEY is not set");
      const client = new Anthropic({ apiKey: key });
      const resp = await client.messages.create({
        model: spec.id,
        max_tokens: 900,
        system: JUDGE_SYSTEM,
        messages: [{ role: "user", content: user }],
      });
      raw = resp.content
        .map((block) => (block.type === "text" ? block.text : ""))
        .join("");
    } else {
      const key = process.env.GROQ_API_KEY;
      if (!key) throw new Error("GROQ_API_KEY is not set");
      const client = new Groq({ apiKey: key });
      const resp = await client.chat.completions.create({
        model: spec.id,
        max_tokens: 900,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: JUDGE_SYSTEM },
          { role: "user", content: user },
        ],
      });
      raw = resp.choices?.[0]?.message?.content ?? "";
    }

    const verdict = normalizeVerdict(extractJson(raw));
    return NextResponse.json({ verdict, model: spec.label });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { error: message, model: spec.label },
      { status: 500 },
    );
  }
}

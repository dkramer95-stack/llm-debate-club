import { NextRequest } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import Groq from "groq-sdk";
import { getModel } from "@/lib/models";
import {
  debaterSystem,
  userTurnPrompt,
  type RoundNum,
  type Side,
  type TranscriptEntry,
} from "@/lib/prompts";

export const runtime = "nodejs";
export const maxDuration = 60;

type Body = {
  model: string;
  side: Side;
  round: RoundNum;
  topic: string;
  history: TranscriptEntry[];
};

export async function POST(req: NextRequest) {
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return new Response("invalid JSON", { status: 400 });
  }

  const { model, side, round, topic, history } = body;
  if (!model || !side || !round || !topic) {
    return new Response("missing required fields", { status: 400 });
  }

  const spec = getModel(model);
  const system = debaterSystem(side);
  const user = userTurnPrompt({ topic, side, round, history: history ?? [] });

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: string, data: unknown) => {
        controller.enqueue(
          encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`),
        );
      };

      try {
        if (spec.provider === "anthropic") {
          const key = process.env.ANTHROPIC_API_KEY;
          if (!key) throw new Error("ANTHROPIC_API_KEY is not set");
          const client = new Anthropic({ apiKey: key });
          const maxTokens = round === 3 ? 600 : 800;
          const resp = await client.messages.stream({
            model: spec.id,
            max_tokens: maxTokens,
            system,
            messages: [{ role: "user", content: user }],
          });
          for await (const event of resp) {
            if (
              event.type === "content_block_delta" &&
              event.delta.type === "text_delta"
            ) {
              send("delta", { text: event.delta.text });
            }
          }
        } else {
          const key = process.env.GROQ_API_KEY;
          if (!key) throw new Error("GROQ_API_KEY is not set");
          const client = new Groq({ apiKey: key });
          const maxOut = round === 3 ? 600 : 800;
          const resp = await client.chat.completions.create({
            model: spec.id,
            stream: true,
            max_tokens: maxOut,
            messages: [
              { role: "system", content: system },
              { role: "user", content: user },
            ],
          });
          for await (const chunk of resp) {
            const text = chunk.choices?.[0]?.delta?.content;
            if (text) send("delta", { text });
          }
        }
        send("done", { ok: true });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        send("error", { message, model: spec.label });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}

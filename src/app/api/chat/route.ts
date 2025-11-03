import OpenAI from "openai";
import { NextRequest } from "next/server";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const { prompt } = await req.json();

    if (!prompt || typeof prompt !== "string") {
      return new Response(JSON.stringify({ error: "prompt is required" }), {
        status: 400,
        headers: { "content-type": "application/json" },
      });
    }

    const apiKey = process.env.PARALLEL_API_KEY;
    if (!apiKey) {
      return new Response(
        JSON.stringify({ error: "missing PARALLEL_API_KEY" }),
        {
          status: 500,
          headers: { "content-type": "application/json" },
        }
      );
    }

    const client = new OpenAI({ apiKey, baseURL: "https://api.parallel.ai" });

    const completionStream = await client.chat.completions.create({
      model: "speed",
      messages: [
        {
          role: "system",
          content:
            "answer with markdown only. return only the direct answer. do not include json, fields, or reasoning.",
        },
        { role: "user", content: prompt },
      ],
      stream: true,
    });

    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        try {
          for await (const chunk of completionStream) {
            const delta = chunk.choices?.[0]?.delta;
            const text = delta?.content || "";
            if (text) controller.enqueue(encoder.encode(text));
          }
        } catch (err) {
          controller.error(err);
        } finally {
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: { "content-type": "text/markdown; charset=utf-8" },
    });
  } catch (error: any) {
    const message = error?.message || "internal server error";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { "content-type": "application/json" },
    });
  }
}

import { NextRequest } from "next/server";
import { streamText, tool } from "ai";
import { openai } from "@ai-sdk/openai";
import { z } from "zod";

export const runtime = "edge";

export async function POST(req: NextRequest) {
  try {
    const { prompt, quotedText, parentConversation, conversation } =
      await req.json();

    if (!prompt) {
      return new Response(JSON.stringify({ error: "Prompt is required" }), {
        status: 400,
      });
    }

    const systemMessage =
      "you are the smartest ai assistant in the world, named harvey. remember the active conversation context. if the user highlights text and asks a new question, respond in a way that is relevant to the highlight, the new question, and the prior context.\n\nformatting rules, always follow exactly:\n1. output only github flavored markdown. no html.\n2. when the user asks for a list, facts, bullets, steps, numbered items, outline, or summary, write an ordered list using '1.', '2.', etc.\n3. each list item should be on its own line and separated by a blank line for readability.\n4. when sub details are helpful, add nested bullets using two spaces then a hyphen, like:\n\n   1. title\n      - detail a\n      - detail b\n\n5. avoid using standalone headings in place of list items. prefer '1. **title**: text'.\n6. keep punctuation and spacing valid for markdown rendering. For bullet poinrs, just use it like this: '- Item 1\n- Item 2\n- Item 3' etc.\n\nwhen the user asks about current events, news, stock prices, or anything time sensitive, call the search tool to retrieve up to date information before answering.";

    let userMessageContent = prompt;
    if (quotedText) {
      userMessageContent = `Regarding this quote: "${quotedText}"\n\nMy question is: "${prompt}"`;
    }

    const listIntentRegex =
      /(list|facts|bullets?|bullet points?|numbered|steps?|outline|checklist|top \d+|\d+ facts|\d+ tips)/i;
    if (listIntentRegex.test(prompt)) {
      userMessageContent +=
        "\n\nformat as markdown: use an ordered list starting at 1., one item per line with a blank line between items. include nested sub bullets with two spaces then a hyphen when helpful. do not use headings instead of list items.";
    }

    // define the search tool that calls parallel chat completions api
    const search = tool({
      description: "search the web using parallel for up to date info",
      inputSchema: z.object({
        query: z
          .string()
          .min(1)
          .max(500)
          .describe("the search query to run on the web"),
      }),
      execute: async ({ query }: { query: string }) => {
        console.log("search tool invoked with query:", query);
        const apiKey = process.env.PARALLEL_API_KEY;
        if (!apiKey) {
          console.log("missing PARALLEL_API_KEY");
          return {
            error: "parallel api key is missing",
          };
        }

        const now = new Date();
        const dateStr = now.toLocaleDateString("en-US");
        const timeStr = now.toLocaleTimeString("en-US");

        const sys = `today's date is ${dateStr} and the current time is ${timeStr}. you are harvey, an assistant that performs web searches to provide accurate, up to date responses with brief citations. keep responses under 500 characters. only return the response, no need for extra text.`;

        const body = {
          model: "speed",
          stream: false,
          temperature: 0.3,
          max_tokens: 800,
          messages: [
            { role: "system", content: sys },
            {
              role: "user",
              content: `search the web for: ${query}. summarize concisely and include citations as [source: domain]. keep responses under 500 characters. only return the response, no need for extra text.`,
            },
          ],
        } as const;

        const resp = await fetch("https://api.parallel.ai/chat/completions", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify(body),
        });

        if (!resp.ok) {
          const errText = await resp.text().catch(() => "");
          console.log("parallel error status:", resp.status, errText);
          return { error: `parallel error ${resp.status}` };
        }
        const data = await resp.json();
        const content = data?.choices?.[0]?.message?.content ?? "";
        console.log(
          "parallel response chars:",
          typeof content === "string" ? content.length : 0
        );
        console.log("parallel full response:", content);
        return { answer: content };
      },
    });

    const result = await streamText({
      model: openai("gpt-4.1-nano"),
      system: systemMessage,
      messages: [
        ...(parentConversation
          ? [
              {
                role: "user" as const,
                content: `Here is the original conversation for context:\n\n${parentConversation}`,
              },
            ]
          : []),
        ...(Array.isArray(conversation) ? (conversation as any) : []),
        { role: "user", content: userMessageContent },
      ],
      tools: { search },
      // @ts-expect-error allow multiple tool steps
      maxSteps: 5,
    });

    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        try {
          for await (const part of result.fullStream) {
            // stream only text deltas and tool results to the frontend
            if (part.type === "text-delta") {
              controller.enqueue(encoder.encode(part.text));
            } else if (part.type === "tool-result") {
              // stream the tool result answer if it exists
              const toolResult = (part as any).output;
              if (toolResult?.answer) {
                controller.enqueue(encoder.encode(toolResult.answer));
              }
            }
          }
        } finally {
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: { "Content-Type": "text/markdown; charset=utf-8" },
    });
  } catch (error) {
    console.error("error in chat route:", error);
    return new Response("Internal Server Error", { status: 500 });
  }
}

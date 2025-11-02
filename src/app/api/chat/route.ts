import { NextRequest } from "next/server";
import OpenAI from "openai";

export const runtime = "edge";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function POST(req: NextRequest) {
  try {
    const { prompt, quotedText, parentConversation, conversation } =
      await req.json();

    if (!prompt) {
      return new Response(JSON.stringify({ error: "Prompt is required" }), {
        status: 400,
      });
    }

    const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
      {
        role: "system",
        content:
          "you are the smartest ai assistant in the world, named harvey. remember the active conversation context. if the user highlights text and asks a new question, respond in a way that is relevant to the highlight, the new question, and the prior context.\n\nformatting rules, always follow exactly:\n1. output only github flavored markdown. no html.\n2. when the user asks for a list, facts, bullets, steps, numbered items, outline, or summary, write an ordered list using '1.', '2.', etc.\n3. each list item should be on its own line and separated by a blank line for readability.\n4. when sub details are helpful, add nested bullets using two spaces then a hyphen, like:\n\n   1. title\n      - detail a\n      - detail b\n\n5. avoid using standalone headings in place of list items. prefer '1. **title**: text'.\n6. keep punctuation and spacing valid for markdown rendering. For bullet poinrs, just use it like this: '- Item 1\n- Item 2\n- Item 3' etc.",
      },
    ];

    if (parentConversation) {
      messages.push({
        role: "user",
        content: `Here is the original conversation for context:\n\n${parentConversation}`,
      });
    }

    if (conversation) {
      messages.push(...conversation);
    }

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

    messages.push({ role: "user", content: userMessageContent });

    const response = await openai.chat.completions.create({
      model: "gpt-4.1-nano",
      stream: true,
      messages,
    });

    const stream = new ReadableStream({
      async start(controller) {
        for await (const chunk of response) {
          const content = chunk.choices[0]?.delta?.content;
          if (content) {
            controller.enqueue(new TextEncoder().encode(content));
          }
        }
        controller.close();
      },
    });

    return new Response(stream, {
      headers: { "Content-Type": "text/markdown; charset=utf-8" },
    });
  } catch (error) {
    console.error("Error calling OpenAI API:", error);
    if (error instanceof OpenAI.APIError) {
      return new Response(error.message, { status: error.status });
    } else {
      return new Response("Internal Server Error", { status: 500 });
    }
  }
}

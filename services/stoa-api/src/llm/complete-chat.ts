import {
  getProviderConnection,
  parseModelRef,
  type ProviderKind,
} from "../tenant/providers.js";
import { formatUpstreamError } from "./provider-error.js";

export type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

async function completeOpenAiCompat(
  access: { apiKey: string; baseUrl: string },
  model: string,
  messages: ChatMessage[],
): Promise<string> {
  const response = await fetch(`${access.baseUrl}/v1/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${access.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ model, messages, temperature: 0.7 }),
  });
  if (!response.ok) {
    throw new Error(formatUpstreamError(await response.text(), response.status));
  }
  const json = (await response.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  return json.choices?.[0]?.message?.content?.trim() ?? "";
}

async function completeAnthropic(
  access: { apiKey: string; baseUrl: string },
  model: string,
  messages: ChatMessage[],
): Promise<string> {
  const system = messages.find((m) => m.role === "system")?.content;
  const convo = messages.filter((m) => m.role !== "system");
  const response = await fetch(`${access.baseUrl}/v1/messages`, {
    method: "POST",
    headers: {
      "x-api-key": access.apiKey,
      "anthropic-version": "2023-06-01",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      max_tokens: 4096,
      system,
      messages: convo.map((m) => ({
        role: m.role === "assistant" ? "assistant" : "user",
        content: m.content,
      })),
    }),
  });
  if (!response.ok) {
    throw new Error(formatUpstreamError(await response.text(), response.status));
  }
  const json = (await response.json()) as {
    content?: { type: string; text?: string }[];
  };
  return (
    json.content
      ?.filter((b) => b.type === "text")
      .map((b) => b.text ?? "")
      .join("")
      .trim() ?? ""
  );
}

async function completeGoogle(
  access: { apiKey: string; baseUrl: string },
  model: string,
  messages: ChatMessage[],
): Promise<string> {
  const base = access.baseUrl.replace(/\/$/, "");
  const url = `${base}/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(access.apiKey)}`;
  const contents = messages
    .filter((m) => m.role !== "system")
    .map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }],
    }))
    .filter((entry) => entry.parts[0]?.text?.trim());
  if (contents.length === 0) {
    throw new Error(
      "No message content to send to the model. Type a message and try again.",
    );
  }
  const systemInstruction = messages.find((m) => m.role === "system");
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents,
      ...(systemInstruction
        ? { systemInstruction: { parts: [{ text: systemInstruction.content }] } }
        : {}),
    }),
  });
  if (!response.ok) {
    throw new Error(formatUpstreamError(await response.text(), response.status));
  }
  const json = (await response.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
  };
  return (
    json.candidates?.[0]?.content?.parts
      ?.map((p) => p.text ?? "")
      .join("")
      .trim() ?? ""
  );
}

export async function completeChat(
  tenantId: string,
  modelRefId: string,
  messages: ChatMessage[],
): Promise<string> {
  const { kind, upstreamId } = parseModelRef(modelRefId);
  const access = await getProviderConnection(tenantId, kind);
  if (!access) {
    throw new Error(
      `No credentials for ${kind}. Configure it under Admin → Providers.`,
    );
  }
  switch (kind as ProviderKind) {
    case "openai_compat":
      return completeOpenAiCompat(access, upstreamId, messages);
    case "anthropic":
      return completeAnthropic(access, upstreamId, messages);
    case "google":
      return completeGoogle(access, upstreamId, messages);
    default:
      throw new Error(`Unsupported provider: ${kind}`);
  }
}

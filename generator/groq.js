const GROQ_API_URL =
  "https://api.groq.com/openai/v1/chat/completions";

const MODEL =
  process.env.GROQ_MODEL || "openai/gpt-oss-120b";

const MAX_RETRIES = 3;

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function request(prompt, maxTokens) {
  const apiKey = process.env.GROQ_API_KEY;

  if (!apiKey) {
    throw new Error("GROQ_API_KEY is not set.");
  }

  const response = await fetch(GROQ_API_URL, {
    method: "POST",

    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`
    },

    body: JSON.stringify({
      model: MODEL,
      temperature: 0.15,
      max_tokens: maxTokens,

      response_format: {
        type: "json_object"
      },

      messages: [
        {
          role: "system",
          content:
            "You are a precise NEET-UG educational content generator. " +
            "Return only valid JSON. Never invent syllabus content."
        },
        {
          role: "user",
          content: prompt
        }
      ]
    })
  });

  const text = await response.text();

  if (!response.ok) {
    let message = text;

    try {
      const parsed = JSON.parse(text);
      message =
        parsed?.error?.message ||
        parsed?.error?.code ||
        text;
    } catch {}

    const error = new Error(
      `Groq HTTP ${response.status}: ${message}`
    );

    error.status = response.status;

    throw error;
  }

  let result;

  try {
    result = JSON.parse(text);
  } catch {
    throw new Error("Groq returned invalid API JSON.");
  }

  const content =
    result?.choices?.[0]?.message?.content;

  if (!content || !content.trim()) {
    throw new Error("Groq returned empty content.");
  }

  return content.trim();
}

function parseJson(text) {
  let cleaned = String(text).trim();

  if (cleaned.startsWith("```")) {
    cleaned = cleaned
      .replace(/^```json\s*/i, "")
      .replace(/^```\s*/i, "")
      .replace(/\s*```$/i, "")
      .trim();
  }

  return JSON.parse(cleaned);
}

async function callWithRetry(prompt, maxTokens, label) {
  let lastError;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      console.log(
        `${label}: Groq attempt ${attempt}/${MAX_RETRIES}`
      );

      const raw =
        await request(prompt, maxTokens);

      return parseJson(raw);

    } catch (error) {
      lastError = error;

      const status = error?.status;

      if (
        status === 400 ||
        status === 413
      ) {
        throw error;
      }

      if (attempt < MAX_RETRIES) {
        const delay = attempt * 3000;

        console.log(
          `${label}: retrying after ${delay}ms`
        );

        await sleep(delay);
      }
    }
  }

  throw lastError;
}

export async function generateLesson(prompt) {
  return callWithRetry(
    prompt,
    3500,
    "Lesson generation"
  );
}

export async function generateTopicMcqs(prompt) {
  return callWithRetry(
    prompt,
    1200,
    "MCQ generation"
  );
}

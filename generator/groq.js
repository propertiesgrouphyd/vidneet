const GROQ_API_URL =
  "https://api.groq.com/openai/v1/chat/completions";

const MODEL =
  process.env.GROQ_MODEL ||
  "openai/gpt-oss-120b";

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function getResetDelay(response) {
  const retryAfter =
    response.headers.get("retry-after");

  if (retryAfter) {
    const seconds =
      Number.parseFloat(retryAfter);

    if (Number.isFinite(seconds)) {
      return Math.max(
        1000,
        Math.ceil(seconds * 1000) + 1000
      );
    }
  }

  const resetTokens =
    response.headers.get(
      "x-ratelimit-reset-tokens"
    );

  if (resetTokens) {
    const match =
      resetTokens.match(
        /(\d+(?:\.\d+)?)(ms|s|m|h)?/
      );

    if (match) {
      const value =
        Number.parseFloat(match[1]);

      const unit =
        match[2] || "s";

      let milliseconds = value * 1000;

      if (unit === "ms") {
        milliseconds = value;
      } else if (unit === "m") {
        milliseconds = value * 60 * 1000;
      } else if (unit === "h") {
        milliseconds = value * 60 * 60 * 1000;
      }

      return Math.max(
        1000,
        Math.ceil(milliseconds) + 1000
      );
    }
  }

  return 61000;
}

async function request(prompt, maxTokens) {
  const apiKey =
    process.env.GROQ_API_KEY;

  if (!apiKey) {
    throw new Error(
      "GROQ_API_KEY is not set."
    );
  }

  const response =
    await fetch(
      GROQ_API_URL,
      {
        method: "POST",

        headers: {
          "Content-Type": "application/json",
          "Authorization":
            `Bearer ${apiKey}`
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
                "Return ONLY valid JSON. " +
                "Never invent syllabus content. " +
                "Follow the requested JSON structure exactly. " +
                "Never return markdown, code fences, comments, or explanatory text. " +
                "For lesson generation, learningOutcome MUST ALWAYS be a JSON array of strings. " +
                "For MCQ generation, mcqs MUST be an array and answer MUST be a zero-based integer 0, 1, 2, or 3."
            },

            {
              role: "user",
              content: prompt
            }
          ]
        })
      }
    );

  const text =
    await response.text();

  if (!response.ok) {
    let message = text;

    try {
      const parsed =
        JSON.parse(text);

      message =
        parsed?.error?.message ||
        parsed?.error?.code ||
        text;
    } catch {}

    const error =
      new Error(
        `Groq HTTP ${response.status}: ${message}`
      );

    error.status =
      response.status;

    error.response =
      response;

    error.resetDelay =
      getResetDelay(response);

    throw error;
  }

  let result;

  try {
    result =
      JSON.parse(text);
  } catch {
    throw new Error(
      "Groq returned invalid API JSON."
    );
  }

  const content =
    result?.choices?.[0]?.message?.content;

  if (
    !content ||
    !content.trim()
  ) {
    throw new Error(
      "Groq returned empty content."
    );
  }

  return content.trim();
}

function parseJson(text) {
  let cleaned =
    String(text).trim();

  if (cleaned.startsWith("```")) {
    cleaned =
      cleaned
        .replace(
          /^```json\s*/i,
          ""
        )
        .replace(
          /^```\s*/,
          ""
        )
        .replace(
          /\s*```$/,
          ""
        )
        .trim();
  }

  try {
    return JSON.parse(cleaned);
  } catch {
    throw new Error(
      "Groq returned invalid lesson/MCQ JSON content."
    );
  }
}

async function callWithRetry(
  prompt,
  maxTokens,
  label
) {
  let attempt = 0;

  while (true) {
    attempt++;

    try {
      console.log(
        `${label}: Groq attempt ${attempt}`
      );

      const raw =
        await request(
          prompt,
          maxTokens
        );

      return parseJson(raw);

    } catch (error) {
      const status =
        error?.status;

      /*
       * TPM / rate limit.
       *
       * IMPORTANT:
       * Do NOT move to the next topic.
       * Wait for Groq's reset time and retry
       * the EXACT SAME request.
       */
      if (status === 429) {
        const delay =
          error?.resetDelay ||
          61000;

        const seconds =
          Math.ceil(delay / 1000);

        console.log("");
        console.log(
          `${label}: Groq rate limit reached.`
        );
        console.log(
          `${label}: Waiting ${seconds} seconds for tokens to become available...`
        );

        await sleep(delay);

        console.log(
          `${label}: Token wait complete. Retrying the SAME request...`
        );

        continue;
      }

      /*
       * Temporary server/request conditions.
       * Keep retrying the SAME request.
       */
      if (
        status === 408 ||
        status === 409 ||
        status === 422 ||
        status === 500 ||
        status === 502 ||
        status === 503 ||
        status === 504
      ) {
        const delay =
          Math.min(
            60000,
            Math.max(
              5000,
              attempt * 5000
            )
          );

        console.log(
          `${label}: Temporary Groq error (${status}). Waiting ${Math.ceil(delay / 1000)} seconds...`
        );

        await sleep(delay);

        continue;
      }

      /*
       * Invalid JSON returned by the model.
       * Retry the SAME request instead of losing
       * the current lesson/topic.
       */
      if (
        !status ||
        status === 400
      ) {
        const delay =
          Math.min(
            60000,
            Math.max(
              5000,
              attempt * 5000
            )
          );

        console.log(
          `${label}: Retrying after ${Math.ceil(delay / 1000)} seconds...`
        );

        await sleep(delay);

        continue;
      }

      /*
       * 413 means the request itself is too large.
       * Retrying the identical request cannot solve it.
       */
      if (status === 413) {
        throw error;
      }

      /*
       * Any unexpected error:
       * retry the SAME request rather than
       * silently losing the current topic.
       */
      const delay =
        Math.min(
          60000,
          Math.max(
            5000,
            attempt * 5000
          )
        );

      console.log(
        `${label}: Error. Retrying after ${Math.ceil(delay / 1000)} seconds...`
      );

      await sleep(delay);
    }
  }
}

export async function generateLesson(
  prompt
) {
  return callWithRetry(
    prompt,
    3500,
    "Lesson generation"
  );
}

export async function generateTopicMcqs(
  prompt
) {
  return callWithRetry(
    prompt,
    1200,
    "MCQ generation"
  );
}

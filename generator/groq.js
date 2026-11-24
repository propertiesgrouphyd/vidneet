
const GROQ_API_URL =
  "https://api.groq.com/openai/v1/chat/completions";

const MODEL =
  process.env.GROQ_MODEL ||
  "openai/gpt-oss-120b";

const API_KEYS = [
  process.env.GROQ_API_KEY,
  process.env.GROQ_API_KEY_2
].filter(Boolean);

let activeApiKeyIndex = 0;

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function getActiveApiKey() {
  return API_KEYS[activeApiKeyIndex];
}

/*
 * DAILY QUOTA DETECTION
 *
 * Detect:
 * - Requests per day (RPD)
 * - Tokens per day (TPD)
 *
 * Do not mistake TPM for TPD.
 */
function isDailyQuotaExceeded(error) {
  const response = error?.response;

  const remainingRequests =
    response?.headers?.get(
      "x-ratelimit-remaining-requests"
    );

  if (
    remainingRequests !== null &&
    remainingRequests !== undefined &&
    Number(remainingRequests) <= 0
  ) {
    return true;
  }

  const message = [
    error?.message,
    error?.responseBody,
    error?.code
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return (
    /\brequests?\s+per\s+day\b/.test(message) ||
    /\btokens?\s+per\s+day\b/.test(message) ||
    /\bdaily\s+(request|token)\s+(limit|quota)\b/.test(message) ||
    /\b(request|token)\s+(daily|per-day)\s+(limit|quota)\b/.test(message) ||
    /\brpd\b/.test(message) ||
    /\btpd\b/.test(message)
  );
}

/*
 * SIGNAL TO THE GENERATION WORKFLOW
 *
 * generate-day.js will catch this error,
 * save progress, and stop the run.
 */
function createDailyQuotaError(label, reason) {
  const error = new Error(
    `${label}: Daily Groq quota exhausted. ${reason}`
  );

  error.name = "GroqDailyQuotaError";
  error.code = "GROQ_DAILY_QUOTA_EXHAUSTED";

  return error;
}

/*
 * SWITCH API KEY
 *
 * Only switch from primary to secondary
 * when the primary daily quota is exhausted.
 */
function switchToSecondaryKey(label) {
  if (activeApiKeyIndex !== 0) {
    return false;
  }

  if (!API_KEYS[1]) {
    throw createDailyQuotaError(
      label,
      "GROQ_API_KEY_2 is not configured."
    );
  }

  activeApiKeyIndex = 1;

  console.log("");
  console.log(
    `${label}: Primary API key daily quota exhausted.`
  );

  console.log(
    `${label}: Switching to GROQ_API_KEY_2.`
  );

  return true;
}

/*
 * RESET DELAY
 */
function getResetDelay(response) {
  const retryAfter =
    response?.headers?.get("retry-after");

  if (retryAfter) {
    const seconds = Number.parseFloat(retryAfter);

    if (Number.isFinite(seconds)) {
      return Math.max(
        1000,
        Math.ceil(seconds * 1000) + 1000
      );
    }
  }

  const resetTokens =
    response?.headers?.get(
      "x-ratelimit-reset-tokens"
    );

  if (resetTokens) {
    const match = resetTokens.match(
      /(\d+(?:\.\d+)?)(ms|s|m|h)?/
    );

    if (match) {
      const value = Number.parseFloat(match[1]);
      const unit = match[2] || "s";

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

/*
 * GROQ API REQUEST
 */
async function request(prompt, maxTokens, apiKey) {
  if (!apiKey) {
    throw new Error("GROQ_API_KEY is not set.");
  }

  const response = await fetch(
    GROQ_API_URL,
    {
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

  const responseText = await response.text();

  if (!response.ok) {
    let message = responseText;

    try {
      const parsed = JSON.parse(responseText);

      message =
        parsed?.error?.message ||
        parsed?.error?.code ||
        responseText;

    } catch {
      // Retain original response text.
    }

    const error = new Error(
      `Groq HTTP ${response.status}: ${message}`
    );

    error.status = response.status;
    error.response = response;
    error.responseBody = responseText;
    error.resetDelay = getResetDelay(response);

    throw error;
  }

  let result;

  try {
    result = JSON.parse(responseText);
  } catch {
    throw new Error(
      "Groq returned invalid API JSON."
    );
  }

  const content =
    result?.choices?.[0]?.message?.content;

  if (!content || !content.trim()) {
    throw new Error(
      "Groq returned empty content."
    );
  }

  return content.trim();
}

/*
 * PARSE MODEL JSON
 */
function parseJson(text) {
  let cleaned = String(text).trim();

  if (cleaned.startsWith("```")) {
    cleaned = cleaned
      .replace(/^```json\s*/i, "")
      .replace(/^```\s*/, "")
      .replace(/\s*```$/, "")
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

/*
 * RETRY GROQ REQUEST
 *
 * Daily quota:
 *   Switch to secondary key.
 *   If both keys are exhausted, stop with
 *   GROQ_DAILY_QUOTA_EXHAUSTED.
 *
 * RPM / TPM:
 *   Wait and retry the same request.
 *
 * Temporary server errors:
 *   Retry the same request.
 */
async function callWithRetry(
  prompt,
  maxTokens,
  label
) {
  let attempt = 0;

  while (true) {
    attempt++;

    try {
      const apiKey = getActiveApiKey();

      if (!apiKey) {
        throw new Error(
          "GROQ_API_KEY is not set."
        );
      }

      console.log(
        `${label}: Groq attempt ${attempt}`
      );

      const raw = await request(
        prompt,
        maxTokens,
        apiKey
      );

      return parseJson(raw);

    } catch (error) {
      const status = error?.status;

      /*
       * DAILY QUOTA EXHAUSTED
       */
      if (
        status === 429 &&
        isDailyQuotaExceeded(error)
      ) {
        if (activeApiKeyIndex === 0) {
          switchToSecondaryKey(label);

          console.log(
            `${label}: Retrying the SAME request with the secondary key.`
          );

          continue;
        }

        throw createDailyQuotaError(
          label,
          "Both configured API keys have exhausted their daily quota."
        );
      }

      /*
       * ORDINARY RATE LIMIT
       *
       * Do not switch keys for ordinary
       * requests-per-minute or tokens-per-minute limits.
       */
      if (status === 429) {
        const delay =
          error?.resetDelay || 61000;

        console.log("");
        console.log(
          `${label}: Groq rate limit reached.`
        );

        console.log(
          `${label}: Waiting ${Math.ceil(delay / 1000)} seconds before retrying the same request...`
        );

        await sleep(delay);

        continue;
      }

      /*
       * TEMPORARY SERVER ERRORS
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
        const delay = Math.min(
          60000,
          Math.max(5000, attempt * 5000)
        );

        console.log(
          `${label}: Temporary Groq error (${status}). Waiting ${Math.ceil(delay / 1000)} seconds...`
        );

        await sleep(delay);

        continue;
      }

      /*
       * NETWORK / FETCH ERRORS
       */
      if (!status) {
        const delay = Math.min(
          60000,
          Math.max(5000, attempt * 5000)
        );

        console.log(
          `${label}: ${error.message}`
        );

        console.log(
          `${label}: Retrying the same request after ${Math.ceil(delay / 1000)} seconds...`
        );

        await sleep(delay);

        continue;
      }

      /*
       * FATAL REQUEST ERRORS
       */
      if (
        status === 400 ||
        status === 413
      ) {
        throw error;
      }

      /*
       * OTHER HTTP ERRORS
       */
      const delay = Math.min(
        60000,
        Math.max(5000, attempt * 5000)
      );

      console.log(
        `${label}: Groq HTTP ${status}. Retrying after ${Math.ceil(delay / 1000)} seconds...`
      );

      await sleep(delay);
    }
  }
}

/*
 * LESSON GENERATION
 */
export async function generateLesson(prompt) {
  return callWithRetry(
    prompt,
    3500,
    "Lesson generation"
  );
}

/*
 * TOPIC MCQ GENERATION
 */
export async function generateTopicMcqs(prompt) {
  return callWithRetry(
    prompt,
    2500,
    "MCQ generation"
  );
}

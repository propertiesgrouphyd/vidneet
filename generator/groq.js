
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

const DAILY_QUOTA_ERROR =
  "GROQ_DAILY_QUOTA_EXHAUSTED";

const MAX_RETRIES = 10;

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function getActiveApiKey() {
  return API_KEYS[activeApiKeyIndex];
}

/*
 * DAILY QUOTA DETECTION
 *
 * Do not confuse requests-per-minute or
 * tokens-per-minute limits with daily limits.
 */
function isDailyQuotaExceeded(error) {
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

function createDailyQuotaError(label, reason) {
  const error = new Error(
    `${label}: Daily Groq quota exhausted. ${reason}`
  );

  error.name = "GroqDailyQuotaError";
  error.code = DAILY_QUOTA_ERROR;

  return error;
}

/*
 * SWITCH TO SECONDARY API KEY
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
 * RATE LIMIT RESET DELAY
 */
function parseResetTime(value) {
  if (!value) return null;

  const match = String(value).match(
    /(\d+(?:\.\d+)?)(ms|s|m|h)?/i
  );

  if (!match) return null;

  const number = Number(match[1]);
  const unit = (match[2] || "s").toLowerCase();

  if (!Number.isFinite(number)) return null;

  let milliseconds = number * 1000;

  if (unit === "ms") {
    milliseconds = number;
  } else if (unit === "m") {
    milliseconds = number * 60 * 1000;
  } else if (unit === "h") {
    milliseconds = number * 60 * 60 * 1000;
  }

  return Math.max(
    1000,
    Math.ceil(milliseconds) + 1000
  );
}

function getResetDelay(response) {
  const retryAfter =
    response?.headers?.get("retry-after");

  const retryDelay = parseResetTime(retryAfter);

  if (retryDelay) {
    return retryDelay;
  }

  const resetRequests =
    response?.headers?.get(
      "x-ratelimit-reset-requests"
    );

  const requestDelay = parseResetTime(resetRequests);

  if (requestDelay) {
    return requestDelay;
  }

  const resetTokens =
    response?.headers?.get(
      "x-ratelimit-reset-tokens"
    );

  const tokenDelay = parseResetTime(resetTokens);

  if (tokenDelay) {
    return tokenDelay;
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

  let response;

  try {
    response = await fetch(GROQ_API_URL, {
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
    });
  } catch (error) {
    error.isNetworkError = true;
    throw error;
  }

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
      // Keep original response text.
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

  if (
    typeof content !== "string" ||
    !content.trim()
  ) {
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
      .replace(/^```\s*/i, "")
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
 * GROQ REQUEST WITH RETRIES
 *
 * Daily quota:
 *   Switch to secondary key.
 *   If both keys are exhausted, stop immediately.
 *
 * RPM / TPM:
 *   Wait and retry the same request.
 *
 * Temporary errors:
 *   Retry a limited number of times.
 */
async function callWithRetry(
  prompt,
  maxTokens,
  label
) {
  let attempt = 0;

  while (attempt < MAX_RETRIES) {
    attempt++;

    try {
      const apiKey = getActiveApiKey();

      if (!apiKey) {
        throw new Error(
          "GROQ_API_KEY is not configured."
        );
      }

      console.log(
        `${label}: Groq attempt ${attempt}/${MAX_RETRIES}`
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
            `${label}: Retrying the same request with the secondary key.`
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
       */
      if (status === 429) {
        const delay =
          error?.resetDelay || 61000;

        console.log("");
        console.log(
          `${label}: Groq temporary rate limit reached.`
        );

        console.log(
          `${label}: Waiting ${Math.ceil(delay / 1000)} seconds.`
        );

        if (attempt >= MAX_RETRIES) {
          throw error;
        }

        await sleep(delay);
        continue;
      }

      /*
       * TEMPORARY SERVER ERRORS
       */
      if (
        status === 408 ||
        status === 409 ||
        status === 500 ||
        status === 502 ||
        status === 503 ||
        status === 504 ||
        error?.isNetworkError
      ) {
        if (attempt >= MAX_RETRIES) {
          throw error;
        }

        const delay = Math.min(
          60000,
          Math.max(5000, attempt * 5000)
        );

        console.log(
          `${label}: Temporary error. Retrying in ${Math.ceil(delay / 1000)} seconds.`
        );

        await sleep(delay);
        continue;
      }

      /*
       * INVALID REQUEST / FATAL ERRORS
       */
      throw error;
    }
  }

  throw new Error(
    `${label}: Maximum Groq retry attempts reached.`
  );
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

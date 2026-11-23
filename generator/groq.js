
const GROQ_API_URL =
  "https://api.groq.com/openai/v1/chat/completions";

const MODEL =
  process.env.GROQ_MODEL ||
  "openai/gpt-oss-120b";


function sleep(ms) {
  return new Promise(
    resolve => setTimeout(resolve, ms)
  );
}


/*
 * ------------------------------------------------------
 * API KEY MANAGEMENT
 * ------------------------------------------------------
 *
 * Primary:
 *   GROQ_API_KEY
 *
 * Secondary:
 *   GROQ_API_KEY_2
 *
 * Switch to the secondary key ONLY when the primary
 * key's DAILY REQUEST QUOTA (RPD) is exhausted.
 *
 * RPM / TPM limits continue using the existing
 * wait-and-retry behavior.
 */

const API_KEYS = [
  process.env.GROQ_API_KEY,
  process.env.GROQ_API_KEY_2
].filter(Boolean);

let activeApiKeyIndex = 0;


function getActiveApiKey() {
  return API_KEYS[activeApiKeyIndex];
}


function isDailyQuotaExceeded(error) {
  const response =
    error?.response;

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

  const message =
    String(error?.message || "").toLowerCase();

  return (
    /\brequests per day\b/.test(message) ||
    /\brequest per day\b/.test(message) ||
    /\bdaily request limit\b/.test(message) ||
    /\bdaily requests limit\b/.test(message) ||
    /\brpd\b/.test(message)
  );
}


function switchToSecondaryKey(label) {
  if (activeApiKeyIndex !== 0) {
    return false;
  }

  if (!API_KEYS[1]) {
    throw new Error(
      `${label}: Primary Groq daily request quota is exhausted, but GROQ_API_KEY_2 is not configured.`
    );
  }

  activeApiKeyIndex = 1;

  console.log("");
  console.log(
    `${label}: Primary API key daily request quota exhausted.`
  );

  console.log(
    `${label}: Switching to GROQ_API_KEY_2.`
  );

  return true;
}


/*
 * ------------------------------------------------------
 * GROQ RATE-LIMIT RESET DELAY
 * ------------------------------------------------------
 *
 * Priority:
 *
 * 1. retry-after
 * 2. x-ratelimit-reset-tokens
 * 3. safe 61-second fallback
 */

function getResetDelay(response) {
  const retryAfter =
    response.headers.get(
      "retry-after"
    );

  if (retryAfter) {
    const seconds =
      Number.parseFloat(
        retryAfter
      );

    if (Number.isFinite(seconds)) {
      return Math.max(
        1000,
        Math.ceil(
          seconds * 1000
        ) + 1000
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
        Number.parseFloat(
          match[1]
        );

      const unit =
        match[2] || "s";

      let milliseconds =
        value * 1000;

      if (unit === "ms") {
        milliseconds = value;
      }

      else if (unit === "m") {
        milliseconds =
          value * 60 * 1000;
      }

      else if (unit === "h") {
        milliseconds =
          value * 60 * 60 * 1000;
      }

      return Math.max(
        1000,
        Math.ceil(
          milliseconds
        ) + 1000
      );
    }
  }


  /*
   * Safe fallback when Groq does not provide
   * a usable reset header.
   */

  return 61000;
}


/*
 * ------------------------------------------------------
 * GROQ API REQUEST
 * ------------------------------------------------------
 */

async function request(
  prompt,
  maxTokens,
  apiKey
) {
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
          "Content-Type":
            "application/json",

          "Authorization":
            `Bearer ${apiKey}`
        },

        body: JSON.stringify({
          model: MODEL,

          temperature: 0.15,

          max_tokens:
            maxTokens,

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

              content:
                prompt
            }
          ]
        })
      }
    );


  const text =
    await response.text();


  /*
   * ----------------------------------------------------
   * HTTP ERROR
   * ----------------------------------------------------
   */

  if (!response.ok) {
    let message =
      text;


    try {
      const parsed =
        JSON.parse(text);

      message =
        parsed?.error?.message ||
        parsed?.error?.code ||
        text;

    } catch {
      /*
       * Keep raw response text.
       */
    }


    const error =
      new Error(
        `Groq HTTP ${response.status}: ${message}`
      );


    error.status =
      response.status;

    error.response =
      response;

    error.resetDelay =
      getResetDelay(
        response
      );


    throw error;
  }


  /*
   * ----------------------------------------------------
   * PARSE GROQ API RESPONSE
   * ----------------------------------------------------
   */

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


/*
 * ------------------------------------------------------
 * PARSE MODEL JSON
 * ------------------------------------------------------
 *
 * The API response itself is JSON, but the model's
 * message content is another JSON document.
 *
 * Markdown fences are removed defensively if the model
 * ever returns them despite the system instruction.
 */

function parseJson(text) {
  let cleaned =
    String(text).trim();


  if (
    cleaned.startsWith("```")
  ) {
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
    return JSON.parse(
      cleaned
    );

  } catch {
    throw new Error(
      "Groq returned invalid lesson/MCQ JSON content."
    );
  }
}


/*
 * ------------------------------------------------------
 * RETRY GROQ REQUEST
 * ------------------------------------------------------
 *
 * DAILY REQUEST QUOTA:
 *   Switch from primary to secondary key.
 *   Retry the EXACT SAME request.
 *
 * 429 — RPM / TPM:
 *   Wait for reset.
 *   Retry EXACT SAME request using the SAME key.
 *
 * Temporary server errors:
 *   Retry SAME request.
 *
 * Invalid model JSON:
 *   Retry SAME request.
 *
 * 400:
 *   Fatal.
 *
 * 413:
 *   Fatal.
 *
 * Network/fetch errors:
 *   Retry SAME request.
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
      const apiKey =
        getActiveApiKey();


      if (!apiKey) {
        throw new Error(
          "GROQ_API_KEY is not set."
        );
      }


      console.log(
        `${label}: Groq attempt ${attempt}`
      );


      const raw =
        await request(
          prompt,
          maxTokens,
          apiKey
        );


      return parseJson(
        raw
      );


    } catch (error) {
      const status =
        error?.status;


      /*
       * ------------------------------------------------
       * DAILY REQUEST QUOTA EXHAUSTED
       * ------------------------------------------------
       *
       * Switch only from primary to secondary.
       *
       * Do not switch for ordinary RPM / TPM limits.
       *
       * The same prompt is sent again.
       */

      if (
        status === 429 &&
        isDailyQuotaExceeded(error)
      ) {
        if (
          activeApiKeyIndex === 0
        ) {
          switchToSecondaryKey(
            label
          );

          console.log(
            `${label}: Retrying the SAME request with the secondary API key...`
          );

          continue;
        }


        throw new Error(
          `${label}: Daily request quota is exhausted for both configured API keys.`
        );
      }


      /*
       * ------------------------------------------------
       * 429 — RATE LIMIT / TPM
       * ------------------------------------------------
       *
       * NEVER skip the current request.
       *
       * Wait until tokens become available and send
       * the EXACT SAME prompt again.
       */

      if (
        status === 429
      ) {
        const delay =
          error?.resetDelay ||
          61000;


        const seconds =
          Math.ceil(
            delay / 1000
          );


        console.log("");

        console.log(
          `${label}: Groq rate limit reached.`
        );

        console.log(
          `${label}: Waiting ${seconds} seconds for tokens to become available...`
        );


        await sleep(
          delay
        );


        console.log(
          `${label}: Token wait complete. Retrying the SAME request...`
        );


        continue;
      }


      /*
       * ------------------------------------------------
       * TEMPORARY GROQ ERRORS
       * ------------------------------------------------
       *
       * Retry the SAME request.
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


        await sleep(
          delay
        );


        continue;
      }


      /*
       * ------------------------------------------------
       * INVALID MODEL JSON / NETWORK ERROR
       * ------------------------------------------------
       *
       * When there is no HTTP status, this is normally
       * a network/fetch error or a malformed model
       * response.
       *
       * Retry the SAME request.
       */

      if (!status) {
        const delay =
          Math.min(
            60000,
            Math.max(
              5000,
              attempt * 5000
            )
          );


        console.log(
          `${label}: ${error.message}`
        );

        console.log(
          `${label}: Retrying the SAME request after ${Math.ceil(delay / 1000)} seconds...`
        );


        await sleep(
          delay
        );


        continue;
      }


      /*
       * ------------------------------------------------
       * 400 — BAD REQUEST
       * ------------------------------------------------
       *
       * Do NOT retry forever.
       *
       * The request itself must be corrected.
       */

      if (
        status === 400
      ) {
        throw error;
      }


      /*
       * ------------------------------------------------
       * 413 — REQUEST TOO LARGE
       * ------------------------------------------------
       *
       * Retrying the identical request cannot solve
       * the size problem.
       */

      if (
        status === 413
      ) {
        throw error;
      }


      /*
       * ------------------------------------------------
       * UNEXPECTED HTTP ERROR
       * ------------------------------------------------
       *
       * Retry the SAME request rather than silently
       * losing the current lesson/topic.
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
        `${label}: Groq HTTP ${status}. Retrying the SAME request after ${Math.ceil(delay / 1000)} seconds...`
      );


      await sleep(
        delay
      );
    }
  }
}


/*
 * ------------------------------------------------------
 * LESSON GENERATION
 * ------------------------------------------------------
 */

export async function generateLesson(
  prompt
) {
  return callWithRetry(
    prompt,
    3500,
    "Lesson generation"
  );
}


/*
 * ------------------------------------------------------
 * TOPIC MCQ GENERATION
 * ------------------------------------------------------
 */

export async function generateTopicMcqs(
  prompt
) {
  return callWithRetry(
    prompt,
    2500,
    "MCQ generation"
  );
}

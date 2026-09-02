const GROQ_API_URL =
  "https://api.groq.com/openai/v1/chat/completions";

const MODEL =
  process.env.GROQ_MODEL ||
  "openai/gpt-oss-120b";

const MAX_RETRIES = 3;


function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}


async function request(prompt, maxTokens) {
  const apiKey =
    process.env.GROQ_API_KEY;

  if (!apiKey) {
    throw new Error(
      "GROQ_API_KEY is not set."
    );
  }


  const response = await fetch(
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
              "Follow the user's requested JSON structure exactly. " +
              "Never return markdown, code fences, comments, or explanatory text. " +
              "For lesson generation, learningOutcome MUST ALWAYS be a JSON array of strings. " +
              "It must NEVER be a string, object, null, or omitted. " +
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
  let lastError;


  for (
    let attempt = 1;
    attempt <= MAX_RETRIES;
    attempt++
  ) {
    try {
      console.log(
        `${label}: Groq attempt ${attempt}/${MAX_RETRIES}`
      );


      const raw =
        await request(
          prompt,
          maxTokens
        );


      return parseJson(raw);

    } catch (error) {
      lastError =
        error;

      const status =
        error?.status;


      /*
       * Do not retry malformed requests
       * or requests that exceed limits.
       */
      if (
        status === 400 ||
        status === 413
      ) {
        throw error;
      }


      if (
        attempt < MAX_RETRIES
      ) {
        const delay =
          attempt * 3000;


        console.log(
          `${label}: retrying after ${delay}ms`
        );


        await sleep(delay);
      }
    }
  }


  throw lastError;
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

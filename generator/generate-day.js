import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();

const SYLLABUS_FILE = path.join(ROOT, "syllabus.json");
const CONFIG_FILE = path.join(ROOT, "config", "app-config.json");
const DATA_DIR = path.join(ROOT, "public", "data");

const GROQ_URL =
  "https://api.groq.com/openai/v1/chat/completions";

const DEFAULT_MODEL =
  process.env.GROQ_MODEL || "openai/gpt-oss-120b";

const REQUEST_TIMEOUT_MS = 120000;
const MAX_RETRIES = 4;

function fail(message) {
  console.error("");
  console.error("==============================================");
  console.error(" VIDHWAAN NEET — GENERATION FAILED");
  console.error("==============================================");
  console.error(message);
  console.error("==============================================");
  process.exit(1);
}

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (error) {
    fail(
      `Invalid JSON file:\n${file}\n${error.message}`
    );
  }
}

function getDays(root) {
  if (Array.isArray(root)) return root;

  if (Array.isArray(root?.days)) {
    return root.days;
  }

  fail(
    "syllabus.json does not contain a valid days array."
  );
}

function lastGeneratedDay() {
  if (!fs.existsSync(DATA_DIR)) {
    return 0;
  }

  let highest = 0;

  for (const file of fs.readdirSync(DATA_DIR)) {
    const match = file.match(
      /^day-(\d{3})\.json$/
    );

    if (match) {
      highest = Math.max(
        highest,
        Number(match[1])
      );
    }
  }

  return highest;
}

function courseDate(startDate, dayNumber) {
  const parts = String(startDate)
    .split("-")
    .map(Number);

  const [year, month, day] = parts;

  if (
    !year ||
    !month ||
    !day ||
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > 31
  ) {
    fail(
      `Invalid courseStartDate: ${startDate}`
    );
  }

  const date = new Date(
    Date.UTC(
      year,
      month - 1,
      day
    )
  );

  date.setUTCDate(
    date.getUTCDate() + dayNumber - 1
  );

  return date
    .toISOString()
    .slice(0, 10);
}

function sleep(ms) {
  return new Promise(resolve =>
    setTimeout(resolve, ms)
  );
}

function extractJson(text) {
  let cleaned = String(text)
    .trim();

  if (cleaned.startsWith("```")) {
    cleaned = cleaned
      .replace(/^```json\s*/i, "")
      .replace(/^```\s*/i, "")
      .replace(/\s*```$/i, "")
      .trim();
  }

  try {
    return JSON.parse(cleaned);
  } catch (error) {
    throw new Error(
      `Groq did not return valid JSON.\n` +
      `${error.message}\n\nRAW RESPONSE:\n${text}`
    );
  }
}

async function fetchWithTimeout(
  url,
  options,
  timeoutMs
) {
  const controller =
    new AbortController();

  const timer = setTimeout(
    () => controller.abort(),
    timeoutMs
  );

  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal
    });
  } finally {
    clearTimeout(timer);
  }
}

async function generateWithGroq(
  prompt,
  purpose
) {
  const key =
    process.env.GROQ_API_KEY;

  if (!key) {
    throw new Error(
      "GROQ_API_KEY is missing."
    );
  }

  let lastError = null;

  for (
    let attempt = 1;
    attempt <= MAX_RETRIES;
    attempt++
  ) {
    try {
      const response =
        await fetchWithTimeout(
          GROQ_URL,
          {
            method: "POST",
            headers: {
              Authorization:
                `Bearer ${key}`,
              "Content-Type":
                "application/json"
            },
            body: JSON.stringify({
              model: DEFAULT_MODEL,
              temperature: 0.15,
              max_tokens: 12000,
              response_format: {
                type: "json_object"
              },
              messages: [
                {
                  role: "system",
                  content:
                    "You are a senior NEET examination " +
                    "question-paper author and medical/science " +
                    "education content expert. " +
                    "Create scientifically accurate, syllabus-aligned " +
                    "NEET-level content. " +
                    "Never invent facts. " +
                    "Never use information outside the supplied syllabus " +
                    "when the prompt restricts the content. " +
                    "Return ONLY valid JSON."
                },
                {
                  role: "user",
                  content: prompt
                }
              ]
            })
          },
          REQUEST_TIMEOUT_MS
        );

      const body =
        await response.text();

      if (response.ok) {
        const result =
          JSON.parse(body);

        const content =
          result?.choices?.[0]?.message
            ?.content;

        if (!content) {
          throw new Error(
            `${purpose}: Groq returned no message content.`
          );
        }

        return content;
      }

      const retryable =
        response.status === 408 ||
        response.status === 429 ||
        response.status >= 500;

      lastError = new Error(
        `${purpose}: Groq HTTP ${response.status}: ${body}`
      );

      if (!retryable) {
        throw lastError;
      }

      let waitMs =
        Math.min(
          30000,
          2000 * 2 ** (attempt - 1)
        );

      const retryAfter =
        response.headers.get(
          "retry-after"
        );

      if (retryAfter) {
        const seconds =
          Number(retryAfter);

        if (
          Number.isFinite(seconds) &&
          seconds >= 0
        ) {
          waitMs =
            Math.min(
              60000,
              Math.ceil(seconds * 1000)
            );
        }
      }

      console.log(
        `${purpose}: retry ${attempt}/${MAX_RETRIES} ` +
        `after ${waitMs}ms...`
      );

      await sleep(waitMs);
    } catch (error) {
      lastError = error;

      if (
        attempt === MAX_RETRIES
      ) {
        break;
      }

      const waitMs =
        Math.min(
          30000,
          2000 * 2 ** (attempt - 1)
        );

      console.log(
        `${purpose}: retry ${attempt}/${MAX_RETRIES} ` +
        `after ${waitMs}ms...`
      );

      await sleep(waitMs);
    }
  }

  throw lastError ||
    new Error(
      `${purpose}: Groq request failed.`
    );
}

/*
 * Extract every meaningful syllabus topic.
 *
 * We deliberately use the existing syllabus as the
 * source of truth. We do not invent topics.
 */
function extractTopics(day) {
  const topics = [];

  if (Array.isArray(day.topics)) {
    for (const topic of day.topics) {
      if (
        typeof topic === "string" &&
        topic.trim()
      ) {
        topics.push({
          name: topic.trim(),
          source: topic.trim()
        });
      } else if (
        topic &&
        typeof topic === "object"
      ) {
        const name =
          topic.name ||
          topic.topic ||
          topic.title ||
          topic.heading;

        if (
          typeof name === "string" &&
          name.trim()
        ) {
          topics.push({
            name: name.trim(),
            source: topic
          });
        }
      }
    }
  }

  /*
   * If topics is empty, use sections only as a fallback.
   * This does NOT invent syllabus content.
   */
  if (
    topics.length === 0 &&
    Array.isArray(day.subtopics)
  ) {
    for (const item of day.subtopics) {
      if (
        typeof item === "string" &&
        item.trim()
      ) {
        topics.push({
          name: item.trim(),
          source: item.trim()
        });
      }
    }
  }

  return topics;
}

function buildLessonPrompt(day) {
  return `
Create the complete English study lesson for EXACTLY this NEET syllabus day.

SOURCE OF TRUTH:
Use ONLY the supplied syllabus for this day.

STRICT REQUIREMENTS:

1. Cover EVERY topic and subtopic supplied.
2. Do not generate content belonging to another day.
3. Do not add unrelated chapters.
4. Explain concepts accurately and clearly.
5. Make the lesson useful for serious NEET preparation.
6. Include important definitions.
7. Include mechanisms/processes where applicable.
8. Include formulas and relationships where applicable.
9. Include important factual points.
10. Include common student mistakes.
11. Include NEET-focused points.
12. Include concise examples where genuinely useful.
13. Do not fabricate facts.
14. English only.
15. Return ONLY valid JSON.

The lesson should be detailed enough that a student can study
this day's syllabus without requiring a second explanation.

Required JSON shape:

{
  "day": number,
  "title": "string",
  "subject": "string",
  "unit": "string",
  "chapter": "string",
  "neetFocus": ["string"],
  "learningOutcome": ["string"],
  "sections": [
    {
      "topic": "string",
      "heading": "string",
      "content": "clear detailed explanation",
      "subsections": [
        {
          "heading": "string",
          "content": "clear detailed explanation"
        }
      ],
      "keyPoints": ["string"],
      "neetTips": ["string"]
    }
  ]
}

Syllabus:
${JSON.stringify(day, null, 2)}
`;
}

function buildMcqPrompt(
  day,
  topics
) {
  return `
Create the NEET practice MCQ bank for EXACTLY this syllabus day.

This is for a serious NEET preparation application.

SOURCE OF TRUTH:
Use ONLY the supplied day's syllabus and supplied topics.

IMPORTANT:
- Every supplied topic MUST be covered.
- Generate approximately 3 to 5 high-quality MCQs PER TOPIC.
- Do NOT force an exact total number of questions.
- Do NOT pad the response with weak or repetitive questions.
- If a topic naturally supports only 3 strong questions, generate 3.
- If a topic supports 4 strong questions, generate 4.
- If a topic supports 5 strong questions, generate 5.
- Quality is more important than quantity.
- Every question must test a real concept from that topic.
- Questions must be original.
- Do not repeat the same question in different wording.
- Do not make trivial questions just to increase the count.
- Do not use information outside the supplied syllabus.

NEET LEVEL:
Questions must resemble the conceptual level and style expected
in the NEET-UG public examination.

Use a realistic mixture of:
- direct conceptual questions
- application-based questions
- statement-based questions
- assertion/reasoning-style conceptual thinking where appropriate
- numerical/application questions where the syllabus supports them
- diagram/process interpretation concepts where applicable
- exception/fact-based questions where genuinely important

Difficulty should naturally vary:
- easy
- moderate
- difficult

But DO NOT make questions artificially difficult.

IMPORTANT NEET MCQ RULES:

1. Exactly 4 options.
2. Exactly ONE correct answer.
3. No ambiguous answers.
4. No two options may both be correct.
5. The correct answer must be scientifically accurate.
6. Distractors must be plausible but clearly incorrect.
7. Avoid clues from option length or wording.
8. Avoid "all of the above" unless absolutely necessary.
9. Avoid "none of the above".
10. Avoid negative wording unless it tests an important concept.
11. Avoid unnecessarily complicated language.
12. Do not depend on information outside the supplied syllabus.
13. Every answer explanation must explain WHY the answer is correct.
14. Explanations must be concise but educational.
15. Do not copy textbook wording unnecessarily.
16. Do not create questions from topics not supplied.

For each topic, aim for 3–5 strong questions.
The final number may therefore vary naturally.

Return ONLY JSON.

Required JSON:

{
  "mcqs": [
    {
      "topic": "exact supplied topic",
      "question": "string",
      "options": [
        "option 1",
        "option 2",
        "option 3",
        "option 4"
      ],
      "correctAnswer": "A",
      "explanation": "Why A is correct."
    }
  ]
}

DAY:
${JSON.stringify(day, null, 2)}

TOPICS TO COVER:
${JSON.stringify(topics, null, 2)}
`;
}

function normaliseAnswer(answer) {
  if (
    typeof answer !== "string"
  ) {
    return "";
  }

  const value =
    answer.trim().toUpperCase();

  if (
    ["A", "B", "C", "D"].includes(
      value
    )
  ) {
    return value;
  }

  /*
   * Accept forms such as:
   * "A."
   * "(A)"
   * "Option A"
   */
  const match =
    value.match(
      /\b([ABCD])\b/
    );

  return match
    ? match[1]
    : "";
}

function cleanMcq(q) {
  if (
    !q ||
    typeof q !== "object"
  ) {
    return null;
  }

  const question =
    typeof q.question === "string"
      ? q.question.trim()
      : "";

  const explanation =
    typeof q.explanation === "string"
      ? q.explanation.trim()
      : "";

  const topic =
    typeof q.topic === "string"
      ? q.topic.trim()
      : "";

  const options =
    Array.isArray(q.options)
      ? q.options
          .map(x =>
            typeof x === "string"
              ? x.trim()
              : String(x ?? "").trim()
          )
          .filter(Boolean)
      : [];

  const correctAnswer =
    normaliseAnswer(
      q.correctAnswer
    );

  if (!question) {
    return null;
  }

  if (
    options.length !== 4
  ) {
    return null;
  }

  if (
    new Set(
      options.map(x =>
        x.toLowerCase()
      )
    ).size !== 4
  ) {
    return null;
  }

  if (!correctAnswer) {
    return null;
  }

  if (!explanation) {
    return null;
  }

  return {
    topic,
    question,
    options,
    correctAnswer,
    explanation
  };
}

function questionKey(question) {
  return String(question)
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[^\p{L}\p{N} ]/gu, "")
    .trim();
}

function deduplicateMcqs(mcqs) {
  const seen = new Set();
  const result = [];

  for (const mcq of mcqs) {
    const key =
      questionKey(mcq.question);

    if (!key) {
      continue;
    }

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    result.push(mcq);
  }

  return result;
}

function validateLesson(
  data,
  expectedDay
) {
  if (
    !data ||
    typeof data !== "object"
  ) {
    throw new Error(
      "Generated lesson is not an object."
    );
  }

  if (
    Number(data.day) !==
    expectedDay
  ) {
    throw new Error(
      `Generated day mismatch. ` +
      `Expected ${expectedDay}, got ${data.day}.`
    );
  }

  if (!data.title) {
    throw new Error(
      "Generated lesson is missing title."
    );
  }

  if (
    !Array.isArray(data.sections) ||
    data.sections.length === 0
  ) {
    throw new Error(
      "Generated lesson contains no sections."
    );
  }
}

function validateMcqs(
  mcqs,
  expectedTopics
) {
  if (!Array.isArray(mcqs)) {
    throw new Error(
      "MCQ result is not an array."
    );
  }

  if (mcqs.length === 0) {
    throw new Error(
      "Groq returned zero valid MCQs."
    );
  }

  for (
    let i = 0;
    i < mcqs.length;
    i++
  ) {
    const q = mcqs[i];

    if (!q.question) {
      throw new Error(
        `MCQ ${i + 1}: missing question.`
      );
    }

    if (
      !Array.isArray(q.options) ||
      q.options.length !== 4
    ) {
      throw new Error(
        `MCQ ${i + 1}: must have exactly 4 options.`
      );
    }

    if (
      !["A", "B", "C", "D"].includes(
        q.correctAnswer
      )
    ) {
      throw new Error(
        `MCQ ${i + 1}: invalid correctAnswer.`
      );
    }

    if (!q.explanation) {
      throw new Error(
        `MCQ ${i + 1}: missing explanation.`
      );
    }
  }

  /*
   * Topic coverage is reported, but we DO NOT fail the day
   * simply because Groq returned fewer questions for a topic.
   *
   * This is intentional.
   */
  const covered =
    new Set(
      mcqs
        .map(q =>
          String(q.topic || "")
            .trim()
            .toLowerCase()
        )
        .filter(Boolean)
    );

  console.log("");
  console.log(
    `Topics supplied : ${expectedTopics.length}`
  );
  console.log(
    `MCQs accepted   : ${mcqs.length}`
  );
  console.log(
    `Topics tagged   : ${covered.size}`
  );
}

async function generateLesson(day) {
  console.log(
    "STEP 1/2 — Generating complete lesson..."
  );

  const raw =
    await generateWithGroq(
      buildLessonPrompt(day),
      "Lesson generation"
    );

  const lesson =
    extractJson(raw);

  validateLesson(
    lesson,
    Number(day.day)
  );

  console.log(
    `Lesson sections: ${lesson.sections.length}`
  );

  return lesson;
}

async function generateMcqs(
  day,
  topics
) {
  console.log(
    "STEP 2/2 — Generating topic-based NEET MCQs..."
  );

  if (topics.length === 0) {
    throw new Error(
      "No syllabus topics were found for this day."
    );
  }

  /*
   * Send topics in controlled batches.
   *
   * This prevents one enormous MCQ request while also avoiding
   * one API request for every individual topic.
   */
  const TOPICS_PER_REQUEST = 5;

  const batches = [];

  for (
    let i = 0;
    i < topics.length;
    i += TOPICS_PER_REQUEST
  ) {
    batches.push(
      topics.slice(
        i,
        i + TOPICS_PER_REQUEST
      )
    );
  }

  const allMcqs = [];

  for (
    let i = 0;
    i < batches.length;
    i++
  ) {
    const batch =
      batches[i];

    console.log(
      `MCQ batch ${i + 1}/${batches.length} ` +
      `— topics ${i * TOPICS_PER_REQUEST + 1}-` +
      `${Math.min(
        (i + 1) * TOPICS_PER_REQUEST,
        topics.length
      )}`
    );

    let parsed;

    try {
      const raw =
        await generateWithGroq(
          buildMcqPrompt(
            day,
            batch
          ),
          `MCQ batch ${i + 1}`
        );

      parsed =
        extractJson(raw);
    } catch (error) {
      /*
       * A failed individual batch must not silently create
       * a corrupt lesson.
       *
       * We fail the generation, so GitHub Actions retries the
       * same day on the next run.
       */
      throw new Error(
        `MCQ batch ${i + 1} failed: ` +
        error.message
      );
    }

    const returned =
      Array.isArray(parsed)
        ? parsed
        : Array.isArray(parsed?.mcqs)
          ? parsed.mcqs
          : [];

    const cleaned =
      returned
        .map(cleanMcq)
        .filter(Boolean);

    console.log(
      `  Returned : ${returned.length}`
    );

    console.log(
      `  Valid    : ${cleaned.length}`
    );

    allMcqs.push(
      ...cleaned
    );
  }

  const uniqueMcqs =
    deduplicateMcqs(
      allMcqs
    );

  console.log(
    `Total valid MCQs    : ${allMcqs.length}`
  );

  console.log(
    `After deduplication : ${uniqueMcqs.length}`
  );

  validateMcqs(
    uniqueMcqs,
    topics
  );

  return uniqueMcqs;
}

function writeJsonAtomic(
  file,
  data
) {
  const temp =
    `${file}.tmp`;

  fs.writeFileSync(
    temp,
    JSON.stringify(
      data,
      null,
      2
    ) + "\n",
    "utf8"
  );

  fs.renameSync(
    temp,
    file
  );
}

async function main() {
  const syllabus =
    readJson(
      SYLLABUS_FILE
    );

  const config =
    readJson(
      CONFIG_FILE
    );

  const days =
    getDays(syllabus);

  const totalDays =
    Number(config.totalDays);

  if (
    days.length !==
    totalDays
  ) {
    fail(
      `Syllabus contains ${days.length} days ` +
      `but config requires ${totalDays}.`
    );
  }

  const last =
    lastGeneratedDay();

  const next =
    last + 1;

  console.log("");
  console.log(
    "=============================================="
  );
  console.log(
    " VIDHWAAN NEET — DAILY AI GENERATOR"
  );
  console.log(
    "=============================================="
  );
  console.log(
    `Last generated : ${last}`
  );
  console.log(
    `Next day       : ${next}`
  );
  console.log(
    `Total days     : ${totalDays}`
  );
  console.log(
    `Start date     : ${config.courseStartDate}`
  );
  console.log(
    `Model          : ${DEFAULT_MODEL}`
  );
  console.log(
    "MCQ strategy   : 3–5 per syllabus topic"
  );
  console.log(
    "MCQ minimum    : NONE"
  );
  console.log(
    "MCQ maximum    : NONE"
  );
  console.log(
    "=============================================="
  );

  if (
    next > totalDays
  ) {
    console.log(
      "All 365 lessons are already generated."
    );
    return;
  }

  if (
    !fs.existsSync(DATA_DIR)
  ) {
    fs.mkdirSync(
      DATA_DIR,
      {
        recursive: true
      }
    );
  }

  const output =
    path.join(
      DATA_DIR,
      `day-${String(next).padStart(3, "0")}.json`
    );

  if (
    fs.existsSync(output)
  ) {
    fail(
      `Safety stop: ${output} already exists.`
    );
  }

  const day =
    days.find(
      item =>
        Number(item.day) ===
        next
    );

  if (!day) {
    fail(
      `Day ${next} not found in syllabus.json.`
    );
  }

  const date =
    courseDate(
      config.courseStartDate,
      next
    );

  const publishAt =
    `${date}T06:00:00+05:30`;

  const topics =
    extractTopics(day);

  if (topics.length === 0) {
    fail(
      `Day ${next} has no usable syllabus topics.`
    );
  }

  console.log(
    `Syllabus       : Day ${next}`
  );

  console.log(
    `Course date    : ${date}`
  );

  console.log(
    `Publish at     : ${publishAt}`
  );

  console.log(
    `Topics         : ${topics.length}`
  );

  console.log("");

  const lesson =
    await generateLesson(
      day
    );

  const mcqs =
    await generateMcqs(
      day,
      topics
    );

  /*
   * Only now create the final production object.
   * Nothing is written to day-NNN.json until everything
   * has successfully passed validation.
   */
  const generated = {
    ...lesson,
    day: next,
    courseDate: date,
    publishAt,
    mcqs
  };

  /*
   * Final safety checks.
   */
  validateLesson(
    generated,
    next
  );

  validateMcqs(
    generated.mcqs,
    topics
  );

  writeJsonAtomic(
    output,
    generated
  );

  console.log("");
  console.log(
    "=============================================="
  );
  console.log(
    " DAILY LESSON GENERATED SUCCESSFULLY"
  );
  console.log(
    "=============================================="
  );
  console.log(
    `Day       : ${next}`
  );
  console.log(
    `Date      : ${date}`
  );
  console.log(
    `Output    : ${path.relative(
      ROOT,
      output
    )}`
  );
  console.log(
    `Sections  : ${generated.sections.length}`
  );
  console.log(
    `Topics    : ${topics.length}`
  );
  console.log(
    `MCQs      : ${generated.mcqs.length}`
  );
  console.log(
    "Validation: PASSED"
  );
  console.log(
    "=============================================="
  );
}

main().catch(
  error =>
    fail(
      error?.stack ||
      error?.message ||
      String(error)
    )
);

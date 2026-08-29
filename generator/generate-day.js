import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();

const SYLLABUS_FILE = path.join(ROOT, "syllabus.json");
const CONFIG_FILE = path.join(ROOT, "config", "app-config.json");
const DATA_DIR = path.join(ROOT, "public", "data");

const MODEL = process.env.GROQ_MODEL || "openai/gpt-oss-120b";

const MAX_RETRIES = 4;
const BASE_RETRY_MS = 2000;

function fail(message) {
  console.error("");
  console.error("==============================================");
  console.error(" VIDHWAAN NEET — GENERATION FAILED");
  console.error("==============================================");
  console.error(message);
  console.error("==============================================");
  process.exit(1);
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (error) {
    fail(`Invalid JSON file:\n${file}\n${error.message}`);
  }
}

function getDays(root) {
  if (Array.isArray(root)) return root;

  if (Array.isArray(root?.days)) {
    return root.days;
  }

  fail("syllabus.json does not contain a valid days array.");
}

function lastGeneratedDay() {
  if (!fs.existsSync(DATA_DIR)) {
    return 0;
  }

  let highest = 0;

  for (const file of fs.readdirSync(DATA_DIR)) {
    const match = file.match(/^day-(\d{3})\.json$/);

    if (match) {
      highest = Math.max(highest, Number(match[1]));
    }
  }

  return highest;
}

function courseDate(startDate, dayNumber) {
  const [year, month, day] = String(startDate)
    .split("-")
    .map(Number);

  if (!year || !month || !day) {
    fail(`Invalid courseStartDate: ${startDate}`);
  }

  const date = new Date(
    Date.UTC(year, month - 1, day)
  );

  date.setUTCDate(
    date.getUTCDate() + dayNumber - 1
  );

  return date.toISOString().slice(0, 10);
}

function extractJson(text) {
  let cleaned = String(text).trim();

  cleaned = cleaned
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  try {
    return JSON.parse(cleaned);
  } catch (error) {
    throw new Error(
      `Model returned invalid JSON.\n${error.message}\n\nRAW RESPONSE:\n${text}`
    );
  }
}

async function callGroq(prompt, label) {
  const key = process.env.GROQ_API_KEY;

  if (!key) {
    throw new Error("GROQ_API_KEY is missing.");
  }

  let lastError;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await fetch(
        "https://api.groq.com/openai/v1/chat/completions",
        {
          method: "POST",

          headers: {
            Authorization: `Bearer ${key}`,
            "Content-Type": "application/json"
          },

          body: JSON.stringify({
            model: MODEL,

            temperature: 0.15,

            response_format: {
              type: "json_object"
            },

            messages: [
              {
                role: "system",
                content:
                  "You are a highly accurate NEET preparation content author. " +
                  "Write scientifically correct, exam-focused content. " +
                  "Follow the supplied syllabus exactly. " +
                  "Never invent syllabus topics. " +
                  "Return only valid JSON."
              },
              {
                role: "user",
                content: prompt
              }
            ]
          })
        }
      );

      const body = await response.text();

      if (!response.ok) {
        throw new Error(
          `Groq HTTP ${response.status}: ${body}`
        );
      }

      const result = JSON.parse(body);

      const content =
        result?.choices?.[0]?.message?.content;

      if (!content) {
        throw new Error(
          "Groq returned no message content."
        );
      }

      return extractJson(content);
    } catch (error) {
      lastError = error;

      const message = String(error.message);

      /*
       * 413 means the request itself is too large.
       * Retrying the identical request is pointless.
       */
      if (
        message.includes("HTTP 413") ||
        message.includes("Request too large") ||
        message.includes("tokens per minute")
      ) {
        throw error;
      }

      if (attempt < MAX_RETRIES) {
        const delay = BASE_RETRY_MS * 2 ** (attempt - 1);

        console.log(
          `${label}: retry ${attempt}/${MAX_RETRIES} after ${delay}ms...`
        );

        await sleep(delay);
      }
    }
  }

  throw lastError;
}

/*
 * Convert the syllabus day into compact topic records.
 *
 * This is important:
 * We DO NOT send the entire day to Groq repeatedly.
 */
function extractTopics(day) {
  const topics = [];

  if (Array.isArray(day.topics)) {
    for (const topic of day.topics) {
      if (typeof topic === "string") {
        topics.push({
          topic,
          subtopics: []
        });
      } else if (topic && typeof topic === "object") {
        topics.push({
          topic:
            topic.topic ||
            topic.name ||
            topic.title ||
            "Unnamed topic",

          subtopics:
            Array.isArray(topic.subtopics)
              ? topic.subtopics
              : []
        });
      }
    }
  }

  /*
   * If the syllabus uses subtopics directly instead of
   * structured topic objects, preserve them.
   */
  if (topics.length === 0 && Array.isArray(day.subtopics)) {
    for (const item of day.subtopics) {
      topics.push({
        topic:
          typeof item === "string"
            ? item
            : item?.topic ||
              item?.name ||
              item?.title ||
              "Unnamed topic",

        subtopics: []
      });
    }
  }

  /*
   * Last-resort fallback:
   * chapter itself becomes one topic.
   */
  if (topics.length === 0 && day.chapter) {
    topics.push({
      topic: day.chapter,
      subtopics: []
    });
  }

  return topics;
}

function buildLessonPrompt(day, topicRecord) {
  const topic = topicRecord.topic;

  const subtopics =
    topicRecord.subtopics.length > 0
      ? topicRecord.subtopics
      : [];

  return `
Create ONE concise but complete NEET study lesson for ONLY this syllabus topic.

DAY: ${day.day}
SUBJECT: ${day.subject || ""}
UNIT: ${day.unit || ""}
CHAPTER: ${day.chapter || ""}

TOPIC:
${topic}

SUBTOPICS:
${JSON.stringify(subtopics)}

STRICT RULES:

1. Cover ONLY this topic.
2. Do not discuss other syllabus topics.
3. Make the explanation suitable for NEET preparation.
4. Prioritize concepts that can actually be tested.
5. Include important definitions.
6. Include mechanisms/processes where relevant.
7. Include formulas and relationships where relevant.
8. Include important factual information where relevant.
9. Include exceptions and distinctions where relevant.
10. Include common NEET traps/mistakes where relevant.
11. Do not add unnecessary motivational text.
12. Do not repeat the same point.
13. Be concise enough for a student to revise.
14. Do not fabricate facts.
15. Use standard scientific terminology.
16. Return ONLY JSON.

Required JSON:

{
  "topic": "${topic}",
  "heading": "string",
  "content": "complete explanation",
  "subsections": [
    {
      "heading": "string",
      "content": "string"
    }
  ],
  "keyPoints": [
    "important point"
  ],
  "neetTips": [
    "high-yield exam point"
  ]
}
`;
}

function buildMcqPrompt(day, topicRecord, lesson) {
  const topic = topicRecord.topic;

  return `
Create original NEET-level MCQs ONLY from the syllabus topic below.

DAY: ${day.day}
SUBJECT: ${day.subject || ""}
CHAPTER: ${day.chapter || ""}
TOPIC: ${topic}

Generate approximately 3 to 5 high-quality MCQs.

IMPORTANT:

- These must be genuine NEET/public-exam-level questions.
- Mix conceptual, factual, application and statement-based questions
  when appropriate to the topic.
- Do not make artificial difficulty.
- Do not create questions outside the supplied topic.
- Do not use information not taught by or directly required for this topic.
- Each question must have exactly 4 options.
- Exactly one option must be correct.
- Avoid ambiguous questions.
- Avoid duplicate questions.
- Avoid trick wording that depends on interpretation.
- Explanations must clearly justify the correct answer.
- Use scientifically accurate terminology.
- Do not force a particular number if fewer excellent questions are
  appropriate.
- Quality is more important than quantity.
- Return ONLY JSON.

Topic lesson:

${JSON.stringify(lesson)}

Return:

{
  "mcqs": [
    {
      "question": "string",
      "options": [
        "option A",
        "option B",
        "option C",
        "option D"
      ],
      "correctAnswer": "A",
      "explanation": "string"
    }
  ]
}
`;
}

function validateLesson(lesson, topic) {
  if (!lesson || typeof lesson !== "object") {
    throw new Error(
      `Invalid lesson for topic: ${topic}`
    );
  }

  if (!lesson.content) {
    throw new Error(
      `Lesson content missing for topic: ${topic}`
    );
  }

  if (
    !Array.isArray(lesson.keyPoints)
  ) {
    lesson.keyPoints = [];
  }

  if (
    !Array.isArray(lesson.neetTips)
  ) {
    lesson.neetTips = [];
  }

  if (
    !Array.isArray(lesson.subsections)
  ) {
    lesson.subsections = [];
  }

  return lesson;
}

function validateMcqs(mcqs, topic) {
  if (!Array.isArray(mcqs)) {
    throw new Error(
      `MCQ response is invalid for topic: ${topic}`
    );
  }

  const valid = [];

  for (const q of mcqs) {
    if (!q || typeof q !== "object") {
      continue;
    }

    if (!q.question) {
      continue;
    }

    if (
      !Array.isArray(q.options) ||
      q.options.length !== 4
    ) {
      continue;
    }

    if (
      !["A", "B", "C", "D"].includes(
        String(q.correctAnswer).toUpperCase()
      )
    ) {
      continue;
    }

    if (!q.explanation) {
      continue;
    }

    valid.push({
      question: String(q.question).trim(),

      options: q.options.map(
        option => String(option).trim()
      ),

      correctAnswer:
        String(q.correctAnswer)
          .trim()
          .toUpperCase(),

      explanation:
        String(q.explanation).trim(),

      topic
    });
  }

  return valid;
}

async function generateTopic(topicRecord, day) {
  const topic = topicRecord.topic;

  console.log("");
  console.log("----------------------------------------------");
  console.log(`TOPIC: ${topic}`);
  console.log("----------------------------------------------");

  console.log("Generating lesson...");

  const lesson = validateLesson(
    await callGroq(
      buildLessonPrompt(day, topicRecord),
      `Lesson [${topic}]`
    ),
    topic
  );

  console.log("Lesson generated.");

  console.log("Generating topic MCQs...");

  const mcqResult = await callGroq(
    buildMcqPrompt(day, topicRecord, lesson),
    `MCQ [${topic}]`
  );

  const mcqs = validateMcqs(
    mcqResult?.mcqs,
    topic
  );

  console.log(
    `MCQs generated: ${mcqs.length}`
  );

  return {
    lesson,
    mcqs
  };
}

async function main() {
  const syllabus = readJson(SYLLABUS_FILE);
  const config = readJson(CONFIG_FILE);

  const days = getDays(syllabus);

  const totalDays = Number(
    config.totalDays
  );

  if (days.length !== totalDays) {
    fail(
      `Syllabus contains ${days.length} days but config requires ${totalDays}.`
    );
  }

  const last = lastGeneratedDay();
  const next = last + 1;

  console.log("");
  console.log("==============================================");
  console.log(" VIDHWAAN NEET — DAILY AI GENERATOR");
  console.log("==============================================");
  console.log(`Last generated : ${last}`);
  console.log(`Next day       : ${next}`);
  console.log(`Total days     : ${totalDays}`);
  console.log(`Start date     : ${config.courseStartDate}`);
  console.log(`Model          : ${MODEL}`);
  console.log("Strategy       : topic-by-topic");
  console.log("MCQs/topic     : approximately 3–5");
  console.log("MCQ minimum    : NONE");
  console.log("MCQ maximum    : NONE");
  console.log("==============================================");

  if (next > totalDays) {
    console.log(
      "All 365 lessons are already generated."
    );
    return;
  }

  const day = days.find(
    item => Number(item.day) === next
  );

  if (!day) {
    fail(
      `Day ${next} not found in syllabus.json.`
    );
  }

  const output = path.join(
    DATA_DIR,
    `day-${String(next).padStart(3, "0")}.json`
  );

  if (fs.existsSync(output)) {
    fail(
      `Safety stop: ${output} already exists.`
    );
  }

  const date = courseDate(
    config.courseStartDate,
    next
  );

  const publishAt =
    `${date}T06:00:00+05:30`;

  const topics = extractTopics(day);

  if (topics.length === 0) {
    fail(
      `Day ${next} contains no usable topics.`
    );
  }

  console.log("");
  console.log(`Syllabus       : Day ${next}`);
  console.log(`Course date    : ${date}`);
  console.log(`Publish at     : ${publishAt}`);
  console.log(`Topics         : ${topics.length}`);

  const sections = [];
  const allMcqs = [];

  for (let i = 0; i < topics.length; i++) {
    const topicRecord = topics[i];

    console.log("");
    console.log(
      `PROCESSING TOPIC ${i + 1}/${topics.length}`
    );

    let result;

    try {
      result =
        await generateTopic(
          topicRecord,
          day
        );
    } catch (error) {
      fail(
        `Topic failed: ${topicRecord.topic}\n\n${error.message}`
      );
    }

    sections.push(result.lesson);
    allMcqs.push(...result.mcqs);

    /*
     * Small delay helps avoid hammering the API
     * with back-to-back requests.
     */
    if (i < topics.length - 1) {
      await sleep(700);
    }
  }

  const generated = {
    day: next,

    courseDate: date,

    publishAt,

    title:
      day.title ||
      `${day.chapter || "NEET"} — Day ${next}`,

    subject:
      day.subject || "",

    unit:
      day.unit || "",

    chapter:
      day.chapter || "",

    neetFocus:
      Array.isArray(day.neetFocus)
        ? day.neetFocus
        : [],

    learningOutcome:
      Array.isArray(day.learningOutcome)
        ? day.learningOutcome
        : [],

    sections,

    mcqs: allMcqs
  };

  if (
    !Array.isArray(generated.sections) ||
    generated.sections.length !== topics.length
  ) {
    fail(
      `Lesson section count mismatch. Expected ${topics.length}, got ${generated.sections.length}.`
    );
  }

  /*
   * No artificial MCQ minimum.
   *
   * The syllabus determines the number of topics.
   * Each topic independently contributes quality MCQs.
   */
  if (!Array.isArray(generated.mcqs)) {
    fail("MCQ array missing.");
  }

  fs.mkdirSync(
    DATA_DIR,
    { recursive: true }
  );

  fs.writeFileSync(
    output,
    JSON.stringify(
      generated,
      null,
      2
    ) + "\n",
    "utf8"
  );

  console.log("");
  console.log("==============================================");
  console.log(" DAILY LESSON GENERATED SUCCESSFULLY");
  console.log("==============================================");
  console.log(`Day       : ${next}`);
  console.log(`Date      : ${date}`);
  console.log(`Output    : ${path.relative(ROOT, output)}`);
  console.log(`Topics    : ${sections.length}`);
  console.log(`MCQs      : ${allMcqs.length}`);
  console.log("Validation: PASSED");
  console.log("==============================================");
}

main().catch(
  error =>
    fail(
      error?.stack ||
      error?.message ||
      String(error)
    )
);

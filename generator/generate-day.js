import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const SYLLABUS_FILE = path.join(ROOT, "syllabus.json");
const CONFIG_FILE = path.join(ROOT, "config", "app-config.json");
const DATA_DIR = path.join(ROOT, "public", "data");

const MIN_MCQS = 40;

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
  if (typeof startDate !== "string") {
    fail("courseStartDate must be a string in YYYY-MM-DD format.");
  }

  const parts = startDate.split("-").map(Number);

  if (
    parts.length !== 3 ||
    parts.some(Number.isNaN)
  ) {
    fail(`Invalid courseStartDate: ${startDate}`);
  }

  const [year, month, day] = parts;

  const date = new Date(
    Date.UTC(year, month - 1, day)
  );

  if (Number.isNaN(date.getTime())) {
    fail(`Invalid courseStartDate: ${startDate}`);
  }

  date.setUTCDate(
    date.getUTCDate() + dayNumber - 1
  );

  return date.toISOString().slice(0, 10);
}

function extractJson(text) {
  let cleaned = String(text).trim();

  /*
   * Remove accidental Markdown code fences.
   */
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
      `${error.message}\n\n` +
      `RAW RESPONSE:\n${text}`
    );
  }
}

async function generateWithGroq(prompt) {
  const key = process.env.GROQ_API_KEY;
  const model =
    process.env.GROQ_MODEL ||
    "openai/gpt-oss-120b";

  if (!key) {
    throw new Error("GROQ_API_KEY is missing.");
  }

  const response = await fetch(
    "https://api.groq.com/openai/v1/chat/completions",
    {
      method: "POST",

      headers: {
        "Authorization": `Bearer ${key}`,
        "Content-Type": "application/json"
      },

      body: JSON.stringify({
        model,

        temperature: 0.2,

        response_format: {
          type: "json_object"
        },

        messages: [
          {
            role: "system",

            content:
              "You are an expert NEET preparation content author. " +
              "Create accurate, comprehensive, student-friendly " +
              "English NEET study content. " +
              "Follow the supplied syllabus exactly. " +
              "Return ONLY valid JSON."
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

  let result;

  try {
    result = JSON.parse(body);
  } catch (error) {
    throw new Error(
      `Groq API returned invalid JSON:\n${error.message}`
    );
  }

  const content =
    result?.choices?.[0]?.message?.content;

  if (!content) {
    throw new Error(
      "Groq returned no message content."
    );
  }

  return content;
}

function buildPrompt(day) {
  return `
Create the COMPLETE English NEET study lesson for EXACTLY this syllabus day.

============================================================
STRICT SYLLABUS RULE
============================================================

This request is for ONE daily lesson only.

Use ONLY the supplied syllabus object for this day.

DO NOT:

- generate content for another day
- generate another chapter
- generate unrelated topics
- introduce future syllabus content
- skip supplied topics
- skip supplied subtopics
- replace supplied topics with your own topics

Every topic and every subtopic supplied in the syllabus MUST be
covered in the generated lesson.

The generated lesson must remain completely aligned with this
specific day's syllabus.

============================================================
LESSON REQUIREMENTS
============================================================

Create a complete NEET preparation lesson.

The explanation must be useful even for a weak student.

For every applicable concept, explain:

- definition
- meaning
- core concept
- important facts
- mechanism
- process
- relationships
- formulas
- units
- important values
- examples
- comparisons
- exceptions
- common mistakes
- NEET-focused facts
- commonly tested concepts

Do not add unrelated information merely to make the lesson longer.

The objective is COMPLETE CONCEPTUAL COVERAGE of this day's syllabus.

Use clear headings and subheadings.

Each supplied topic should have its own section.

Where supplied subtopics exist, cover them explicitly.

============================================================
MCQ REQUIREMENT
============================================================

Generate a LARGE, HIGH-QUALITY MCQ BANK for this day's syllabus.

MINIMUM REQUIRED MCQs: ${MIN_MCQS}

Generate MORE THAN ${MIN_MCQS} when the day's syllabus genuinely
contains enough distinct concepts to justify more questions.

DO NOT create filler questions simply to reach the minimum.

The MCQ bank must collectively cover the COMPLETE day's syllabus.

Distribute questions across ALL supplied topics and subtopics.

Before generating the MCQs, identify the important concepts contained
in every topic and subtopic and construct questions that test those
concepts.

Include a balanced mixture of:

1. Basic concept questions
2. Definition questions
3. Understanding questions
4. Concept application questions
5. Mechanism/process questions
6. Formula-based questions where applicable
7. Numerical questions where applicable
8. Important factual NEET questions
9. Comparison questions
10. Cause-and-effect questions
11. Exception questions
12. Common-trap questions
13. Statement-based conceptual questions
14. Higher-order NEET-style questions

IMPORTANT MCQ RULES:

- Every MCQ MUST come from this day's syllabus.
- Every MCQ MUST have exactly 4 options.
- Every MCQ MUST have exactly one correct answer.
- Do not create ambiguous questions.
- Do not create two options that could reasonably both be correct.
- Do not repeat the same question with minor wording changes.
- Do not use "All of the above".
- Do not use "None of the above".
- Avoid unnecessarily confusing wording.
- Use scientifically accurate terminology.
- Numerical questions must be internally consistent.
- Numerical questions must have a clearly correct option.
- Every MCQ MUST contain an explanation.
- The explanation must explain why the correct answer is correct.
- Questions must test understanding, not merely wording.
- Cover the entire day's syllabus rather than concentrating on one topic.

============================================================
MCQ DISTRIBUTION
============================================================

Do NOT put almost all questions under the first topic.

Questions should be distributed according to the conceptual importance
and size of each topic/subtopic.

Every major topic should have multiple questions.

Every meaningful subtopic should be tested where appropriate.

============================================================
ANSWER FORMAT
============================================================

correctAnswer MUST be exactly one of:

"A"
"B"
"C"
"D"

The corresponding option must actually be the correct answer.

============================================================
FINAL QUALITY CHECK
============================================================

Before returning the JSON, internally verify:

1. Every syllabus topic is covered.
2. Every syllabus subtopic is covered.
3. No unrelated topic was added.
4. There are at least ${MIN_MCQS} MCQs.
5. MCQs are distributed across the syllabus.
6. There are no obvious duplicate questions.
7. Every MCQ has exactly 4 options.
8. Every MCQ has exactly one correct answer.
9. correctAnswer is A, B, C, or D.
10. Every MCQ has an explanation.
11. Numerical answers are correct.
12. The generated day matches the supplied day.

============================================================
JSON ONLY
============================================================

Return ONLY valid JSON.

DO NOT return:

- Markdown
- code fences
- commentary
- notes outside JSON

Required JSON shape:

{
  "day": number,

  "title": "string",

  "subject": "string",

  "unit": "string",

  "chapter": "string",

  "neetFocus": [
    "string"
  ],

  "learningOutcome": [
    "string"
  ],

  "sections": [
    {
      "topic": "string",

      "heading": "string",

      "content": "complete clear explanation",

      "subsections": [
        {
          "heading": "string",
          "content": "clear detailed explanation"
        }
      ],

      "keyPoints": [
        "string"
      ],

      "neetTips": [
        "string"
      ]
    }
  ],

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

      "explanation": "clear explanation of why the answer is correct"
    }
  ]
}

============================================================
TODAY'S SYLLABUS
============================================================

${JSON.stringify(day, null, 2)}
`;
}

function validateGenerated(data, expectedDay) {
  if (
    !data ||
    typeof data !== "object" ||
    Array.isArray(data)
  ) {
    throw new Error(
      "Generated lesson is not a valid object."
    );
  }

  if (Number(data.day) !== expectedDay) {
    throw new Error(
      `Generated day mismatch. ` +
      `Expected ${expectedDay}, got ${data.day}.`
    );
  }

  if (
    typeof data.title !== "string" ||
    !data.title.trim()
  ) {
    throw new Error("Missing title.");
  }

  if (
    !Array.isArray(data.sections) ||
    data.sections.length === 0
  ) {
    throw new Error(
      "Missing lesson sections."
    );
  }

  if (
    !Array.isArray(data.mcqs) ||
    data.mcqs.length < MIN_MCQS
  ) {
    throw new Error(
      `Insufficient MCQs. Expected at least ` +
      `${MIN_MCQS}, got ` +
      `${Array.isArray(data.mcqs) ? data.mcqs.length : 0}.`
    );
  }

  for (const [i, section] of data.sections.entries()) {
    if (
      !section ||
      typeof section !== "object"
    ) {
      throw new Error(
        `Section ${i + 1}: invalid object.`
      );
    }

    if (
      !section.topic ||
      typeof section.topic !== "string"
    ) {
      throw new Error(
        `Section ${i + 1}: missing topic.`
      );
    }

    if (
      !section.heading ||
      typeof section.heading !== "string"
    ) {
      throw new Error(
        `Section ${i + 1}: missing heading.`
      );
    }

    if (
      !section.content ||
      typeof section.content !== "string"
    ) {
      throw new Error(
        `Section ${i + 1}: missing content.`
      );
    }

    if (
      section.subsections !== undefined &&
      !Array.isArray(section.subsections)
    ) {
      throw new Error(
        `Section ${i + 1}: subsections must be an array.`
      );
    }

    if (
      section.keyPoints !== undefined &&
      !Array.isArray(section.keyPoints)
    ) {
      throw new Error(
        `Section ${i + 1}: keyPoints must be an array.`
      );
    }

    if (
      section.neetTips !== undefined &&
      !Array.isArray(section.neetTips)
    ) {
      throw new Error(
        `Section ${i + 1}: neetTips must be an array.`
      );
    }
  }

  const duplicateQuestions = new Set();

  for (const [i, q] of data.mcqs.entries()) {
    const number = i + 1;

    if (
      !q ||
      typeof q !== "object" ||
      Array.isArray(q)
    ) {
      throw new Error(
        `MCQ ${number}: invalid object.`
      );
    }

    if (
      !q.question ||
      typeof q.question !== "string" ||
      !q.question.trim()
    ) {
      throw new Error(
        `MCQ ${number}: missing question.`
      );
    }

    const normalizedQuestion =
      q.question
        .trim()
        .toLowerCase()
        .replace(/\s+/g, " ");

    if (
      duplicateQuestions.has(normalizedQuestion)
    ) {
      throw new Error(
        `MCQ ${number}: duplicate question detected.`
      );
    }

    duplicateQuestions.add(
      normalizedQuestion
    );

    if (
      !Array.isArray(q.options) ||
      q.options.length !== 4
    ) {
      throw new Error(
        `MCQ ${number}: must have exactly 4 options.`
      );
    }

    if (
      q.options.some(
        option =>
          typeof option !== "string" ||
          !option.trim()
      )
    ) {
      throw new Error(
        `MCQ ${number}: all four options must contain text.`
      );
    }

    if (
      new Set(
        q.options.map(
          option =>
            option.trim().toLowerCase()
        )
      ).size !== 4
    ) {
      throw new Error(
        `MCQ ${number}: options must be unique.`
      );
    }

    if (
      !["A", "B", "C", "D"].includes(
        q.correctAnswer
      )
    ) {
      throw new Error(
        `MCQ ${number}: correctAnswer must be A, B, C, or D.`
      );
    }

    if (
      !q.explanation ||
      typeof q.explanation !== "string" ||
      !q.explanation.trim()
    ) {
      throw new Error(
        `MCQ ${number}: missing explanation.`
      );
    }
  }
}

async function main() {
  const syllabus = readJson(
    SYLLABUS_FILE
  );

  const config = readJson(
    CONFIG_FILE
  );

  const days = getDays(syllabus);

  const totalDays =
    Number(config.totalDays);

  if (
    !Number.isInteger(totalDays) ||
    totalDays <= 0
  ) {
    fail(
      `Invalid totalDays in config: ${config.totalDays}`
    );
  }

  if (days.length !== totalDays) {
    fail(
      `Syllabus contains ${days.length} days ` +
      `but config requires ${totalDays}.`
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
  console.log(
    `Start date     : ${config.courseStartDate}`
  );
  console.log("Language       : English");
  console.log(`Minimum MCQs   : ${MIN_MCQS}`);
  console.log("==============================================");

  if (next > totalDays) {
    console.log(
      "All lessons are already generated."
    );
    return;
  }

  /*
   * IMPORTANT:
   * The generator only creates the NEXT missing day.
   *
   * It never creates future days.
   */
  const output = path.join(
    DATA_DIR,
    `day-${String(next).padStart(3, "0")}.json`
  );

  if (fs.existsSync(output)) {
    fail(
      `Safety stop: ${output} already exists.`
    );
  }

  const day = days.find(
    item => Number(item.day) === next
  );

  if (!day) {
    fail(
      `Day ${next} not found in syllabus.json.`
    );
  }

  const date = courseDate(
    config.courseStartDate,
    next
  );

  const publishAt =
    `${date}T06:00:00+05:30`;

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
    `Output         : ${path.relative(ROOT, output)}`
  );

  console.log("");
  console.log(
    "Sending ONLY this day's syllabus to Groq..."
  );

  let generated;

  try {
    generated = extractJson(
      await generateWithGroq(
        buildPrompt(day)
      )
    );
  } catch (error) {
    fail(error.message);
  }

  /*
   * Server-side metadata is authoritative.
   * Never trust the AI to choose these values.
   */
  generated.day = next;
  generated.courseDate = date;
  generated.publishAt = publishAt;

  try {
    validateGenerated(
      generated,
      next
    );
  } catch (error) {
    fail(error.message);
  }

  /*
   * Make absolutely sure the destination directory exists.
   */
  fs.mkdirSync(
    DATA_DIR,
    {
      recursive: true
    }
  );

  /*
   * Final overwrite protection immediately before writing.
   */
  if (fs.existsSync(output)) {
    fail(
      `Safety stop: ${output} appeared before write.`
    );
  }

  fs.writeFileSync(
    output,
    JSON.stringify(
      generated,
      null,
      2
    ) + "\n",
    "utf8"
  );

  /*
   * Confirm the file was actually written and is valid JSON.
   */
  if (!fs.existsSync(output)) {
    fail(
      `Generation reported success but output file was not created:\n${output}`
    );
  }

  try {
    JSON.parse(
      fs.readFileSync(
        output,
        "utf8"
      )
    );
  } catch (error) {
    fail(
      `Generated file is not valid JSON:\n${error.message}`
    );
  }

  console.log("");
  console.log("==============================================");
  console.log(
    " DAILY LESSON GENERATED SUCCESSFULLY"
  );
  console.log("==============================================");
  console.log(`Day       : ${next}`);
  console.log(`Date      : ${date}`);
  console.log(
    `Output    : ${path.relative(ROOT, output)}`
  );
  console.log(
    `Sections  : ${generated.sections.length}`
  );
  console.log(
    `MCQs      : ${generated.mcqs.length}`
  );
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

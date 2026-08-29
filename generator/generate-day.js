import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();

const SYLLABUS_FILE = path.join(
  ROOT,
  "syllabus.json"
);

const CONFIG_FILE = path.join(
  ROOT,
  "config",
  "app-config.json"
);

const DATA_DIR = path.join(
  ROOT,
  "public",
  "data"
);

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
    return JSON.parse(
      fs.readFileSync(file, "utf8")
    );
  } catch (error) {
    fail(
      `Invalid JSON file:\n${file}\n${error.message}`
    );
  }
}

function getDays(root) {
  if (Array.isArray(root)) {
    return root;
  }

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

function courseDate(
  startDate,
  dayNumber
) {
  if (typeof startDate !== "string") {
    fail(
      "courseStartDate must be YYYY-MM-DD."
    );
  }

  const parts =
    startDate.split("-").map(Number);

  if (
    parts.length !== 3 ||
    parts.some(Number.isNaN)
  ) {
    fail(
      `Invalid courseStartDate: ${startDate}`
    );
  }

  const [
    year,
    month,
    day
  ] = parts;

  const date = new Date(
    Date.UTC(
      year,
      month - 1,
      day
    )
  );

  if (
    Number.isNaN(date.getTime())
  ) {
    fail(
      `Invalid courseStartDate: ${startDate}`
    );
  }

  date.setUTCDate(
    date.getUTCDate() +
    dayNumber -
    1
  );

  return date
    .toISOString()
    .slice(0, 10);
}

function extractJson(text) {
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
          /^```\s*/i,
          ""
        )
        .replace(
          /\s*```$/i,
          ""
        )
        .trim();
  }

  try {
    return JSON.parse(cleaned);
  } catch (error) {
    throw new Error(
      "Groq did not return valid JSON.\n" +
      error.message +
      "\n\nRAW RESPONSE:\n" +
      text
    );
  }
}

async function generateWithGroq(
  prompt,
  temperature = 0.2
) {
  const key =
    process.env.GROQ_API_KEY;

  const model =
    process.env.GROQ_MODEL ||
    "openai/gpt-oss-120b";

  if (!key) {
    throw new Error(
      "GROQ_API_KEY is missing."
    );
  }

  const response =
    await fetch(
      "https://api.groq.com/openai/v1/chat/completions",
      {
        method: "POST",

        headers: {
          "Authorization":
            `Bearer ${key}`,
          "Content-Type":
            "application/json"
        },

        body: JSON.stringify({
          model,

          temperature,

          response_format: {
            type: "json_object"
          },

          messages: [
            {
              role: "system",

              content:
                "You are an expert NEET " +
                "preparation content author. " +
                "Generate accurate, comprehensive, " +
                "student-friendly content. " +
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

  const body =
    await response.text();

  if (!response.ok) {
    throw new Error(
      `Groq HTTP ${response.status}: ${body}`
    );
  }

  let result;

  try {
    result =
      JSON.parse(body);
  } catch (error) {
    throw new Error(
      `Invalid Groq API response:\n${error.message}`
    );
  }

  const content =
    result
      ?.choices?.[0]
      ?.message
      ?.content;

  if (!content) {
    throw new Error(
      "Groq returned no message content."
    );
  }

  return content;
}

/*
 * ============================================================
 * LESSON GENERATION
 * ============================================================
 */

function buildLessonPrompt(day) {
  return `
Create the COMPLETE English NEET study lesson
for EXACTLY this syllabus day.

============================================================
STRICT SYLLABUS
============================================================

Use ONLY the supplied syllabus.

This is ONE daily lesson.

Do NOT:

- generate another day
- generate another chapter
- generate unrelated topics
- add future syllabus content
- skip any supplied topic
- skip any supplied subtopic

Every topic and subtopic supplied below must be covered.

============================================================
LESSON QUALITY
============================================================

Create a comprehensive NEET preparation lesson.

Explain concepts clearly enough for a weak student.

Where applicable include:

- definitions
- core concepts
- important facts
- mechanisms
- processes
- relationships
- formulas
- units
- important values
- examples
- comparisons
- exceptions
- common mistakes
- NEET-focused points
- frequently tested facts

Do not add unrelated syllabus content.

============================================================
IMPORTANT
============================================================

This call is ONLY for the lesson.

DO NOT generate MCQs.

The MCQs will be generated separately.

============================================================
JSON ONLY
============================================================

Return ONLY valid JSON.

Required structure:

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
      "content": "complete clear explanation",
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

============================================================
SYLLABUS FOR THIS DAY
============================================================

${JSON.stringify(
  day,
  null,
  2
)}
`;
}

/*
 * ============================================================
 * MCQ GENERATION
 * ============================================================
 */

function buildMcqPrompt(
  day,
  lesson
) {
  return `
Create a LARGE, HIGH-QUALITY NEET MCQ BANK
for EXACTLY this syllabus day.

============================================================
STRICT SYLLABUS RULE
============================================================

Use ONLY the supplied syllabus and lesson.

Do NOT generate questions from another day.

Do NOT introduce unrelated chapters.

Every important topic and subtopic must be represented.

============================================================
MCQ COUNT
============================================================

Generate AT LEAST ${MIN_MCQS} MCQs.

You may generate more than ${MIN_MCQS}
when the syllabus contains enough distinct
concepts to justify additional questions.

DO NOT create filler questions.

============================================================
COMPLETE CONCEPT COVERAGE
============================================================

The MCQ bank must collectively test:

- definitions
- fundamental concepts
- conceptual understanding
- mechanisms
- processes
- relationships
- applications
- formulas where applicable
- numerical problems where applicable
- important factual information
- comparisons
- cause and effect
- exceptions
- common mistakes
- NEET traps
- higher-order conceptual thinking

Distribute questions across the COMPLETE syllabus.

Do not put most questions on only one topic.

============================================================
STRICT MCQ RULES
============================================================

Every question MUST:

- be based only on this day's syllabus
- have exactly 4 options
- have exactly one correct answer
- have a clear unambiguous answer
- have an explanation
- use accurate scientific terminology

Do NOT:

- duplicate questions
- create near-duplicate questions
- use "All of the above"
- use "None of the above"
- create ambiguous options
- create two correct options
- create questions outside the syllabus

correctAnswer MUST be exactly:

"A"
"B"
"C"
"D"

============================================================
JSON ONLY
============================================================

Return ONLY valid JSON.

Required structure:

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
      "explanation": "clear explanation"
    }
  ]
}

Before returning JSON, internally verify:

- at least ${MIN_MCQS} questions
- every major topic covered
- every meaningful subtopic covered
- exactly four options per question
- exactly one correct answer
- no duplicate questions
- every question has an explanation
- correctAnswer is A/B/C/D

============================================================
TODAY'S SYLLABUS
============================================================

${JSON.stringify(
  day,
  null,
  2
)}

============================================================
GENERATED LESSON
============================================================

${JSON.stringify(
  lesson,
  null,
  2
)}
`;
}

/*
 * ============================================================
 * LESSON VALIDATION
 * ============================================================
 */

function validateLesson(
  data,
  expectedDay
) {
  if (
    !data ||
    typeof data !== "object" ||
    Array.isArray(data)
  ) {
    throw new Error(
      "Generated lesson is not a valid object."
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

  if (
    typeof data.title !==
      "string" ||
    !data.title.trim()
  ) {
    throw new Error(
      "Missing title."
    );
  }

  if (
    !Array.isArray(
      data.sections
    ) ||
    data.sections.length === 0
  ) {
    throw new Error(
      "Missing lesson sections."
    );
  }

  for (
    const [
      index,
      section
    ] of data.sections.entries()
  ) {
    if (
      !section ||
      typeof section !==
        "object"
    ) {
      throw new Error(
        `Section ${index + 1}: invalid object.`
      );
    }

    if (
      !section.topic ||
      typeof section.topic !==
        "string"
    ) {
      throw new Error(
        `Section ${index + 1}: missing topic.`
      );
    }

    if (
      !section.heading ||
      typeof section.heading !==
        "string"
    ) {
      throw new Error(
        `Section ${index + 1}: missing heading.`
      );
    }

    if (
      !section.content ||
      typeof section.content !==
        "string"
    ) {
      throw new Error(
        `Section ${index + 1}: missing content.`
      );
    }

    if (
      section.subsections !==
        undefined &&
      !Array.isArray(
        section.subsections
      )
    ) {
      throw new Error(
        `Section ${index + 1}: subsections must be an array.`
      );
    }

    if (
      section.keyPoints !==
        undefined &&
      !Array.isArray(
        section.keyPoints
      )
    ) {
      throw new Error(
        `Section ${index + 1}: keyPoints must be an array.`
      );
    }

    if (
      section.neetTips !==
        undefined &&
      !Array.isArray(
        section.neetTips
      )
    ) {
      throw new Error(
        `Section ${index + 1}: neetTips must be an array.`
      );
    }
  }
}

/*
 * ============================================================
 * MCQ VALIDATION
 * ============================================================
 */

function validateMcqs(
  data
) {
  if (
    !data ||
    typeof data !== "object" ||
    Array.isArray(data)
  ) {
    throw new Error(
      "Generated MCQ response is not a valid object."
    );
  }

  if (
    !Array.isArray(data.mcqs)
  ) {
    throw new Error(
      "Generated MCQ response does not contain an mcqs array."
    );
  }

  if (
    data.mcqs.length <
    MIN_MCQS
  ) {
    throw new Error(
      `Insufficient MCQs. ` +
      `Expected at least ${MIN_MCQS}, ` +
      `got ${data.mcqs.length}.`
    );
  }

  const questions =
    new Set();

  for (
    const [
      index,
      q
    ] of data.mcqs.entries()
  ) {
    const number =
      index + 1;

    if (
      !q ||
      typeof q !==
        "object" ||
      Array.isArray(q)
    ) {
      throw new Error(
        `MCQ ${number}: invalid object.`
      );
    }

    if (
      typeof q.question !==
        "string" ||
      !q.question.trim()
    ) {
      throw new Error(
        `MCQ ${number}: missing question.`
      );
    }

    const normalized =
      q.question
        .trim()
        .toLowerCase()
        .replace(
          /\s+/g,
          " "
        );

    if (
      questions.has(
        normalized
      )
    ) {
      throw new Error(
        `MCQ ${number}: duplicate question detected.`
      );
    }

    questions.add(
      normalized
    );

    if (
      !Array.isArray(
        q.options
      ) ||
      q.options.length !== 4
    ) {
      throw new Error(
        `MCQ ${number}: must have exactly 4 options.`
      );
    }

    if (
      q.options.some(
        option =>
          typeof option !==
            "string" ||
          !option.trim()
      )
    ) {
      throw new Error(
        `MCQ ${number}: all options must contain text.`
      );
    }

    const uniqueOptions =
      new Set(
        q.options.map(
          option =>
            option
              .trim()
              .toLowerCase()
        )
      );

    if (
      uniqueOptions.size !== 4
    ) {
      throw new Error(
        `MCQ ${number}: options must be unique.`
      );
    }

    if (
      ![
        "A",
        "B",
        "C",
        "D"
      ].includes(
        q.correctAnswer
      )
    ) {
      throw new Error(
        `MCQ ${number}: correctAnswer must be A, B, C, or D.`
      );
    }

    if (
      typeof q.explanation !==
        "string" ||
      !q.explanation.trim()
    ) {
      throw new Error(
        `MCQ ${number}: missing explanation.`
      );
    }
  }
}

/*
 * ============================================================
 * MAIN
 * ============================================================
 */

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
    getDays(
      syllabus
    );

  const totalDays =
    Number(
      config.totalDays
    );

  if (
    !Number.isInteger(
      totalDays
    ) ||
    totalDays <= 0
  ) {
    fail(
      `Invalid totalDays: ${config.totalDays}`
    );
  }

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
    "Language       : English"
  );
  console.log(
    `Minimum MCQs   : ${MIN_MCQS}`
  );
  console.log(
    "Generation     : Lesson + MCQ separate calls"
  );
  console.log(
    "=============================================="
  );

  if (
    next > totalDays
  ) {
    console.log(
      "All lessons are already generated."
    );
    return;
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

  console.log(
    `Syllabus       : Day ${next}`
  );

  console.log(
    `Course date    : ${date}`
  );

  console.log(
    `Publish at     : ${publishAt}`
  );

  /*
   * ----------------------------------------------------------
   * STEP 1 — LESSON
   * ----------------------------------------------------------
   */

  console.log("");
  console.log(
    "STEP 1/2 — Generating complete lesson..."
  );

  let lesson;

  try {
    const response =
      await generateWithGroq(
        buildLessonPrompt(day),
        0.2
      );

    lesson =
      extractJson(response);

    validateLesson(
      lesson,
      next
    );
  } catch (error) {
    fail(
      error?.stack ||
      error?.message ||
      String(error)
    );
  }

  console.log(
    `Lesson sections: ${lesson.sections.length}`
  );

  /*
   * ----------------------------------------------------------
   * STEP 2 — MCQS
   * ----------------------------------------------------------
   */

  console.log("");
  console.log(
    "STEP 2/2 — Generating comprehensive MCQ bank..."
  );

  let mcqData;

  try {
    const response =
      await generateWithGroq(
        buildMcqPrompt(
          day,
          lesson
        ),
        0.15
      );

    mcqData =
      extractJson(response);

    validateMcqs(
      mcqData
    );
  } catch (error) {
    fail(
      error?.stack ||
      error?.message ||
      String(error)
    );
  }

  console.log(
    `MCQs generated  : ${mcqData.mcqs.length}`
  );

  /*
   * ----------------------------------------------------------
   * MERGE
   * ----------------------------------------------------------
   */

  const generated = {
    ...lesson,

    day: next,

    courseDate: date,

    publishAt,

    mcqs:
      mcqData.mcqs
  };

  /*
   * ----------------------------------------------------------
   * FINAL VALIDATION
   * ----------------------------------------------------------
   */

  try {
    validateLesson(
      generated,
      next
    );

    validateMcqs(
      generated
    );
  } catch (error) {
    fail(
      `FINAL VALIDATION FAILED:\n${error.message}`
    );
  }

  /*
   * ----------------------------------------------------------
   * CREATE DIRECTORY
   * ----------------------------------------------------------
   */

  fs.mkdirSync(
    DATA_DIR,
    {
      recursive: true
    }
  );

  /*
   * ----------------------------------------------------------
   * FINAL OVERWRITE PROTECTION
   * ----------------------------------------------------------
   */

  if (
    fs.existsSync(output)
  ) {
    fail(
      `Safety stop: ${output} appeared before write.`
    );
  }

  /*
   * ----------------------------------------------------------
   * WRITE
   * ----------------------------------------------------------
   */

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
   * ----------------------------------------------------------
   * VERIFY FILE
   * ----------------------------------------------------------
   */

  if (
    !fs.existsSync(output)
  ) {
    fail(
      `Output file was not created:\n${output}`
    );
  }

  try {
    const written =
      JSON.parse(
        fs.readFileSync(
          output,
          "utf8"
        )
      );

    validateLesson(
      written,
      next
    );

    validateMcqs(
      written
    );
  } catch (error) {
    fail(
      `Written file verification failed:\n${error.message}`
    );
  }

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

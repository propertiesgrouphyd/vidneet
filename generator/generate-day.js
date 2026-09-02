import fs from "node:fs";
import path from "node:path";

import {
  buildLessonPrompt,
  buildMcqPrompt
} from "./prompt.js";

import {
  generateLesson,
  generateTopicMcqs
} from "./groq.js";

import {
  validateDayContent,
  validateMcqs
} from "./validate-day.js";

const ROOT = process.cwd();

const SYLLABUS_FILE =
  path.join(ROOT, "syllabus.json");

const CONFIG_FILE =
  path.join(ROOT, "config", "app-config.json");

const DATA_DIR =
  path.join(ROOT, "public", "data");


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
      `Invalid JSON:\n${file}\n${error.message}`
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


function getTopics(day) {
  const topics = [];

  function add(value) {
    if (!value) return;

    const text = String(value).trim();

    if (
      text &&
      !topics.includes(text)
    ) {
      topics.push(text);
    }
  }

  add(day.title);
  add(day.topic);
  add(day.chapter);

  if (Array.isArray(day.topics)) {
    for (const topic of day.topics) {
      if (typeof topic === "string") {
        add(topic);
      } else if (
        topic &&
        typeof topic === "object"
      ) {
        add(
          topic.topic ||
          topic.title ||
          topic.name
        );

        if (Array.isArray(topic.subtopics)) {
          for (const sub of topic.subtopics) {
            if (typeof sub === "string") {
              add(sub);
            }
          }
        }
      }
    }
  }

  if (Array.isArray(day.subtopics)) {
    for (const sub of day.subtopics) {
      add(
        typeof sub === "string"
          ? sub
          : sub?.title ||
            sub?.name ||
            sub?.topic
      );
    }
  }

  return topics;
}


/*
 * ------------------------------------------------------
 * NORMALIZE AI-GENERATED LESSON
 * ------------------------------------------------------
 *
 * Groq may occasionally return a valid JSON object
 * with learningOutcome in the wrong shape.
 *
 * The validator remains strict.
 * This function converts safe equivalent shapes into
 * the required canonical format before validation.
 */
function normalizeGeneratedLesson(
  lesson,
  syllabusDay
) {
  if (
    !lesson ||
    typeof lesson !== "object" ||
    Array.isArray(lesson)
  ) {
    throw new Error(
      "Groq returned an invalid lesson object."
    );
  }


  /*
   * learningOutcome
   *
   * Required final format:
   *
   * [
   *   "string",
   *   "string"
   * ]
   */


  if (
    typeof lesson.learningOutcome === "string"
  ) {
    const value =
      lesson.learningOutcome.trim();

    lesson.learningOutcome =
      value ? [value] : [];
  }


  else if (
    lesson.learningOutcome &&
    typeof lesson.learningOutcome === "object" &&
    !Array.isArray(lesson.learningOutcome)
  ) {
    const candidate =
      lesson.learningOutcome.items ||
      lesson.learningOutcome.outcomes ||
      lesson.learningOutcome.points ||
      lesson.learningOutcome.text ||
      lesson.learningOutcome.content;


    if (Array.isArray(candidate)) {
      lesson.learningOutcome =
        candidate
          .map(item => String(item).trim())
          .filter(Boolean);
    }

    else if (candidate) {
      lesson.learningOutcome = [
        String(candidate).trim()
      ];
    }

    else {
      lesson.learningOutcome = [];
    }
  }


  /*
   * If Groq returned null, undefined, or another
   * unexpected type, convert it to an empty array.
   */
  if (
    !Array.isArray(
      lesson.learningOutcome
    )
  ) {
    lesson.learningOutcome = [];
  }


  /*
   * Last-resort safe fallback.
   *
   * This prevents an otherwise valid lesson from
   * failing only because Groq omitted learningOutcome.
   */
  if (
    lesson.learningOutcome.length === 0
  ) {
    const chapter =
      String(
        syllabusDay?.chapter ||
        syllabusDay?.title ||
        "today's NEET topic"
      ).trim();

    lesson.learningOutcome = [
      `Understand the important NEET concepts, facts, and applications covered in ${chapter}.`
    ];
  }


  /*
   * Ensure every outcome is a clean string.
   */
  lesson.learningOutcome =
    lesson.learningOutcome
      .map(item => String(item).trim())
      .filter(Boolean);


  /*
   * ----------------------------------------------------
   * NORMALIZE MCQ ANSWER INDEX
   * ----------------------------------------------------
   *
   * The canonical format is:
   *
   * 0 = option A
   * 1 = option B
   * 2 = option C
   * 3 = option D
   *
   * This is mainly a safety layer if a lesson response
   * happens to contain MCQs despite the prompt.
   */

  if (Array.isArray(lesson.mcqs)) {
    lesson.mcqs =
      lesson.mcqs.map(mcq => {
        if (
          !mcq ||
          typeof mcq !== "object"
        ) {
          return mcq;
        }

        if (
          !Number.isInteger(mcq.answer)
        ) {
          const raw =
            mcq.correctAnswer ??
            mcq.correct_answer ??
            mcq.correctOption ??
            mcq.correct_option;

          if (typeof raw === "string") {
            const value =
              raw.trim().toUpperCase();

            if (/^[ABCD]$/.test(value)) {
              mcq.answer =
                value.charCodeAt(0) - 65;
            }

            else if (/^\d+$/.test(value)) {
              const number =
                Number(value);

              if (
                number >= 0 &&
                number <= 3
              ) {
                mcq.answer = number;
              }

              else if (
                number >= 1 &&
                number <= 4
              ) {
                mcq.answer =
                  number - 1;
              }
            }
          }
        }

        return mcq;
      });
  }


  return lesson;
}


function findLastGeneratedDay() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, {
      recursive: true
    });

    return 0;
  }

  let highest = 0;

  for (
    const file of fs.readdirSync(DATA_DIR)
  ) {
    const match =
      file.match(/^day-(\d{3})\.json$/);

    if (!match) continue;

    highest =
      Math.max(
        highest,
        Number(match[1])
      );
  }

  return highest;
}


function calculateCourseDate(
  startDate,
  dayNumber
) {
  const [year, month, day] =
    String(startDate)
      .split("-")
      .map(Number);

  if (
    !Number.isInteger(year) ||
    !Number.isInteger(month) ||
    !Number.isInteger(day)
  ) {
    fail(
      `Invalid courseStartDate: ${startDate}`
    );
  }

  const date =
    new Date(
      Date.UTC(
        year,
        month - 1,
        day
      )
    );

  date.setUTCDate(
    date.getUTCDate() +
    dayNumber -
    1
  );

  return date
    .toISOString()
    .slice(0, 10);
}


function createPublishAt(
  courseDate,
  publishTime
) {
  return (
    `${courseDate}T${publishTime}:00+05:30`
  );
}


function uniqueMcqs(mcqs) {
  const seen = new Set();
  const result = [];

  for (const mcq of mcqs) {
    const key =
      mcq.question
        .trim()
        .toLowerCase();

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    result.push(mcq);
  }

  return result;
}


async function main() {
  const syllabus =
    readJson(SYLLABUS_FILE);

  const config =
    readJson(CONFIG_FILE);

  const days =
    getDays(syllabus);

  const totalDays =
    Number(config.totalDays);

  if (
    days.length !== totalDays
  ) {
    fail(
      `Syllabus contains ${days.length} days but config requires ${totalDays}.`
    );
  }

  const lastDay =
    findLastGeneratedDay();

  const nextDay =
    lastDay + 1;

  console.log("");
  console.log("==============================================");
  console.log(" VIDHWAAN NEET — DAILY AI GENERATOR");
  console.log("==============================================");
  console.log(
    `Last generated : ${lastDay}`
  );
  console.log(
    `Next day       : ${nextDay}`
  );
  console.log(
    `Total days     : ${totalDays}`
  );
  console.log(
    `Model          : ${
      process.env.GROQ_MODEL ||
      "openai/gpt-oss-120b"
    }`
  );
  console.log(
    "Strategy       : lesson + topic MCQs"
  );
  console.log("==============================================");

  if (nextDay > totalDays) {
    console.log(
      "All 365 lessons are already generated."
    );
    return;
  }

  fs.mkdirSync(DATA_DIR, {
    recursive: true
  });

  const outputFile =
    path.join(
      DATA_DIR,
      `day-${String(nextDay).padStart(3, "0")}.json`
    );

  if (fs.existsSync(outputFile)) {
    fail(
      `Safety stop: ${outputFile} already exists.`
    );
  }

  const day =
    days.find(
      item =>
        Number(item.day) === nextDay
    );

  if (!day) {
    fail(
      `Day ${nextDay} was not found in syllabus.json.`
    );
  }

  const courseDate =
    calculateCourseDate(
      config.courseStartDate,
      nextDay
    );

  const publishAt =
    createPublishAt(
      courseDate,
      config.publishTime
    );

  const topics =
    getTopics(day);

  console.log("");
  console.log(
    `Syllabus day : ${nextDay}`
  );
  console.log(
    `Course date  : ${courseDate}`
  );
  console.log(
    `Publish at   : ${publishAt}`
  );
  console.log(
    `Topics found : ${topics.length}`
  );
  console.log("");


  /*
   * ------------------------------------------------------
   * STEP 1
   * LESSON
   * ------------------------------------------------------
   */

  console.log(
    "STEP 1 — Generating complete lesson..."
  );

  let lesson;

  try {
    lesson =
      await generateLesson(
        buildLessonPrompt(day)
      );

    /*
     * IMPORTANT:
     * Normalize BEFORE strict validation.
     */
    lesson =
      normalizeGeneratedLesson(
        lesson,
        day
      );

  } catch (error) {
    fail(
      `Lesson generation failed:\n${error.message}`
    );
  }


  /*
   * ------------------------------------------------------
   * STEP 2
   * VALIDATE LESSON
   * ------------------------------------------------------
   */

  try {
    validateDayContent(
      lesson,
      nextDay,
      topics
    );
  } catch (error) {
    fail(
      `Lesson validation failed:\n${error.message}`
    );
  }

  console.log(
    `Lesson sections: ${lesson.sections.length}`
  );


  /*
   * ------------------------------------------------------
   * STEP 3
   * MCQs
   *
   * One small Groq request per topic.
   * ------------------------------------------------------
   */

  console.log("");
  console.log(
    "STEP 2 — Generating topic-wise NEET MCQs..."
  );

  const allMcqs = [];

  for (
    let i = 0;
    i < topics.length;
    i++
  ) {
    const topic = topics[i];

    console.log(
      `MCQ ${i + 1}/${topics.length}: ${topic}`
    );

    try {
      const result =
        await generateTopicMcqs(
          buildMcqPrompt(
            day,
            topic
          )
        );

      if (
        !Array.isArray(
          result?.mcqs
        )
      ) {
        console.warn(
          `No MCQs returned for topic: ${topic}`
        );
        continue;
      }

      try {
        validateMcqs(
          result.mcqs
        );
      } catch (error) {
        console.warn(
          `Invalid MCQs skipped for ${topic}: ${error.message}`
        );
        continue;
      }

      for (
        const mcq of result.mcqs
      ) {
        allMcqs.push({
          ...mcq,
          topic
        });
      }

    } catch (error) {
      /*
       * Do not destroy the entire day's lesson
       * because one topic's MCQ request failed.
       */
      console.warn(
        `MCQ generation failed for "${topic}": ${error.message}`
      );
    }
  }


  const mcqs =
    uniqueMcqs(allMcqs);


  console.log("");
  console.log(
    `Valid MCQs collected: ${mcqs.length}`
  );


  /*
   * ------------------------------------------------------
   * FINAL OBJECT
   * ------------------------------------------------------
   */

  const generated = {
    day: nextDay,

    courseDate,

    publishAt,

    title:
      lesson.title,

    introduction:
      lesson.introduction,

    sections:
      lesson.sections,

    learningOutcome:
      lesson.learningOutcome,

    mcqs,

    generation: {
      model:
        process.env.GROQ_MODEL ||
        "openai/gpt-oss-120b",

      strategy:
        "3-5 MCQs per syllabus topic",

      topicCount:
        topics.length,

      mcqCount:
        mcqs.length
    }
  };


  /*
   * ------------------------------------------------------
   * FINAL SAFETY VALIDATION
   * ------------------------------------------------------
   */

  try {
    validateDayContent(
      generated,
      nextDay,
      topics
    );

    validateMcqs(
      generated.mcqs
    );

  } catch (error) {
    fail(
      `Final validation failed:\n${error.message}`
    );
  }


  /*
   * ------------------------------------------------------
   * WRITE ONLY AFTER VALIDATION
   * ------------------------------------------------------
   */

  fs.writeFileSync(
    outputFile,
    JSON.stringify(
      generated,
      null,
      2
    ) + "\n",
    "utf8"
  );


  console.log("");
  console.log("==============================================");
  console.log(" DAILY NEET LESSON GENERATED");
  console.log("==============================================");
  console.log(
    `Day       : ${nextDay}`
  );
  console.log(
    `Date      : ${courseDate}`
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
    `Output    : ${path.relative(ROOT, outputFile)}`
  );
  console.log(
    "Validation: PASSED"
  );
  console.log("==============================================");
}


main().catch(error => {
  fail(
    error?.stack ||
    error?.message ||
    String(error)
  );
});

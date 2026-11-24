
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

const PROGRESS_DIR =
  path.join(ROOT, "generator-progress");

const MIN_MCQS_PER_TOPIC = 5;
const MAX_MCQS_PER_TOPIC = 10;

const DAILY_QUOTA_ERROR =
  "GROQ_DAILY_QUOTA_EXHAUSTED";

/*
 * ------------------------------------------------------
 * GENERAL HELPERS
 * ------------------------------------------------------
 */

function fail(message) {
  throw new Error(message);
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

function writeJsonAtomic(file, data) {
  fs.mkdirSync(path.dirname(file), {
    recursive: true
  });

  const temporaryFile = `${file}.tmp`;

  fs.writeFileSync(
    temporaryFile,
    JSON.stringify(data, null, 2) + "\n",
    "utf8"
  );

  fs.renameSync(
    temporaryFile,
    file
  );
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

/*
 * ------------------------------------------------------
 * AUTHORITATIVE TOPIC EXTRACTION
 * ------------------------------------------------------
 *
 * Only day.topics are lesson section topics.
 *
 * chapter     = context/title
 * topics      = authoritative section topics
 * subtopics   = supporting requirements
 * neetFocus   = exam priorities
 *
 * Never add chapter or subtopics as separate topics.
 */

function getTopics(day) {
  if (!Array.isArray(day?.topics)) {
    fail(
      `Day ${day?.day ?? "unknown"} does not contain a valid topics array.`
    );
  }

  const topics = [];

  for (const item of day.topics) {
    let topic = null;

    if (typeof item === "string") {
      topic = item.trim();
    } else if (
      item &&
      typeof item === "object"
    ) {
      topic = String(
        item.topic ??
        item.title ??
        item.name ??
        ""
      ).trim();
    }

    if (!topic) {
      fail(
        `Day ${day.day} contains an invalid or empty topic.`
      );
    }

    if (topics.includes(topic)) {
      fail(
        `Day ${day.day} contains a duplicate syllabus topic: "${topic}"`
      );
    }

    topics.push(topic);
  }

  if (topics.length === 0) {
    fail(
      `Day ${day.day} contains no syllabus topics.`
    );
  }

  return topics;
}

function normalizeTopic(value) {
  return String(value ?? "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

function topicMatches(generated, expected) {
  return (
    normalizeTopic(generated) ===
    normalizeTopic(expected)
  );
}

/*
 * ------------------------------------------------------
 * COURSE DATE
 * ------------------------------------------------------
 */

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

function createPublishAt(
  courseDate,
  publishTime
) {
  return `${courseDate}T${publishTime}:00+05:30`;
}

/*
 * ------------------------------------------------------
 * GENERATED LESSON NORMALIZATION
 * ------------------------------------------------------
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

  if (
    typeof lesson.learningOutcome === "string"
  ) {
    const value =
      lesson.learningOutcome.trim();

    lesson.learningOutcome =
      value ? [value] : [];
  } else if (
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
    } else if (candidate) {
      lesson.learningOutcome = [
        String(candidate).trim()
      ];
    } else {
      lesson.learningOutcome = [];
    }
  }

  if (!Array.isArray(lesson.learningOutcome)) {
    lesson.learningOutcome = [];
  }

  if (lesson.learningOutcome.length === 0) {
    const chapter = String(
      syllabusDay?.chapter ||
      syllabusDay?.title ||
      "today's NEET topic"
    ).trim();

    lesson.learningOutcome = [
      `Understand the important NEET concepts, facts, and applications covered in ${chapter}.`
    ];
  }

  lesson.learningOutcome =
    lesson.learningOutcome
      .map(item => String(item).trim())
      .filter(Boolean);

  /*
   * Normalize MCQ answer indices if present.
   */
  if (Array.isArray(lesson.mcqs)) {
    lesson.mcqs = lesson.mcqs.map(mcq => {
      if (!mcq || typeof mcq !== "object") {
        return mcq;
      }

      if (!Number.isInteger(mcq.answer)) {
        const raw =
          mcq.correctAnswer ??
          mcq.correct_answer ??
          mcq.correctOption ??
          mcq.correct_option;

        if (typeof raw === "string") {
          const value = raw.trim().toUpperCase();

          if (/^[ABCD]$/.test(value)) {
            mcq.answer =
              value.charCodeAt(0) - 65;
          } else if (/^\d+$/.test(value)) {
            const number = Number(value);

            if (number >= 0 && number <= 3) {
              mcq.answer = number;
            } else if (number >= 1 && number <= 4) {
              mcq.answer = number - 1;
            }
          }
        }
      }

      return mcq;
    });
  }

  return lesson;
}

/*
 * ------------------------------------------------------
 * GENERATED DAY DISCOVERY
 * ------------------------------------------------------
 */

function findLastGeneratedDay() {
  fs.mkdirSync(DATA_DIR, {
    recursive: true
  });

  let highest = 0;

  for (const file of fs.readdirSync(DATA_DIR)) {
    const match =
      file.match(/^day-(\d{3})\.json$/);

    if (!match) continue;

    highest = Math.max(
      highest,
      Number(match[1])
    );
  }

  return highest;
}

/*
 * ------------------------------------------------------
 * PROGRESS FILE
 * ------------------------------------------------------
 */

function getProgressFile(dayNumber) {
  return path.join(
    PROGRESS_DIR,
    `day-${String(dayNumber).padStart(3, "0")}.progress.json`
  );
}

function createInitialProgress(
  dayNumber,
  courseDate,
  publishAt,
  topics
) {
  return {
    version: 1,

    day: dayNumber,

    courseDate,

    publishAt,

    topics,

    lesson: null,

    completedTopics: [],

    mcqsByTopic: {},

    nextTopicIndex: 0,

    updatedAt: new Date().toISOString()
  };
}

function saveProgress(progressFile, progress) {
  progress.updatedAt =
    new Date().toISOString();

  writeJsonAtomic(
    progressFile,
    progress
  );

  console.log("");
  console.log(
    `Progress saved: ${path.relative(ROOT, progressFile)}`
  );

  console.log(
    `Completed MCQ topics: ${progress.completedTopics.length}/${progress.topics.length}`
  );

  console.log(
    `Next topic index: ${progress.nextTopicIndex}`
  );
}

function loadProgress(
  progressFile,
  dayNumber,
  courseDate,
  publishAt,
  topics
) {
  if (!fs.existsSync(progressFile)) {
    console.log(
      "No previous progress found. Starting a new generation."
    );

    return createInitialProgress(
      dayNumber,
      courseDate,
      publishAt,
      topics
    );
  }

  const progress = readJson(progressFile);

  /*
   * Never resume progress from another day.
   */
  if (
    progress.version !== 1 ||
    Number(progress.day) !== dayNumber ||
    progress.courseDate !== courseDate ||
    progress.publishAt !== publishAt
  ) {
    fail(
      "Saved progress does not match the current course day. Refusing to resume."
    );
  }

  /*
   * Never resume if the syllabus topic list changed.
   */
  if (
    JSON.stringify(progress.topics) !==
    JSON.stringify(topics)
  ) {
    fail(
      "Syllabus topics differ from saved progress. Refusing to mix different syllabus versions."
    );
  }

  if (
    !Array.isArray(progress.completedTopics) ||
    !progress.mcqsByTopic ||
    typeof progress.mcqsByTopic !== "object"
  ) {
    fail(
      "Saved progress file is invalid or incomplete."
    );
  }

  console.log("");
  console.log(
    "Previous generation progress restored."
  );

  console.log(
    `Previously completed topics: ${progress.completedTopics.length}/${topics.length}`
  );

  return progress;
}

/*
 * ------------------------------------------------------
 * LESSON VALIDATION
 * ------------------------------------------------------
 */

function validateCompleteLesson(
  lesson,
  topics
) {
  validateDayContent(
    lesson,
    undefined,
    topics
  );

  if (!Array.isArray(lesson.sections)) {
    throw new Error(
      "Lesson sections must be an array."
    );
  }

  if (lesson.sections.length !== topics.length) {
    throw new Error(
      `Lesson section count ${lesson.sections.length} does not equal syllabus topic count ${topics.length}.`
    );
  }

  for (let i = 0; i < topics.length; i++) {
    const generatedTopic =
      lesson.sections[i]?.topic;

    const expectedTopic = topics[i];

    if (
      !topicMatches(
        generatedTopic,
        expectedTopic
      )
    ) {
      throw new Error(
        `Section ${i + 1} topic mismatch. Expected "${expectedTopic}" but received "${generatedTopic}".`
      );
    }
  }
}

/*
 * ------------------------------------------------------
 * LESSON GENERATION
 * ------------------------------------------------------
 */

async function generateCompleteLesson(
  day,
  topics,
  progress,
  progressFile
) {
  /*
   * Reuse the lesson if it was already generated
   * and saved in the previous run.
   */
  if (progress.lesson) {
    console.log("");
    console.log(
      "Restoring previously generated lesson."
    );

    const lesson =
      normalizeGeneratedLesson(
        progress.lesson,
        day
      );

    validateCompleteLesson(
      lesson,
      topics
    );

    return lesson;
  }

  let attempt = 0;

  while (true) {
    attempt++;

    console.log("");
    console.log(
      `Lesson generation attempt: ${attempt}`
    );

    try {
      let lesson = await generateLesson(
        buildLessonPrompt(day)
      );

      lesson = normalizeGeneratedLesson(
        lesson,
        day
      );

      validateCompleteLesson(
        lesson,
        topics
      );

      /*
       * Save lesson immediately after successful
       * generation and validation.
       */
      progress.lesson = lesson;

      saveProgress(
        progressFile,
        progress
      );

      console.log(
        "Lesson validation: PASSED"
      );

      return lesson;

    } catch (error) {
      /*
       * Daily quota errors must reach main().
       * Do not swallow them in this retry loop.
       */
      if (error?.code === DAILY_QUOTA_ERROR) {
        throw error;
      }

      console.warn("");
      console.warn(
        "Lesson validation/generation failed:"
      );

      console.warn(error.message);

      console.warn(
        "Retrying lesson generation."
      );
    }
  }
}

/*
 * ------------------------------------------------------
 * TOPIC MCQ GENERATION
 * ------------------------------------------------------
 */

async function generateCompleteTopicMcqs(
  day,
  topic
) {
  let attempt = 0;

  while (true) {
    attempt++;

    console.log(
      `  MCQ generation attempt ${attempt}: ${topic}`
    );

    try {
      const result = await generateTopicMcqs(
        buildMcqPrompt(day, topic)
      );

      if (!Array.isArray(result?.mcqs)) {
        throw new Error(
          "Groq did not return an mcqs array."
        );
      }

      validateMcqs(
        result.mcqs,
        MIN_MCQS_PER_TOPIC,
        MAX_MCQS_PER_TOPIC
      );

      const mcqs = result.mcqs.map(mcq => ({
        ...mcq,
        topic
      }));

      console.log(
        `  Valid MCQs collected: ${mcqs.length}`
      );

      return mcqs;

    } catch (error) {
      /*
       * Allow daily quota error to reach main().
       */
      if (error?.code === DAILY_QUOTA_ERROR) {
        throw error;
      }

      console.warn(
        `  Topic generation failed: ${error.message}`
      );

      console.warn(
        `  Retrying the same topic: ${topic}`
      );
    }
  }
}

/*
 * ------------------------------------------------------
 * MCQ DEDUPLICATION
 * ------------------------------------------------------
 *
 * Duplicates are checked within the same topic only.
 */

function uniqueMcqs(mcqs) {
  const seen = new Set();
  const result = [];

  for (const mcq of mcqs) {
    const key =
      `${normalizeTopic(mcq.topic)}::${String(mcq.question)
        .trim()
        .toLowerCase()}`;

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    result.push(mcq);
  }

  return result;
}

/*
 * ------------------------------------------------------
 * MCQ COUNT VALIDATION
 * ------------------------------------------------------
 */

function validateMcqCountPerTopic(
  mcqs,
  topics
) {
  for (const topic of topics) {
    const count = mcqs.filter(
      mcq =>
        topicMatches(mcq.topic, topic)
    ).length;

    if (
      count < MIN_MCQS_PER_TOPIC ||
      count > MAX_MCQS_PER_TOPIC
    ) {
      throw new Error(
        `MCQ count failure for "${topic}": expected ${MIN_MCQS_PER_TOPIC}-${MAX_MCQS_PER_TOPIC}, received ${count}.`
      );
    }
  }
}

/*
 * ------------------------------------------------------
 * RESTORE AND VERIFY SAVED MCQs
 * ------------------------------------------------------
 */

function restoreCompletedTopics(progress, topics) {
  const completed = new Set(
    progress.completedTopics
  );

  for (const topic of completed) {
    if (!topics.includes(topic)) {
      fail(
        `Saved progress contains an unknown topic: ${topic}`
      );
    }

    const mcqs = progress.mcqsByTopic[topic];

    if (!Array.isArray(mcqs)) {
      fail(
        `Saved progress is missing MCQs for topic: ${topic}`
      );
    }

    validateMcqs(
      mcqs,
      MIN_MCQS_PER_TOPIC,
      MAX_MCQS_PER_TOPIC
    );

    for (const mcq of mcqs) {
      if (!topicMatches(mcq.topic, topic)) {
        fail(
          `Saved MCQ topic mismatch for: ${topic}`
        );
      }
    }
  }

  /*
   * Determine the first unfinished topic.
   */
  let nextIndex = 0;

  while (
    nextIndex < topics.length &&
    completed.has(topics[nextIndex])
  ) {
    nextIndex++;
  }

  /*
   * Completed topics must form a continuous prefix.
   * This prevents skipping an unfinished topic.
   */
  for (let i = nextIndex + 1; i < topics.length; i++) {
    if (completed.has(topics[i])) {
      fail(
        `Progress order is invalid. Topic "${topics[i]}" is marked complete before earlier topics.`
      );
    }
  }

  progress.nextTopicIndex = nextIndex;

  return nextIndex;
}

/*
 * ------------------------------------------------------
 * GENERATE ALL TOPIC MCQs WITH CHECKPOINTS
 * ------------------------------------------------------
 */

async function generateAllTopicMcqs(
  day,
  topics,
  progress,
  progressFile
) {
  let nextIndex = restoreCompletedTopics(
    progress,
    topics
  );

  console.log("");
  console.log(
    `Resuming MCQ generation at topic ${nextIndex + 1}/${topics.length}.`
  );

  for (
    let i = nextIndex;
    i < topics.length;
    i++
  ) {
    const topic = topics[i];

    console.log("");
    console.log(
      `MCQ topic ${i + 1}/${topics.length}: ${topic}`
    );

    const topicMcqs =
      await generateCompleteTopicMcqs(
        day,
        topic
      );

    /*
     * Store completed topic content.
     */
    progress.mcqsByTopic[topic] =
      topicMcqs;

    progress.completedTopics.push(topic);

    progress.nextTopicIndex = i + 1;

    /*
     * CHECKPOINT AFTER EVERY COMPLETED TOPIC.
     *
     * If the next API call hits the daily quota,
     * all previous topics are already saved.
     */
    saveProgress(
      progressFile,
      progress
    );
  }

  const allMcqs = [];

  for (const topic of topics) {
    const topicMcqs =
      progress.mcqsByTopic[topic];

    if (!Array.isArray(topicMcqs)) {
      fail(
        `Missing saved MCQs for topic: ${topic}`
      );
    }

    allMcqs.push(...topicMcqs);
  }

  const mcqs = uniqueMcqs(allMcqs);

  validateMcqCountPerTopic(
    mcqs,
    topics
  );

  return mcqs;
}

/*
 * ------------------------------------------------------
 * BUILD FINAL JSON
 * ------------------------------------------------------
 */

function buildFinalLesson(
  dayNumber,
  courseDate,
  publishAt,
  lesson,
  topics,
  mcqs
) {
  return {
    day: dayNumber,

    courseDate,

    publishAt,

    title: lesson.title,

    introduction: lesson.introduction,

    sections: lesson.sections,

    learningOutcome: lesson.learningOutcome,

    mcqs,

    generation: {
      model:
        process.env.GROQ_MODEL ||
        "openai/gpt-oss-120b",

      strategy:
        "5-10 MCQs per exact syllabus topic with resumable topic checkpoints",

      topicCount: topics.length,

      mcqCount: mcqs.length
    }
  };
}

/*
 * ------------------------------------------------------
 * FINAL VALIDATION
 * ------------------------------------------------------
 */

function validateFinalLesson(
  generated,
  topics
) {
  validateCompleteLesson(
    generated,
    topics
  );

  validateMcqs(
    generated.mcqs
  );

  validateMcqCountPerTopic(
    generated.mcqs,
    topics
  );
}

/*
 * ------------------------------------------------------
 * MAIN GENERATION
 * ------------------------------------------------------
 */

async function main() {
  const syllabus = readJson(SYLLABUS_FILE);
  const config = readJson(CONFIG_FILE);

  const days = getDays(syllabus);

  const totalDays = Number(config.totalDays);

  if (days.length !== totalDays) {
    fail(
      `Syllabus contains ${days.length} days but config requires ${totalDays}.`
    );
  }

  const lastDay = findLastGeneratedDay();
  const nextDay = lastDay + 1;

  console.log("");
  console.log("==============================================");
  console.log(" VIDHWAAN NEET — DAILY AI GENERATOR");
  console.log("==============================================");

  console.log(`Last generated : ${lastDay}`);
  console.log(`Next day       : ${nextDay}`);
  console.log(`Total days     : ${totalDays}`);

  console.log(
    `Model          : ${process.env.GROQ_MODEL || "openai/gpt-oss-120b"}`
  );

  console.log(
    "Strategy       : resumable generation with topic checkpoints"
  );

  console.log("==============================================");

  if (nextDay > totalDays) {
    console.log(
      "All lessons are already generated."
    );

    return;
  }

  fs.mkdirSync(DATA_DIR, {
    recursive: true
  });

  fs.mkdirSync(PROGRESS_DIR, {
    recursive: true
  });

  const outputFile = path.join(
    DATA_DIR,
    `day-${String(nextDay).padStart(3, "0")}.json`
  );

  if (fs.existsSync(outputFile)) {
    fail(
      `Safety stop: ${outputFile} already exists.`
    );
  }

  const day = days.find(
    item => Number(item.day) === nextDay
  );

  if (!day) {
    fail(
      `Day ${nextDay} was not found in syllabus.json.`
    );
  }

  const courseDate = calculateCourseDate(
    config.courseStartDate,
    nextDay
  );

  const publishAt = createPublishAt(
    courseDate,
    config.publishTime
  );

  const topics = getTopics(day);

  const progressFile =
    getProgressFile(nextDay);

  console.log("");
  console.log(`Syllabus day : ${nextDay}`);
  console.log(`Course date  : ${courseDate}`);
  console.log(`Publish at   : ${publishAt}`);
  console.log(`Topics found : ${topics.length}`);

  /*
   * Restore progress if this day was interrupted.
   */
  const progress = loadProgress(
    progressFile,
    nextDay,
    courseDate,
    publishAt,
    topics
  );

  /*
   * STEP 1 — LESSON
   *
   * Lesson is saved immediately after it passes
   * complete section validation.
   */
  console.log("");
  console.log(
    "STEP 1 — Generating or restoring lesson..."
  );

  const lesson = await generateCompleteLesson(
    day,
    topics,
    progress,
    progressFile
  );

  console.log(
    `Lesson sections: ${lesson.sections.length}`
  );

  /*
   * STEP 2 — TOPIC MCQs
   *
   * Every completed topic is saved immediately.
   * Previously completed topics are not regenerated.
   */
  console.log("");
  console.log(
    "STEP 2 — Generating or restoring topic-wise MCQs..."
  );

  const mcqs = await generateAllTopicMcqs(
    day,
    topics,
    progress,
    progressFile
  );

  /*
   * STEP 3 — FINAL JSON
   */
  const generated = buildFinalLesson(
    nextDay,
    courseDate,
    publishAt,
    lesson,
    topics,
    mcqs
  );

  /*
   * Do not write the final lesson until every
   * validation passes.
   */
  validateFinalLesson(
    generated,
    topics
  );

  /*
   * Write final file atomically.
   */
  writeJsonAtomic(
    outputFile,
    generated
  );

  /*
   * Validate the exact written file.
   */
  try {
    const saved = readJson(outputFile);

    validateFinalLesson(
      saved,
      topics
    );

  } catch (error) {
    fs.rmSync(outputFile, {
      force: true
    });

    throw new Error(
      `Written file validation failed: ${error.message}`
    );
  }

  /*
   * Final lesson is complete.
   * Remove the progress checkpoint only after
   * successful final file validation.
   */
  fs.rmSync(progressFile, {
    force: true
  });

  console.log("");
  console.log("==============================================");
  console.log(" DAILY NEET LESSON GENERATED");
  console.log("==============================================");

  console.log(`Day       : ${nextDay}`);
  console.log(`Date      : ${courseDate}`);
  console.log(`Sections  : ${generated.sections.length}`);
  console.log(`Topics    : ${topics.length}`);
  console.log(`MCQs      : ${generated.mcqs.length}`);

  console.log(
    `Output    : ${path.relative(ROOT, outputFile)}`
  );

  console.log("Validation: PASSED");

  console.log("==============================================");
}

/*
 * ------------------------------------------------------
 * ERROR HANDLING
 * ------------------------------------------------------
 */

main().catch(error => {
  console.error("");
  console.error("==============================================");

  if (error?.code === DAILY_QUOTA_ERROR) {
    console.error(
      " GROQ DAILY QUOTA EXHAUSTED"
    );

    console.error(
      " Generation paused safely."
    );

    console.error(
      " Previously generated content is saved in the progress file."
    );

    console.error(
      " The next workflow run can resume from the saved checkpoint."
    );

    console.error("==============================================");

    /*
     * Exit code 2 is reserved for quota exhaustion.
     *
     * The workflow YAML will recognize this status,
     * upload the progress artifact, and avoid pushing
     * an incomplete lesson to the repository.
     */
    process.exitCode = 2;

    return;
  }

  console.error(
    " VIDHWAAN NEET — GENERATION FAILED"
  );

  console.error(
    error?.stack ||
    error?.message ||
    String(error)
  );

  console.error("==============================================");

  process.exitCode = 1;
});

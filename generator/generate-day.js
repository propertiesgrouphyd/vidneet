
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

const PROGRESS_VERSION = 2;

const MIN_MCQS_PER_TOPIC = 5;
const MAX_MCQS_PER_TOPIC = 10;

const DAILY_QUOTA_ERROR =
  "GROQ_DAILY_QUOTA_EXHAUSTED";


/* ============================================================
   GENERAL HELPERS
============================================================ */

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
  fs.mkdirSync(
    path.dirname(file),
    { recursive: true }
  );

  const temporaryFile =
    `${file}.tmp`;

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


/* ============================================================
   AUTHORITATIVE TOPIC EXTRACTION
============================================================ */

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


/* ============================================================
   COURSE DATE
============================================================ */

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


/* ============================================================
   GENERATED CONTENT NORMALIZATION
============================================================ */

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

  return lesson;
}


/* ============================================================
   GENERATED DAY DISCOVERY
============================================================ */

function findLastGeneratedDay() {
  fs.mkdirSync(
    DATA_DIR,
    { recursive: true }
  );

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


/* ============================================================
   PROGRESS FILE
============================================================ */

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
    version: PROGRESS_VERSION,

    day: dayNumber,

    courseDate,

    publishAt,

    topics,

    lesson: {
      title: "",
      introduction: "",
      sectionsByTopic: {},
      learningOutcome: [],
      nextSectionIndex: 0
    },

    completedTopics: [],

    mcqsByTopic: {},

    nextTopicIndex: 0,

    updatedAt: new Date().toISOString()
  };
}


function saveProgress(
  progressFile,
  progress
) {
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
    `Completed lesson sections: ${Object.keys(progress.lesson.sectionsByTopic).length}/${progress.topics.length}`
  );

  console.log(
    `Completed MCQ topics: ${progress.completedTopics.length}/${progress.topics.length}`
  );

  console.log(
    `Next lesson topic index: ${progress.lesson.nextSectionIndex}`
  );

  console.log(
    `Next MCQ topic index: ${progress.nextTopicIndex}`
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

    const progress = createInitialProgress(
      dayNumber,
      courseDate,
      publishAt,
      topics
    );

    // Create checkpoint BEFORE the first Groq request.
    saveProgress(
      progressFile,
      progress
    );

    return progress;
  }

  const progress = readJson(progressFile);

  if (
    progress.version !== PROGRESS_VERSION ||
    Number(progress.day) !== dayNumber ||
    progress.courseDate !== courseDate ||
    progress.publishAt !== publishAt
  ) {
    fail(
      "Saved progress does not match the current generation version or course day. Refusing to resume."
    );
  }

  if (
    JSON.stringify(progress.topics) !==
    JSON.stringify(topics)
  ) {
    fail(
      "Syllabus topics differ from saved progress. Refusing to mix different syllabus versions."
    );
  }

  if (
    !progress.lesson ||
    typeof progress.lesson !== "object" ||
    !progress.lesson.sectionsByTopic ||
    typeof progress.lesson.sectionsByTopic !== "object" ||
    !Array.isArray(progress.lesson.learningOutcome) ||
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
    `Saved lesson sections: ${Object.keys(progress.lesson.sectionsByTopic).length}/${topics.length}`
  );

  console.log(
    `Saved MCQ topics: ${progress.completedTopics.length}/${topics.length}`
  );

  return progress;
}


/* ============================================================
   LESSON VALIDATION
============================================================ */

function validateSingleSection(
  lesson,
  expectedTopic
) {
  if (
    !lesson ||
    typeof lesson !== "object" ||
    Array.isArray(lesson)
  ) {
    throw new Error(
      "Generated topic lesson is not an object."
    );
  }

  if (!lesson.title?.trim()) {
    throw new Error(
      "Missing lesson title."
    );
  }

  if (!lesson.introduction?.trim()) {
    throw new Error(
      "Missing lesson introduction."
    );
  }

  if (
    !Array.isArray(lesson.sections) ||
    lesson.sections.length !== 1
  ) {
    throw new Error(
      `Expected exactly one section for "${expectedTopic}".`
    );
  }

  if (!Array.isArray(lesson.learningOutcome)) {
    throw new Error(
      "learningOutcome must be an array."
    );
  }

  const section = lesson.sections[0];

  if (!topicMatches(section.topic, expectedTopic)) {
    throw new Error(
      `Topic mismatch. Expected "${expectedTopic}", received "${section.topic}".`
    );
  }

  validateDayContent(
    lesson,
    undefined,
    [expectedTopic]
  );

  return true;
}


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

  return true;
}


/* ============================================================
   TOPIC-SPECIFIC SYLLABUS
============================================================ */

function createTopicDay(
  day,
  originalTopic,
  topicName
) {
  const topicDay = {
    ...day
  };

  // Keep the original syllabus topic object and its
  // subtopics/context, but send only one topic to Groq.
  topicDay.topics = [
    originalTopic
  ];

  // Preserve the other day-level context.
  // The prompt builder receives the same syllabus structure
  // with only the authoritative topic narrowed.
  console.log(
    `Preparing isolated syllabus topic: ${topicName}`
  );

  return topicDay;
}


/* ============================================================
   GENERATE ONE LESSON SECTION AT A TIME
============================================================ */

async function generateSingleTopicSection(
  topicDay,
  topic
) {
  let attempt = 0;

  while (true) {
    attempt++;

    console.log("");
    console.log(
      `Lesson topic attempt ${attempt}: ${topic}`
    );

    try {
      const result = await generateLesson(
        buildLessonPrompt(topicDay)
      );

      const lesson = normalizeGeneratedLesson(
        result,
        topicDay
      );

      validateSingleSection(
        lesson,
        topic
      );

      return lesson;

    } catch (error) {
      if (error?.code === DAILY_QUOTA_ERROR) {
        throw error;
      }

      console.warn("");
      console.warn(
        `Lesson topic generation failed: ${error.message}`
      );

      console.warn(
        `Retrying only this topic: ${topic}`
      );
    }
  }
}


async function generateCompleteLesson(
  day,
  topics,
  progress,
  progressFile
) {
  const originalTopics = day.topics;

  const completedSections =
    progress.lesson.sectionsByTopic;

  let nextIndex = 0;

  // Restore and verify the saved section sequence.
  for (
    let i = 0;
    i < topics.length;
    i++
  ) {
    const topic = topics[i];

    const savedSection =
      completedSections[topic];

    if (!savedSection) {
      break;
    }

    validateSingleSection(
      {
        title: progress.lesson.title,
        introduction: progress.lesson.introduction,
        learningOutcome: progress.lesson.learningOutcome,
        sections: [savedSection]
      },
      topic
    );

    nextIndex++;
  }

  // No later topic may be marked complete if an
  // earlier topic is unfinished.
  for (
    let i = nextIndex + 1;
    i < topics.length;
    i++
  ) {
    if (completedSections[topics[i]]) {
      fail(
        `Lesson checkpoint order is invalid. "${topics[i]}" is saved before an earlier unfinished topic.`
      );
    }
  }

  progress.lesson.nextSectionIndex =
    nextIndex;

  saveProgress(
    progressFile,
    progress
  );

  console.log("");
  console.log(
    `Resuming lesson at topic ${nextIndex + 1}/${topics.length}.`
  );

  for (
    let i = nextIndex;
    i < topics.length;
    i++
  ) {
    const topic = topics[i];

    const originalTopic =
      originalTopics[i];

    console.log("");
    console.log(
      "============================================================"
    );

    console.log(
      `LESSON TOPIC ${i + 1}/${topics.length}: ${topic}`
    );

    console.log(
      "============================================================"
    );

    const topicDay = createTopicDay(
      day,
      originalTopic,
      topic
    );

    const generated =
      await generateSingleTopicSection(
        topicDay,
        topic
      );

    const section =
      generated.sections[0];

    // Save the first topic's title and introduction.
    if (i === 0) {
      progress.lesson.title =
        generated.title;

      progress.lesson.introduction =
        generated.introduction;
    }

    // Preserve learning outcomes from generated topics.
    for (
      const outcome of generated.learningOutcome
    ) {
      if (
        !progress.lesson.learningOutcome.includes(outcome)
      ) {
        progress.lesson.learningOutcome.push(outcome);
      }
    }

    // Store the completed section under its exact topic.
    progress.lesson.sectionsByTopic[topic] =
      section;

    progress.lesson.nextSectionIndex =
      i + 1;

    // IMPORTANT:
    // Checkpoint immediately after every successful topic.
    saveProgress(
      progressFile,
      progress
    );

    console.log(
      `Lesson section saved successfully: ${topic}`
    );
  }

  const sections = topics.map(topic => {
    const section =
      progress.lesson.sectionsByTopic[topic];

    if (!section) {
      fail(
        `Missing generated lesson section: ${topic}`
      );
    }

    return section;
  });

  const lesson = {
    title: progress.lesson.title,
    introduction: progress.lesson.introduction,
    sections,
    learningOutcome: progress.lesson.learningOutcome
  };

  validateCompleteLesson(
    lesson,
    topics
  );

  console.log("");
  console.log(
    `All ${sections.length} lesson sections passed validation.`
  );

  return lesson;
}


/* ============================================================
   TOPIC MCQ GENERATION
============================================================ */

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


/* ============================================================
   MCQ DEDUPLICATION
============================================================ */

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


/* ============================================================
   MCQ COUNT VALIDATION
============================================================ */

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


/* ============================================================
   RESTORE AND VERIFY SAVED MCQs
============================================================ */

function restoreCompletedTopics(
  progress,
  topics
) {
  const completed = new Set(
    progress.completedTopics
  );

  for (const topic of completed) {
    if (!topics.includes(topic)) {
      fail(
        `Saved progress contains an unknown topic: ${topic}`
      );
    }

    const mcqs =
      progress.mcqsByTopic[topic];

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

  let nextIndex = 0;

  while (
    nextIndex < topics.length &&
    completed.has(topics[nextIndex])
  ) {
    nextIndex++;
  }

  for (
    let i = nextIndex + 1;
    i < topics.length;
    i++
  ) {
    if (completed.has(topics[i])) {
      fail(
        `Progress order is invalid. Topic "${topics[i]}" is marked complete before an earlier topic.`
      );
    }
  }

  progress.nextTopicIndex =
    nextIndex;

  return nextIndex;
}


/* ============================================================
   GENERATE ALL TOPIC MCQs WITH CHECKPOINTS
============================================================ */

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

  saveProgress(
    progressFile,
    progress
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

    progress.mcqsByTopic[topic] =
      topicMcqs;

    progress.completedTopics.push(topic);

    progress.nextTopicIndex =
      i + 1;

    // Save immediately after every completed MCQ topic.
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


/* ============================================================
   BUILD FINAL JSON
============================================================ */

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
        "One validated lesson section per exact syllabus topic with resumable topic checkpoints and 5-10 MCQs per topic",

      topicCount: topics.length,

      mcqCount: mcqs.length
    }
  };
}


/* ============================================================
   FINAL VALIDATION
============================================================ */

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


/* ============================================================
   MAIN GENERATION
============================================================ */

async function main() {
  const syllabus =
    readJson(SYLLABUS_FILE);

  const config =
    readJson(CONFIG_FILE);

  const days = getDays(syllabus);

  const totalDays =
    Number(config.totalDays);

  if (days.length !== totalDays) {
    fail(
      `Syllabus contains ${days.length} days but config requires ${totalDays}.`
    );
  }

  const lastDay =
    findLastGeneratedDay();

  const nextDay =
    lastDay + 1;

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
    `Last generated : ${lastDay}`
  );

  console.log(
    `Next day       : ${nextDay}`
  );

  console.log(
    `Total days     : ${totalDays}`
  );

  console.log(
    `Model          : ${process.env.GROQ_MODEL || "openai/gpt-oss-120b"}`
  );

  console.log(
    "Lesson strategy: one topic per Groq request"
  );

  console.log(
    "Checkpoint     : after every completed topic"
  );

  console.log(
    "=============================================="
  );

  if (nextDay > totalDays) {
    console.log(
      "All lessons are already generated."
    );

    return;
  }

  fs.mkdirSync(
    DATA_DIR,
    { recursive: true }
  );

  fs.mkdirSync(
    PROGRESS_DIR,
    { recursive: true }
  );

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

  const progressFile =
    getProgressFile(nextDay);

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

  // Load or create checkpoint before any API request.
  const progress = loadProgress(
    progressFile,
    nextDay,
    courseDate,
    publishAt,
    topics
  );

  /* --------------------------------------------------------
     STEP 1 — LESSON SECTIONS
  -------------------------------------------------------- */

  console.log("");
  console.log(
    "STEP 1 — Generating or restoring topic-wise lesson sections..."
  );

  const lesson =
    await generateCompleteLesson(
      day,
      topics,
      progress,
      progressFile
    );

  console.log(
    `Lesson sections: ${lesson.sections.length}`
  );

  /* --------------------------------------------------------
     STEP 2 — TOPIC MCQs
  -------------------------------------------------------- */

  console.log("");
  console.log(
    "STEP 2 — Generating or restoring topic-wise MCQs..."
  );

  const mcqs =
    await generateAllTopicMcqs(
      day,
      topics,
      progress,
      progressFile
    );

  /* --------------------------------------------------------
     STEP 3 — FINAL JSON
  -------------------------------------------------------- */

  const generated =
    buildFinalLesson(
      nextDay,
      courseDate,
      publishAt,
      lesson,
      topics,
      mcqs
    );

  validateFinalLesson(
    generated,
    topics
  );

  // Write final file atomically.
  writeJsonAtomic(
    outputFile,
    generated
  );

  // Validate the exact written file.
  try {
    const saved =
      readJson(outputFile);

    validateFinalLesson(
      saved,
      topics
    );

  } catch (error) {
    fs.rmSync(
      outputFile,
      { force: true }
    );

    throw new Error(
      `Written file validation failed: ${error.message}`
    );
  }

  // Delete checkpoint only after final validation.
  fs.rmSync(
    progressFile,
    { force: true }
  );

  console.log("");

  console.log(
    "=============================================="
  );

  console.log(
    " DAILY NEET LESSON GENERATED"
  );

  console.log(
    "=============================================="
  );

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

  console.log(
    "Checkpoint: REMOVED AFTER SUCCESS"
  );

  console.log(
    "=============================================="
  );
}


/* ============================================================
   ERROR HANDLING
============================================================ */

main().catch(error => {
  console.error("");

  console.error(
    "=============================================="
  );

  if (error?.code === DAILY_QUOTA_ERROR) {
    console.error(
      " GROQ DAILY QUOTA EXHAUSTED"
    );

    console.error(
      " Generation paused safely."
    );

    console.error(
      " Completed lesson sections and MCQ topics are checkpointed."
    );

    console.error(
      " The next workflow run can resume from the saved progress."
    );

    console.error(
      " No incomplete lesson will be published."
    );

    console.error(
      "=============================================="
    );

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

  console.error(
    "=============================================="
  );

  process.exitCode = 1;
});

function fail(message) {
  throw new Error(
    `Day JSON validation failed: ${message}`
  );
}


function requireString(value, field) {
  if (
    typeof value !== "string" ||
    value.trim().length === 0
  ) {
    fail(
      `${field} must be a non-empty string.`
    );
  }
}


function requireArray(
  value,
  field,
  minimum = 1
) {
  if (!Array.isArray(value)) {
    fail(
      `${field} must be an array.`
    );
  }

  if (value.length < minimum) {
    fail(
      `${field} must contain at least ${minimum} item(s).`
    );
  }
}


function validateLearningOutcome(
  value
) {

  /*
   * learningOutcome must be an array
   * in the final generated day JSON.
   */

  if (!Array.isArray(value)) {
    fail(
      "learningOutcome must be an array."
    );
  }


  if (value.length === 0) {
    fail(
      "learningOutcome must contain at least 1 item."
    );
  }


  value.forEach(
    (item, index) => {

      requireString(
        item,
        `learningOutcome[${index}]`
      );
    }
  );
}


export function validateDayContent(
  data,
  expectedDay,
  expectedTopics
) {

  /*
   * ------------------------------------------------------
   * ROOT OBJECT
   * ------------------------------------------------------
   */

  if (
    !data ||
    typeof data !== "object" ||
    Array.isArray(data)
  ) {
    fail(
      "Generated lesson is not an object."
    );
  }


  /*
   * ------------------------------------------------------
   * DAY
   * ------------------------------------------------------
   */

  if (
    Number(data.day) !==
    Number(expectedDay)
  ) {
    fail(
      `day must be ${expectedDay}, received ${data.day}.`
    );
  }


  /*
   * ------------------------------------------------------
   * BASIC LESSON FIELDS
   * ------------------------------------------------------
   */

  requireString(
    data.courseDate,
    "courseDate"
  );

  requireString(
    data.publishAt,
    "publishAt"
  );

  requireString(
    data.title,
    "title"
  );

  requireString(
    data.introduction,
    "introduction"
  );


  /*
   * ------------------------------------------------------
   * SECTIONS
   *
   * Minimum 4 sections for a complete NEET lesson.
   * ------------------------------------------------------
   */

  requireArray(
    data.sections,
    "sections",
    4
  );


  data.sections.forEach(
    (section, index) => {

      if (
        !section ||
        typeof section !== "object" ||
        Array.isArray(section)
      ) {
        fail(
          `sections[${index}] must be an object.`
        );
      }


      requireString(
        section.topic,
        `sections[${index}].topic`
      );


      requireString(
        section.heading,
        `sections[${index}].heading`
      );


      requireString(
        section.content,
        `sections[${index}].content`
      );


      /*
       * keyPoints
       */

      if (
        !Array.isArray(
          section.keyPoints
        )
      ) {
        fail(
          `sections[${index}].keyPoints must be an array.`
        );
      }


      section.keyPoints.forEach(
        (item, itemIndex) => {

          requireString(
            item,
            `sections[${index}].keyPoints[${itemIndex}]`
          );
        }
      );


      /*
       * NEET tips
       */

      if (
        !Array.isArray(
          section.neetTips
        )
      ) {
        fail(
          `sections[${index}].neetTips must be an array.`
        );
      }


      section.neetTips.forEach(
        (item, itemIndex) => {

          requireString(
            item,
            `sections[${index}].neetTips[${itemIndex}]`
          );
        }
      );
    }
  );


  /*
   * ------------------------------------------------------
   * LEARNING OUTCOME
   * ------------------------------------------------------
   *
   * STEP 1 already normalizes the AI response.
   * This validator confirms that the final structure
   * is correct.
   */

  validateLearningOutcome(
    data.learningOutcome
  );


  /*
   * ------------------------------------------------------
   * SYLLABUS TOPIC COVERAGE
   * ------------------------------------------------------
   *
   * Missing topic = warning only.
   * It does NOT destroy the generated lesson.
   * ------------------------------------------------------
   */

  if (
    Array.isArray(expectedTopics) &&
    expectedTopics.length > 0
  ) {

    const generatedTopics =
      data.sections.map(
        section =>
          section.topic
            .trim()
            .toLowerCase()
      );


    for (
      const topic of expectedTopics
    ) {

      const name =
        String(topic)
          .trim()
          .toLowerCase();


      if (
        !generatedTopics.some(
          generated =>
            generated.includes(name)
        )
      ) {

        console.warn(
          `Warning: syllabus topic may not have a matching section: ${topic}`
        );
      }
    }
  }


  return true;
}


export function validateMcqs(
  mcqs
) {

  /*
   * ------------------------------------------------------
   * MCQ ARRAY
   * ------------------------------------------------------
   *
   * The generator intentionally allows
   * a variable number of valid MCQs.
   * ------------------------------------------------------
   */

  if (!Array.isArray(mcqs)) {
    throw new Error(
      "MCQs must be an array."
    );
  }


  /*
   * ------------------------------------------------------
   * EACH MCQ
   * ------------------------------------------------------
   */

  for (
    const [
      index,
      mcq
    ] of mcqs.entries()
  ) {

    if (
      !mcq ||
      typeof mcq !== "object" ||
      Array.isArray(mcq)
    ) {
      throw new Error(
        `MCQ ${index + 1}: must be an object.`
      );
    }


    /*
     * Question
     */

    if (
      !mcq.question?.trim()
    ) {
      throw new Error(
        `MCQ ${index + 1}: missing question.`
      );
    }


    /*
     * Options
     */

    if (
      !Array.isArray(
        mcq.options
      ) ||
      mcq.options.length !== 4
    ) {
      throw new Error(
        `MCQ ${index + 1}: must have exactly 4 options.`
      );
    }


    /*
     * Option content
     */

    if (
      mcq.options.some(
        option =>
          typeof option !== "string" ||
          !option.trim()
      )
    ) {
      throw new Error(
        `MCQ ${index + 1}: empty option.`
      );
    }


    /*
     * Duplicate options
     */

    const normalizedOptions =
      mcq.options.map(
        option =>
          option
            .trim()
            .toLowerCase()
      );


    if (
      new Set(
        normalizedOptions
      ).size !==
      normalizedOptions.length
    ) {
      throw new Error(
        `MCQ ${index + 1}: duplicate options.`
      );
    }


    /*
     * Answer
     *
     * 0 = A
     * 1 = B
     * 2 = C
     * 3 = D
     */

    if (
      !Number.isInteger(
        mcq.answer
      ) ||
      mcq.answer < 0 ||
      mcq.answer > 3
    ) {
      throw new Error(
        `MCQ ${index + 1}: invalid answer index.`
      );
    }


    /*
     * Explanation
     */

    if (
      !mcq.explanation?.trim()
    ) {
      throw new Error(
        `MCQ ${index + 1}: missing explanation.`
      );
    }


    /*
     * Optional topic
     *
     * If present, it must be a string.
     */

    if (
      mcq.topic !== undefined &&
      (
        typeof mcq.topic !== "string" ||
        !mcq.topic.trim()
      )
    ) {
      throw new Error(
        `MCQ ${index + 1}: invalid topic.`
      );
    }
  }


  return true;
}

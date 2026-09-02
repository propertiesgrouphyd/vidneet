function fail(message) {
  throw new Error(message);
}


function isNonEmptyString(value) {
  return (
    typeof value === "string" &&
    value.trim().length > 0
  );
}


function normalizeTopic(value) {
  return String(value ?? "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}


function validateStringArray(
  value,
  fieldName
) {
  if (!Array.isArray(value)) {
    fail(
      `${fieldName} must be an array.`
    );
  }

  if (value.length === 0) {
    fail(
      `${fieldName} must not be empty.`
    );
  }

  for (
    let i = 0;
    i < value.length;
    i++
  ) {
    if (
      !isNonEmptyString(value[i])
    ) {
      fail(
        `${fieldName}[${i}] must be a non-empty string.`
      );
    }
  }
}


/*
 * ------------------------------------------------------
 * LESSON VALIDATION
 * ------------------------------------------------------
 */
export function validateDayContent(
  lesson,
  expectedDay,
  expectedTopics
) {
  if (
    !lesson ||
    typeof lesson !== "object" ||
    Array.isArray(lesson)
  ) {
    fail(
      "Lesson must be a valid JSON object."
    );
  }


  /*
   * Basic lesson fields
   */
  if (
    !isNonEmptyString(
      lesson.title
    )
  ) {
    fail(
      "title must be a non-empty string."
    );
  }


  if (
    !isNonEmptyString(
      lesson.introduction
    )
  ) {
    fail(
      "introduction must be a non-empty string."
    );
  }


  /*
   * Day number
   */
  if (
    expectedDay !== undefined &&
    expectedDay !== null
  ) {
    if (
      Number(lesson.day) !==
      Number(expectedDay)
    ) {
      fail(
        `day must equal ${expectedDay}.`
      );
    }
  }


  /*
   * Learning outcome
   */
  validateStringArray(
    lesson.learningOutcome,
    "learningOutcome"
  );


  /*
   * Sections
   */
  if (
    !Array.isArray(
      lesson.sections
    )
  ) {
    fail(
      "sections must be an array."
    );
  }


  if (
    lesson.sections.length === 0
  ) {
    fail(
      "sections must not be empty."
    );
  }


  /*
   * Exact syllabus topic validation
   */
  if (
    Array.isArray(expectedTopics)
  ) {
    if (
      lesson.sections.length !==
      expectedTopics.length
    ) {
      fail(
        `Section count ${lesson.sections.length} does not equal syllabus topic count ${expectedTopics.length}.`
      );
    }


    const seenTopics =
      new Set();


    for (
      let i = 0;
      i < expectedTopics.length;
      i++
    ) {
      const expectedTopic =
        expectedTopics[i];

      const section =
        lesson.sections[i];


      if (
        !section ||
        typeof section !== "object" ||
        Array.isArray(section)
      ) {
        fail(
          `Section ${i + 1} must be an object.`
        );
      }


      if (
        !isNonEmptyString(
          section.topic
        )
      ) {
        fail(
          `Section ${i + 1} topic must be a non-empty string.`
        );
      }


      const generatedTopic =
        normalizeTopic(
          section.topic
        );

      const expected =
        normalizeTopic(
          expectedTopic
        );


      /*
       * Exact normalized equality only.
       *
       * No includes(), startsWith(),
       * fuzzy matching, or partial matching.
       */
      if (
        generatedTopic !== expected
      ) {
        fail(
          `Section ${i + 1} topic mismatch. Expected "${expectedTopic}" but received "${section.topic}".`
        );
      }


      if (
        seenTopics.has(
          generatedTopic
        )
      ) {
        fail(
          `Duplicate section topic: "${section.topic}".`
        );
      }


      seenTopics.add(
        generatedTopic
      );
    }
  }


  /*
   * Validate every section
   */
  for (
    let i = 0;
    i < lesson.sections.length;
    i++
  ) {
    const section =
      lesson.sections[i];


    if (
      !isNonEmptyString(
        section.heading
      )
    ) {
      fail(
        `Section ${i + 1} heading must be a non-empty string.`
      );
    }


    if (
      !isNonEmptyString(
        section.content
      )
    ) {
      fail(
        `Section ${i + 1} content must be a non-empty string.`
      );
    }


    validateStringArray(
      section.keyPoints,
      `Section ${i + 1} keyPoints`
    );


    validateStringArray(
      section.neetTips,
      `Section ${i + 1} neetTips`
    );
  }


  return true;
}


/*
 * ------------------------------------------------------
 * MCQ VALIDATION
 * ------------------------------------------------------
 */
export function validateMcqs(
  mcqs
) {
  if (
    !Array.isArray(mcqs)
  ) {
    fail(
      "mcqs must be an array."
    );
  }


  if (
    mcqs.length === 0
  ) {
    fail(
      "mcqs must not be empty."
    );
  }


  const questionSet =
    new Set();


  for (
    let i = 0;
    i < mcqs.length;
    i++
  ) {
    const mcq =
      mcqs[i];


    if (
      !mcq ||
      typeof mcq !== "object" ||
      Array.isArray(mcq)
    ) {
      fail(
        `MCQ ${i + 1} must be an object.`
      );
    }


    /*
     * Question
     */
    if (
      !isNonEmptyString(
        mcq.question
      )
    ) {
      fail(
        `MCQ ${i + 1} question must be a non-empty string.`
      );
    }


    const questionKey =
      mcq.question
        .trim()
        .replace(/\s+/g, " ")
        .toLowerCase();


    if (
      questionSet.has(
        questionKey
      )
    ) {
      fail(
        `Duplicate MCQ question at item ${i + 1}.`
      );
    }


    questionSet.add(
      questionKey
    );


    /*
     * Exactly four options
     */
    if (
      !Array.isArray(
        mcq.options
      )
    ) {
      fail(
        `MCQ ${i + 1} options must be an array.`
      );
    }


    if (
      mcq.options.length !== 4
    ) {
      fail(
        `MCQ ${i + 1} must have exactly 4 options.`
      );
    }


    const optionSet =
      new Set();


    for (
      let j = 0;
      j < mcq.options.length;
      j++
    ) {
      const option =
        mcq.options[j];


      if (
        !isNonEmptyString(
          option
        )
      ) {
        fail(
          `MCQ ${i + 1} option ${j + 1} must be a non-empty string.`
        );
      }


      const optionKey =
        option
          .trim()
          .replace(/\s+/g, " ")
          .toLowerCase();


      if (
        optionSet.has(
          optionKey
        )
      ) {
        fail(
          `MCQ ${i + 1} contains duplicate options.`
        );
      }


      optionSet.add(
        optionKey
      );
    }


    /*
     * Correct answer
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
      fail(
        `MCQ ${i + 1} answer must be an integer from 0 to 3.`
      );
    }


    /*
     * Explanation
     */
    if (
      !isNonEmptyString(
        mcq.explanation
      )
    ) {
      fail(
        `MCQ ${i + 1} explanation must be a non-empty string.`
      );
    }
  }


  return true;
}

export function validateDayContent(
  data,
  expectedDay,
  expectedTopics
) {
  if (
    !data ||
    typeof data !== "object" ||
    Array.isArray(data)
  ) {
    throw new Error(
      "Generated lesson is not an object."
    );
  }

  if (
    expectedDay !== undefined &&
    Number(data.day) !== Number(expectedDay)
  ) {
    throw new Error(
      `Generated day mismatch. Expected ${expectedDay}, received ${data.day}.`
    );
  }

  if (
    typeof data.title !== "string" ||
    !data.title.trim()
  ) {
    throw new Error(
      "Missing lesson title."
    );
  }

  if (
    typeof data.introduction !== "string" ||
    !data.introduction.trim()
  ) {
    throw new Error(
      "Missing lesson introduction."
    );
  }

  if (
    !Array.isArray(data.sections) ||
    data.sections.length === 0
  ) {
    throw new Error(
      "Lesson contains no sections."
    );
  }

  if (
    !Array.isArray(data.learningOutcome) ||
    data.learningOutcome.length === 0
  ) {
    throw new Error(
      "learningOutcome must be a non-empty array."
    );
  }

  if (
    data.learningOutcome.some(
      item =>
        typeof item !== "string" ||
        !item.trim()
    )
  ) {
    throw new Error(
      "learningOutcome must contain only non-empty strings."
    );
  }

  for (
    const [index, section]
    of data.sections.entries()
  ) {
    if (
      !section ||
      typeof section !== "object" ||
      Array.isArray(section)
    ) {
      throw new Error(
        `Section ${index + 1}: invalid section object.`
      );
    }

    if (
      typeof section.topic !== "string" ||
      !section.topic.trim()
    ) {
      throw new Error(
        `Section ${index + 1}: missing topic.`
      );
    }

    if (
      typeof section.heading !== "string" ||
      !section.heading.trim()
    ) {
      throw new Error(
        `Section ${index + 1}: missing heading.`
      );
    }

    if (
      typeof section.content !== "string" ||
      !section.content.trim()
    ) {
      throw new Error(
        `Section ${index + 1}: missing content.`
      );
    }

    if (
      !Array.isArray(section.keyPoints) ||
      section.keyPoints.length === 0
    ) {
      throw new Error(
        `Section ${index + 1}: keyPoints must be a non-empty array.`
      );
    }

    if (
      section.keyPoints.some(
        item =>
          typeof item !== "string" ||
          !item.trim()
      )
    ) {
      throw new Error(
        `Section ${index + 1}: keyPoints must contain only non-empty strings.`
      );
    }

    if (
      !Array.isArray(section.neetTips) ||
      section.neetTips.length === 0
    ) {
      throw new Error(
        `Section ${index + 1}: neetTips must be a non-empty array.`
      );
    }

    if (
      section.neetTips.some(
        item =>
          typeof item !== "string" ||
          !item.trim()
      )
    ) {
      throw new Error(
        `Section ${index + 1}: neetTips must contain only non-empty strings.`
      );
    }
  }

  /*
   * Every supplied syllabus topic MUST
   * have a corresponding lesson section.
   *
   * Missing topics are errors, not warnings.
   */

  if (
    Array.isArray(expectedTopics) &&
    expectedTopics.length > 0
  ) {
    const generatedTopics =
      data.sections.map(
        section =>
          String(section.topic)
            .trim()
            .toLowerCase()
            .replace(/\s+/g, " ")
      );

    for (
      const topic of expectedTopics
    ) {
      const expected =
        String(topic)
          .trim()
          .toLowerCase()
          .replace(/\s+/g, " ");

      const found =
        generatedTopics.some(
          generated =>
            generated === expected ||
            generated.includes(expected) ||
            expected.includes(generated)
        );

      if (!found) {
        throw new Error(
          `Missing syllabus topic in lesson: ${topic}`
        );
      }
    }
  }

  return true;
}


export function validateMcqs(
  mcqs
) {
  if (
    !Array.isArray(mcqs) ||
    mcqs.length === 0
  ) {
    throw new Error(
      "MCQs must be a non-empty array."
    );
  }

  for (
    const [index, mcq]
    of mcqs.entries()
  ) {
    if (
      !mcq ||
      typeof mcq !== "object" ||
      Array.isArray(mcq)
    ) {
      throw new Error(
        `MCQ ${index + 1}: invalid MCQ object.`
      );
    }

    if (
      typeof mcq.question !== "string" ||
      !mcq.question.trim()
    ) {
      throw new Error(
        `MCQ ${index + 1}: missing question.`
      );
    }

    if (
      !Array.isArray(mcq.options) ||
      mcq.options.length !== 4
    ) {
      throw new Error(
        `MCQ ${index + 1}: must have exactly 4 options.`
      );
    }

    if (
      mcq.options.some(
        option =>
          typeof option !== "string" ||
          !option.trim()
      )
    ) {
      throw new Error(
        `MCQ ${index + 1}: options must contain only non-empty strings.`
      );
    }

    const normalizedOptions =
      mcq.options.map(
        option =>
          option.trim().toLowerCase()
      );

    if (
      new Set(normalizedOptions).size !== 4
    ) {
      throw new Error(
        `MCQ ${index + 1}: options must be unique.`
      );
    }

    if (
      !Number.isInteger(mcq.answer) ||
      mcq.answer < 0 ||
      mcq.answer > 3
    ) {
      throw new Error(
        `MCQ ${index + 1}: invalid answer index.`
      );
    }

    if (
      typeof mcq.explanation !== "string" ||
      !mcq.explanation.trim()
    ) {
      throw new Error(
        `MCQ ${index + 1}: missing explanation.`
      );
    }
  }

  return true;
}

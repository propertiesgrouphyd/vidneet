export function validateDayContent(
  data,
  expectedDay,
  expectedTopics
) {
  if (!data || typeof data !== "object") {
    throw new Error("Generated lesson is not an object.");
  }

  if (!data.title?.trim()) {
    throw new Error("Missing lesson title.");
  }

  if (!data.introduction?.trim()) {
    throw new Error("Missing lesson introduction.");
  }

  if (
    !Array.isArray(data.sections) ||
    data.sections.length === 0
  ) {
    throw new Error("Lesson contains no sections.");
  }

  if (
    !Array.isArray(data.learningOutcome)
  ) {
    throw new Error(
      "learningOutcome must be an array."
    );
  }

  for (const [index, section] of data.sections.entries()) {
    if (!section.topic?.trim()) {
      throw new Error(
        `Section ${index + 1}: missing topic.`
      );
    }

    if (!section.heading?.trim()) {
      throw new Error(
        `Section ${index + 1}: missing heading.`
      );
    }

    if (!section.content?.trim()) {
      throw new Error(
        `Section ${index + 1}: missing content.`
      );
    }

    if (!Array.isArray(section.keyPoints)) {
      throw new Error(
        `Section ${index + 1}: keyPoints must be an array.`
      );
    }

    if (!Array.isArray(section.neetTips)) {
      throw new Error(
        `Section ${index + 1}: neetTips must be an array.`
      );
    }
  }

  if (
    Array.isArray(expectedTopics) &&
    expectedTopics.length > 0
  ) {
    const generatedTopics =
      data.sections.map(
        section =>
          section.topic.trim().toLowerCase()
      );

    for (const topic of expectedTopics) {
      const name =
        String(topic).trim().toLowerCase();

      if (!generatedTopics.some(
        generated => generated.includes(name)
      )) {
        console.warn(
          `Warning: syllabus topic may not have a matching section: ${topic}`
        );
      }
    }
  }

  return true;
}

export function validateMcqs(mcqs) {
  if (!Array.isArray(mcqs)) {
    throw new Error("MCQs must be an array.");
  }

  for (const [index, mcq] of mcqs.entries()) {
    if (!mcq.question?.trim()) {
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
        `MCQ ${index + 1}: empty option.`
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

    if (!mcq.explanation?.trim()) {
      throw new Error(
        `MCQ ${index + 1}: missing explanation.`
      );
    }
  }

  return true;
}

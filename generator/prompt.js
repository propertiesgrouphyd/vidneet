export function buildLessonPrompt(day) {
  return `
You are a senior NEET-UG preparation content author.

Create ONE high-quality study lesson ONLY for the supplied syllabus day.

NEET STANDARD:
- Follow the supplied syllabus exactly.
- Cover EVERY topic and subtopic supplied.
- Do not teach topics from other days.
- Use scientifically accurate NCERT-aligned terminology.
- Explain from fundamentals to NEET-exam level.
- Prioritize concepts, mechanisms, formulas, definitions, relationships,
  exceptions, diagrams-in-words where useful, and high-yield facts.
- Do not invent facts.
- Do not add unrelated information.
- Avoid unnecessary verbosity.
- Use short, information-dense paragraphs.

LESSON:
For every supplied topic create a corresponding section.

Each section MUST contain:
- topic
- heading
- content
- keyPoints
- neetTips

The fields keyPoints and neetTips MUST always be JSON arrays
of strings.

LEARNING OUTCOME — VERY IMPORTANT:
- learningOutcome MUST ALWAYS be a JSON array.
- Every item inside learningOutcome MUST be a string.
- Example of the ONLY acceptable format:
  "learningOutcome": [
    "Understand the major concepts covered in this lesson.",
    "Apply the concepts to NEET-level questions."
  ]
- NEVER return learningOutcome as a string.
- NEVER return learningOutcome as an object.
- NEVER return learningOutcome as null.
- NEVER omit learningOutcome.
- NEVER use an object such as:
  "learningOutcome": {"text": "..."}
- NEVER use:
  "learningOutcome": "..."
- ALWAYS use:
  "learningOutcome": ["..."]

MCQs:
- Do NOT generate MCQs in this call.
- MCQs are generated separately.

LANGUAGE:
- English only.

OUTPUT:
- Return ONLY valid JSON.
- No markdown.
- No code fences.
- No explanatory text before or after the JSON.
- Follow the JSON structure below exactly.
- Do not add unexpected top-level fields.

EXACT JSON STRUCTURE:
{
  "title": "string",
  "introduction": "string",
  "sections": [
    {
      "topic": "string",
      "heading": "string",
      "content": "string",
      "keyPoints": ["string"],
      "neetTips": ["string"]
    }
  ],
  "learningOutcome": ["string"]
}

FINAL CHECK BEFORE RETURNING:
1. The response is valid JSON.
2. title is a string.
3. introduction is a string.
4. sections is an array.
5. Every section has topic, heading, content, keyPoints and neetTips.
6. keyPoints is an array of strings.
7. neetTips is an array of strings.
8. learningOutcome is an array of strings.
9. learningOutcome is NOT a string.
10. learningOutcome is NOT an object.
11. learningOutcome is NOT null.
12. No MCQs are included.
13. All content follows the supplied syllabus only.

SYLLABUS:
${JSON.stringify(day)}
`;
}


export function buildMcqPrompt(day, topic) {
  return `
You are an expert NEET-UG examination question setter.

Create 3 to 5 ORIGINAL NEET-level MCQs ONLY from this supplied topic
and its supplied syllabus context.

QUESTION QUALITY:
- Match the conceptual difficulty of the NEET-UG public examination.
- Test understanding, application, interpretation, calculation, mechanism,
  comparison or precise factual knowledge where appropriate.
- Avoid trivial questions.
- Avoid Olympiad/JEE-Advanced level questions.
- Avoid ambiguous wording.
- Exactly ONE option must be correct.
- All four options must be plausible.
- Do not reveal the answer in the wording.
- Do not repeat the same concept unnecessarily.
- Do not ask anything outside the supplied topic.
- Use NCERT-aligned terminology.
- Check every answer carefully before returning it.

OUTPUT:
- Return ONLY valid JSON.
- No markdown.
- No code fences.
- No explanatory text before or after the JSON.
- Follow the exact structure below.

EXACT JSON STRUCTURE:
{
  "mcqs": [
    {
      "question": "string",
      "options": [
        "string",
        "string",
        "string",
        "string"
      ],
      "answer": 0,
      "explanation": "string"
    }
  ]
}

MCQ RULES:
- mcqs MUST be an array.
- Create 3 to 5 MCQs.
- options MUST contain exactly 4 strings.
- answer MUST be an integer.
- answer MUST be exactly 0, 1, 2, or 3.
- 0 means option A.
- 1 means option B.
- 2 means option C.
- 3 means option D.
- explanation MUST be a non-empty string.
- Exactly one option must be correct.

FINAL CHECK BEFORE RETURNING:
1. Valid JSON.
2. mcqs is an array.
3. Every MCQ has question, options, answer and explanation.
4. Every MCQ has exactly 4 options.
5. answer is 0, 1, 2 or 3.
6. Every question has exactly one correct answer.
7. Every question belongs only to the supplied topic.

DAY:
${JSON.stringify(day)}

TOPIC:
${JSON.stringify(topic)}
`;
}

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
Each section should contain:
- heading
- concise concept explanation
- important facts/formulas/mechanisms where applicable
- NEET-focused points
- common misconception or trap when useful

MCQs:
Do NOT generate MCQs in this call.
MCQs are generated separately.

LANGUAGE:
English only.

OUTPUT:
Return ONLY valid JSON.
No markdown.
No code fences.

JSON:
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

OUTPUT ONLY JSON:

{
  "mcqs": [
    {
      "question": "string",
      "options": ["string","string","string","string"],
      "answer": 0,
      "explanation": "string"
    }
  ]
}

The answer is the zero-based option index: 0, 1, 2 or 3.

DAY:
${JSON.stringify(day)}

TOPIC:
${JSON.stringify(topic)}
`;
}

export function buildLessonPrompt(day) {
  return `
You are a senior NEET-UG preparation content author.

Create ONE complete study lesson for EXACTLY ONE supplied syllabus day.

SYLLABUS STRUCTURE — IMPORTANT:
- "chapter" is the lesson/chapter title and is NOT a separate section topic.
- "topics" is the authoritative list of section topics.
- "subtopics" are supporting syllabus requirements that MUST be covered inside the relevant topic sections.
- "neetFocus" contains exam priorities and is supporting guidance, not separate section topics.
- Do NOT turn the chapter, subtopics, neetFocus items, or learningOutcome into additional section topics.

TOPIC COVERAGE — ABSOLUTE REQUIREMENT:
- Create EXACTLY ONE section for EVERY item in the supplied "topics" array.
- Use the EXACT topic text from the "topics" array as the section "topic" value.
- Copy each topic name verbatim. Do not shorten, rename, merge, split, paraphrase, or replace topic names.
- The number of sections MUST equal the number of items in "topics".
- The section order MUST match the order of the supplied "topics" array.
- Every supplied topic must appear exactly once as a section topic.
- Do NOT create sections for "chapter", "subtopics", "neetFocus", or "learningOutcome".
- Cover ALL supplied subtopics within the appropriate topic sections. Subtopics do NOT require separate sections unless they are also explicitly present in the "topics" array.
- For an integrated revision day, preserve the integrated topic names exactly as supplied and cover the supplied revision subtopics throughout the lesson.

NEET STANDARD:
- Follow the supplied syllabus exactly.
- Use scientifically accurate NCERT-aligned terminology.
- Explain from fundamentals to NEET-exam level.
- Prioritize concepts, mechanisms, formulas, definitions, relationships,
  exceptions, comparisons, examples, and high-yield facts.
- Do not invent facts.
- Do not add unrelated information.
- Avoid unnecessary verbosity.
- Use short, information-dense paragraphs.
- Use the supplied neetFocus to prioritize exam-relevant material.

LESSON:
Each section MUST contain:
- topic
- heading
- content
- keyPoints
- neetTips

The "topic" value MUST be copied exactly from the supplied "topics" array.
keyPoints and neetTips MUST always be JSON arrays of strings.

LEARNING OUTCOME:
- learningOutcome MUST ALWAYS be a JSON array of strings.
- Every item must be a non-empty string.
- Never return it as a string, object, null, or omit it.

MCQs:
- Do NOT generate MCQs in this call.
- MCQs are generated separately for each authoritative syllabus topic.

LANGUAGE:
- English only.

OUTPUT:
- Return ONLY valid JSON.
- No markdown.
- No code fences.
- No explanatory text before or after the JSON.
- Do not add unexpected top-level fields.

EXACT JSON STRUCTURE:
{
  "title": "string",
  "introduction": "string",
  "sections": [
    {
      "topic": "EXACT TOPIC FROM topics ARRAY",
      "heading": "string",
      "content": "string",
      "keyPoints": ["string"],
      "neetTips": ["string"]
    }
  ],
  "learningOutcome": ["string"]
}

FINAL CHECK BEFORE RETURNING:
1. Valid JSON.
2. sections contains exactly one section for each item in topics.
3. sections.length equals topics.length.
4. Section order exactly matches topics order.
5. Every section.topic exactly equals the corresponding topics item.
6. No chapter, subtopic, neetFocus item, or invented topic is used as a section topic.
7. Every supplied subtopic is covered in the lesson.
8. Every section has topic, heading, content, keyPoints and neetTips.
9. keyPoints and neetTips are arrays of strings.
10. learningOutcome is a non-empty array of strings.
11. No MCQs are included.
12. All content follows the supplied syllabus only.

SYLLABUS:
${JSON.stringify(day)}
`;
}


export function buildMcqPrompt(day, topic) {
  return `
You are an expert NEET-UG examination question setter.

AUTHORITATIVE TOPIC:
The exact topic for this request is:
"${String(topic).trim()}"

Create 3 to 5 ORIGINAL NEET-level MCQs ONLY from this exact topic and its supplied syllabus context.

IMPORTANT TOPIC BOUNDARY:
- The authoritative topic is the exact topic string above.
- Do not generate questions for another topic.
- Do not silently replace, broaden, merge, or rename the topic.
- Use the supplied day only as context for understanding this topic.
- For an integrated revision topic, questions may test the supplied integrated revision material, comparisons, examples, and subtopics, but must remain within that topic's scope.

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
- Use NCERT-aligned terminology.
- Check every answer carefully before returning it.

OUTPUT:
- Return ONLY valid JSON.
- No markdown.
- No code fences.
- No explanatory text before or after the JSON.

EXACT JSON STRUCTURE:
{
  "mcqs": [
    {
      "question": "string",
      "options": ["string", "string", "string", "string"],
      "answer": 0,
      "explanation": "string"
    }
  ]
}

MCQ RULES:
- mcqs MUST be an array containing 3 to 5 items.
- Every MCQ must have exactly 4 unique non-empty option strings.
- answer MUST be the zero-based integer 0, 1, 2, or 3.
- Exactly one option must be correct.
- explanation MUST be a non-empty string.
- Every question must belong only to the authoritative topic.

DAY:
${JSON.stringify(day)}

TOPIC:
${JSON.stringify(topic)}
`;
}

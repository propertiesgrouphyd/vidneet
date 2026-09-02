export function buildLessonPrompt(day) {
  return `
You are a senior NEET-UG preparation content author.

Create ONE complete, high-quality NEET-UG study lesson ONLY for the supplied syllabus day.

==================================================
STRICT NEET SYLLABUS RULES
==================================================

- Follow the supplied syllabus exactly.
- Cover EVERY supplied topic and subtopic.
- Do NOT teach topics belonging to other days.
- Use scientifically accurate, NCERT-aligned terminology.
- Explain concepts from fundamentals to NEET examination level.
- Prioritize:
  - definitions
  - concepts
  - mechanisms
  - formulas
  - relationships
  - important exceptions
  - high-yield facts
  - NEET examination traps
- Do not invent facts.
- Do not add unrelated information.
- Do not fabricate experiments, values, formulas, examples, or references.
- Keep the content information-dense and academically useful.
- Use clear English suitable for NEET students.

==================================================
LESSON STRUCTURE
==================================================

Create at least 4 sections.

Every supplied topic must be represented by a relevant section.

Every section MUST contain exactly these fields:

- topic
- heading
- content
- keyPoints
- neetTips

The section structure MUST be:

{
  "topic": "string",
  "heading": "string",
  "content": "string",
  "keyPoints": ["string"],
  "neetTips": ["string"]
}

Rules:

- topic must be a non-empty string.
- heading must be a non-empty string.
- content must be a non-empty string.
- keyPoints MUST be an array of one or more non-empty strings.
- neetTips MUST be an array of one or more non-empty strings.
- Do NOT return keyPoints as a string.
- Do NOT return neetTips as a string.
- Do NOT omit any of these fields.

==================================================
LEARNING OUTCOMES — VERY IMPORTANT
==================================================

"learningOutcome" MUST ALWAYS be a JSON ARRAY.

Correct:

"learningOutcome": [
  "Understand the fundamental concept.",
  "Explain the important mechanism.",
  "Apply the concept to NEET-level questions."
]

Incorrect:

"learningOutcome": "Understand the fundamental concept."

Incorrect:

"learningOutcome": null

Incorrect:

"learningOutcome": {}

Incorrect:

"learningOutcome": ""

The learningOutcome array MUST contain at least 1 non-empty string.

==================================================
MCQs
==================================================

Do NOT generate MCQs in this call.

MCQs are generated separately.

==================================================
LANGUAGE
==================================================

English only.

==================================================
OUTPUT RULES
==================================================

Return ONLY one valid JSON object.

Do NOT return:

- markdown
- explanations outside JSON
- code fences
- comments
- headings outside JSON
- introductory text
- concluding text

The JSON MUST be directly parseable by JSON.parse().

==================================================
EXACT OUTPUT SCHEMA
==================================================

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

==================================================
FINAL SELF-CHECK BEFORE RETURNING JSON
==================================================

Before producing the answer, silently verify:

1. The output is valid JSON.
2. title is a non-empty string.
3. introduction is a non-empty string.
4. sections is an array.
5. sections contains at least 4 sections.
6. Every section has topic.
7. Every section has heading.
8. Every section has content.
9. Every section has keyPoints as an array.
10. Every section has neetTips as an array.
11. learningOutcome is an ARRAY.
12. learningOutcome contains at least one non-empty string.
13. Every supplied syllabus topic is covered.
14. No unrelated topic is introduced.
15. No MCQs are included.
16. Everything is written in English.
17. Return JSON only.

If any requirement is not satisfied, correct it BEFORE returning the JSON.

==================================================
SUPPLIED SYLLABUS DAY
==================================================

${JSON.stringify(day)}
`;
}


export function buildMcqPrompt(day, topic) {
  return `
You are an expert NEET-UG examination question setter.

Create 3 to 5 ORIGINAL NEET-level MCQs ONLY from the supplied topic and its supplied syllabus context.

==================================================
QUESTION QUALITY
==================================================

- Match the conceptual difficulty of the NEET-UG public examination.
- Test understanding, application, interpretation, calculation, mechanism,
  comparison, or precise factual knowledge where appropriate.
- Avoid trivial questions.
- Avoid Olympiad-level questions.
- Avoid JEE-Advanced-level questions.
- Avoid ambiguous wording.
- Exactly ONE option must be correct.
- All four options must be plausible.
- Do not reveal the answer in the question wording.
- Do not repeat the same concept unnecessarily.
- Do not ask anything outside the supplied topic.
- Use NCERT-aligned terminology.
- Check every answer carefully before returning it.
- Each question must have exactly 4 options.
- Each option must be a non-empty string.
- Do not create duplicate options.
- The explanation must clearly explain why the correct answer is correct.

==================================================
ANSWER FORMAT
==================================================

The answer MUST be a zero-based integer:

0 = option A
1 = option B
2 = option C
3 = option D

Do NOT use:

"A"
"B"
"C"
"D"

Do NOT use:

1
2
3
4

The answer MUST be exactly one of:

0
1
2
3

==================================================
OUTPUT
==================================================

Return ONLY valid JSON.

Do NOT return markdown.
Do NOT return code fences.
Do NOT return explanations outside JSON.

The output MUST have this exact structure:

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

==================================================
FINAL SELF-CHECK
==================================================

Before returning the JSON, silently verify:

1. mcqs is an array.
2. There are 3 to 5 MCQs.
3. Every question is non-empty.
4. Every MCQ has exactly 4 options.
5. Every option is non-empty.
6. No options are duplicates.
7. answer is an integer.
8. answer is exactly 0, 1, 2, or 3.
9. Exactly one option is correct.
10. explanation is non-empty.
11. Every question belongs ONLY to the supplied topic.
12. Return JSON only.

==================================================
DAY
==================================================

${JSON.stringify(day)}

==================================================
TOPIC
==================================================

${JSON.stringify(topic)}
`;
}

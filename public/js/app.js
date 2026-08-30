/* ============================================================
   VIDHWAAN NEET — PRODUCTION FRONTEND
   ============================================================

   STUDENT FRONTEND RULES
   ------------------------------------------------------------
   1. syllabus.json is NEVER loaded by the frontend.
   2. The frontend displays 365 numbered days.
   3. Released days are clickable.
   4. Future days are locked.
   5. No lesson opens automatically.
   6. Clicking a day loads only that day's generated JSON.
   7. Lesson JSON is rendered as a proper learning interface.
   8. MCQs are interactive.
   9. Correct answer = GREEN.
   10. Wrong selected answer = RED.
   11. Correct answer is shown after answering.
   12. Explanation is shown after answering.

   RELEASE SCHEDULE
   ------------------------------------------------------------
   Day 1   = 2026-08-30 06:00 IST
   Day 2   = 2026-08-31 06:00 IST
   Day 3   = 2026-09-01 06:00 IST
   ...
   Day 365 = 2027-08-29 06:00 IST

   DATA
   ------------------------------------------------------------
   ./data/app-config.json
   ./data/day-001.json
   ./data/day-002.json
   ...
   ./data/day-365.json

   ============================================================ */

"use strict";


/* ============================================================
   CONSTANTS
   ============================================================ */

const CONFIG_URL = "./data/app-config.json";

const DEFAULT_START_DATE = "2026-08-30";
const DEFAULT_TOTAL_DAYS = 365;
const DEFAULT_ACTIVATION_HOUR = 6;

const DAY_PREFIX = "day-";
const DAY_SUFFIX = ".json";

const IST_TIMEZONE = "Asia/Kolkata";

let config = null;
let currentLesson = null;
let currentDay = 0;
let releaseTimer = null;
let deferredInstallPrompt = null;


/* ============================================================
   DOM
   ============================================================ */

const dayGrid =
    document.getElementById("day-grid");

const loadingState =
    document.getElementById("loading-state");

const errorState =
    document.getElementById("error-state");

const errorMessage =
    document.getElementById("error-message");

const retryButton =
    document.getElementById("retry-button");

const syllabusSummary =
    document.getElementById("syllabus-summary");

const releaseStatusText =
    document.getElementById("release-status-text");

const todayBadgeText =
    document.getElementById("today-badge-text");

const installButton =
    document.getElementById("install-button");


/* ============================================================
   BASIC UTILITIES
   ============================================================ */

function isObject(value) {
    return (
        value !== null &&
        typeof value === "object" &&
        !Array.isArray(value)
    );
}


function escapeHTML(value) {
    return String(value ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}


function normaliseText(value) {
    if (
        value === null ||
        value === undefined
    ) {
        return "";
    }

    if (Array.isArray(value)) {
        return value
            .map(item => normaliseText(item))
            .filter(Boolean)
            .join("\n");
    }

    if (isObject(value)) {
        return Object.entries(value)
            .map(([key, item]) => {
                const text = normaliseText(item);

                return text
                    ? `${key}: ${text}`
                    : "";
            })
            .filter(Boolean)
            .join("\n");
    }

    return String(value);
}


function renderText(value) {
    const text =
        normaliseText(value);

    if (!text) {
        return "";
    }

    return escapeHTML(text)
        .replace(/\r?\n/g, "<br>");
}


function renderList(items) {
    if (
        !Array.isArray(items) ||
        items.length === 0
    ) {
        return "";
    }

    return `
        <ul class="neet-content-list">
            ${items
                .map(item => `
                    <li>
                        ${renderText(item)}
                    </li>
                `)
                .join("")}
        </ul>
    `;
}


function firstText(...values) {
    for (const value of values) {
        if (
            value !== undefined &&
            value !== null &&
            String(value).trim() !== ""
        ) {
            return value;
        }
    }

    return "";
}


/* ============================================================
   LOADING / ERROR
   ============================================================ */

function setLoading(isLoading) {
    if (!loadingState) {
        return;
    }

    loadingState.classList.toggle(
        "hidden",
        !isLoading
    );
}


function clearError() {
    if (!errorState) {
        return;
    }

    errorState.classList.add("hidden");
}


function showError(message) {
    if (errorMessage) {
        errorMessage.textContent =
            message ||
            "Unable to load the lesson.";
    }

    if (errorState) {
        errorState.classList.remove("hidden");
    }
}


function hideMainError() {
    clearError();
}


/* ============================================================
   IST CLOCK
   ============================================================ */

function getISTParts() {
    const parts =
        new Intl.DateTimeFormat(
            "en-CA",
            {
                timeZone: IST_TIMEZONE,
                year: "numeric",
                month: "2-digit",
                day: "2-digit",
                hour: "2-digit",
                minute: "2-digit",
                second: "2-digit",
                hourCycle: "h23"
            }
        ).formatToParts(new Date());

    const result = {};

    for (const part of parts) {
        if (part.type !== "literal") {
            result[part.type] = part.value;
        }
    }

    return {
        year: Number(result.year),
        month: Number(result.month),
        day: Number(result.day),
        hour: Number(result.hour),
        minute: Number(result.minute),
        second: Number(result.second)
    };
}


function getISTDateString() {
    const now =
        getISTParts();

    return [
        String(now.year).padStart(4, "0"),
        String(now.month).padStart(2, "0"),
        String(now.day).padStart(2, "0")
    ].join("-");
}


/* ============================================================
   DATE HELPERS
   ============================================================ */

function parseDateOnly(dateString) {
    const match =
        /^(\d{4})-(\d{2})-(\d{2})$/
            .exec(String(dateString));

    if (!match) {
        throw new Error(
            `Invalid course start date: ${dateString}`
        );
    }

    return new Date(
        Date.UTC(
            Number(match[1]),
            Number(match[2]) - 1,
            Number(match[3])
        )
    );
}


function differenceInDays(
    startDateString,
    currentDateString
) {
    const start =
        parseDateOnly(startDateString);

    const current =
        parseDateOnly(currentDateString);

    return Math.floor(
        (
            current.getTime() -
            start.getTime()
        ) / 86400000
    );
}


/* ============================================================
   CONFIGURATION
   ============================================================ */

function getStartDate() {
    return (
        config?.courseStartDate ||
        config?.releaseStartDate ||
        config?.programStartDateIST ||
        DEFAULT_START_DATE
    );
}


function getTotalDays() {
    const value =
        Number(
            config?.totalDays ||
            DEFAULT_TOTAL_DAYS
        );

    if (
        !Number.isInteger(value) ||
        value < 1 ||
        value > 365
    ) {
        return DEFAULT_TOTAL_DAYS;
    }

    return value;
}


function getActivationHour() {
    const value =
        Number(
            config?.dailyActivationHourIST ??
            config?.publishHour ??
            DEFAULT_ACTIVATION_HOUR
        );

    if (
        !Number.isInteger(value) ||
        value < 0 ||
        value > 23
    ) {
        return DEFAULT_ACTIVATION_HOUR;
    }

    return value;
}


/* ============================================================
   RELEASE DAY CALCULATION
   ============================================================

   30 Aug 2026 05:59 → Day 0
   30 Aug 2026 06:00 → Day 1

   31 Aug 2026 05:59 → Day 1
   31 Aug 2026 06:00 → Day 2

   ============================================================ */

function getReleaseDay() {
    const now =
        getISTParts();

    const today =
        getISTDateString();

    const startDate =
        getStartDate();

    const calendarOffset =
        differenceInDays(
            startDate,
            today
        );

    if (calendarOffset < 0) {
        return 0;
    }

    let dayNumber =
        calendarOffset + 1;

    const activationHour =
        getActivationHour();

    if (
        now.hour < activationHour
    ) {
        dayNumber -= 1;
    }

    return Math.min(
        Math.max(dayNumber, 0),
        getTotalDays()
    );
}


/* ============================================================
   NEXT RELEASE STATUS
   ============================================================ */

function getReleaseStatus() {
    const releasedDay =
        getReleaseDay();

    const totalDays =
        getTotalDays();

    if (releasedDay >= totalDays) {
        return "All 365 days released";
    }

    if (releasedDay === 0) {
        return "Day 1 unlocks at 6:00 AM IST";
    }

    return `Day ${releasedDay + 1} unlocks at 6:00 AM IST`;
}


/* ============================================================
   FETCH JSON
   ============================================================ */

async function fetchJSON(url) {
    const separator =
        url.includes("?")
            ? "&"
            : "?";

    const response =
        await fetch(
            `${url}${separator}v=${Date.now()}`,
            {
                method: "GET",
                cache: "no-store",
                headers: {
                    "Cache-Control":
                        "no-cache, no-store, must-revalidate",
                    "Pragma":
                        "no-cache"
                }
            }
        );

    if (!response.ok) {
        throw new Error(
            `HTTP ${response.status} while loading ${url}`
        );
    }

    const data =
        await response.json();

    return data;
}


/* ============================================================
   LOAD CONFIG
   ============================================================ */

async function loadConfig() {
    const loaded =
        await fetchJSON(CONFIG_URL);

    if (
        !isObject(loaded)
    ) {
        throw new Error(
            "Invalid app-config.json."
        );
    }

    config = loaded;

    return config;
}


/* ============================================================
   DAY FILE PATH
   ============================================================ */

function getDayURL(dayNumber) {
    if (
        !Number.isInteger(dayNumber) ||
        dayNumber < 1 ||
        dayNumber > getTotalDays()
    ) {
        throw new Error(
            `Invalid day number: ${dayNumber}`
        );
    }

    const filename =
        DAY_PREFIX +
        String(dayNumber).padStart(3, "0") +
        DAY_SUFFIX;

    return `./data/${filename}`;
}


/* ============================================================
   LOAD ONE LESSON
   ============================================================ */

async function loadDay(dayNumber) {
    const lesson =
        await fetchJSON(
            getDayURL(dayNumber)
        );

    if (
        !isObject(lesson)
    ) {
        throw new Error(
            `Day ${dayNumber} returned invalid JSON.`
        );
    }

    if (
        Number(lesson.day) !==
        Number(dayNumber)
    ) {
        throw new Error(
            `Lesson mismatch. Requested Day ${dayNumber}, received Day ${lesson.day}.`
        );
    }

    return lesson;
}


/* ============================================================
   DAY GRID
   ============================================================ */

function renderDayGrid() {
    if (!dayGrid) {
        return;
    }

    const totalDays =
        getTotalDays();

    const releasedDay =
        getReleaseDay();

    /*
       IMPORTANT:

       Do NOT automatically open the current day.

       The grid is the initial screen.
       The student chooses a day.
    */

    currentDay = 0;

    dayGrid.classList.remove(
        "lesson-view"
    );

    dayGrid.innerHTML = "";

    for (
        let day = 1;
        day <= totalDays;
        day++
    ) {
        const button =
            document.createElement("button");

        button.type = "button";

        button.className =
            "day-button";

        button.textContent =
            String(day);

        button.setAttribute(
            "aria-label",
            `Day ${day}`
        );

        if (
            day <= releasedDay
        ) {
            button.classList.add(
                "available"
            );

            /*
               TODAY ONLY:
               gold / active.
            */

            if (
                day === releasedDay
            ) {
                button.classList.add(
                    "today"
                );

                button.setAttribute(
                    "aria-current",
                    "date"
                );

                button.title =
                    `Day ${day} — available today`;
            } else {
                button.title =
                    `Open Day ${day}`;
            }

            button.disabled = false;

            button.addEventListener(
                "click",
                () => {
                    openDay(day);
                }
            );

        } else {
            /*
               FUTURE DAY:
               locked.
            */

            button.classList.add(
                "locked"
            );

            button.disabled = true;

            button.setAttribute(
                "aria-disabled",
                "true"
            );

            button.title =
                `Day ${day} is not released yet`;
        }

        dayGrid.appendChild(
            button
        );
    }

    updateStatus(
        releasedDay
    );
}


/* ============================================================
   STATUS
   ============================================================ */

function updateStatus(
    releasedDay
) {
    const totalDays =
        getTotalDays();

    if (syllabusSummary) {
        syllabusSummary.textContent =
            `${totalDays}-Day NEET Preparation`;
    }

    if (releaseStatusText) {
        releaseStatusText.textContent =
            getReleaseStatus();
    }

    if (todayBadgeText) {
        if (releasedDay > 0) {
            todayBadgeText.textContent =
                `Day ${releasedDay} Active`;
        } else {
            todayBadgeText.textContent =
                "Course Starts at 6:00 AM IST";
        }
    }
}


/* ============================================================
   LESSON TOPIC RENDERING
   ============================================================ */

function renderTopic(
    section,
    index
) {
    if (!isObject(section)) {
        return "";
    }

    const topic =
        firstText(
            section.topic,
            section.heading,
            `Topic ${index + 1}`
        );

    const heading =
        firstText(
            section.heading,
            section.topic,
            `Topic ${index + 1}`
        );

    const content =
        section.content ??
        section.explanation ??
        section.description ??
        "";

    const subsections =
        Array.isArray(
            section.subsections
        )
            ? section.subsections
            : [];

    const keyPoints =
        Array.isArray(
            section.keyPoints
        )
            ? section.keyPoints
            : [];

    const neetTips =
        Array.isArray(
            section.neetTips
        )
            ? section.neetTips
            : [];

    return `
        <article class="neet-topic-card">

            <div class="neet-topic-number">
                Topic ${index + 1}
            </div>

            <h3>
                ${escapeHTML(heading)}
            </h3>

            ${
                topic !== heading
                    ? `
                        <div class="neet-topic-name">
                            ${escapeHTML(topic)}
                        </div>
                      `
                    : ""
            }

            ${
                content
                    ? `
                        <div class="neet-topic-content">
                            ${renderText(content)}
                        </div>
                      `
                    : ""
            }

            ${
                subsections.length
                    ? `
                        <div class="neet-subsections">

                            ${subsections
                                .map(
                                    subsection => {

                                        if (
                                            !isObject(
                                                subsection
                                            )
                                        ) {
                                            return "";
                                        }

                                        const subHeading =
                                            firstText(
                                                subsection.heading,
                                                subsection.title,
                                                "Key Concept"
                                            );

                                        const subContent =
                                            firstText(
                                                subsection.content,
                                                subsection.explanation,
                                                subsection.description,
                                                ""
                                            );

                                        return `
                                            <section class="neet-subsection">

                                                <h4>
                                                    ${escapeHTML(
                                                        subHeading
                                                    )}
                                                </h4>

                                                <div>
                                                    ${renderText(
                                                        subContent
                                                    )}
                                                </div>

                                            </section>
                                        `;
                                    }
                                )
                                .join("")}

                        </div>
                      `
                    : ""
            }

            ${
                keyPoints.length
                    ? `
                        <div class="neet-keypoints">

                            <strong>
                                Key Points
                            </strong>

                            ${renderList(
                                keyPoints
                            )}

                        </div>
                      `
                    : ""
            }

            ${
                neetTips.length
                    ? `
                        <div class="neet-tips">

                            <strong>
                                NEET Focus
                            </strong>

                            ${renderList(
                                neetTips
                            )}

                        </div>
                      `
                    : ""
            }

        </article>
    `;
}


/* ============================================================
   MCQ NORMALISATION
   ============================================================ */

function normaliseOptions(
    mcq
) {
    if (
        Array.isArray(mcq?.options)
    ) {
        return mcq.options
            .slice(0, 4)
            .map(item =>
                normaliseText(item)
            );
    }

    const candidates = [
        mcq?.optionA,
        mcq?.optionB,
        mcq?.optionC,
        mcq?.optionD
    ];

    if (
        candidates.some(
            item =>
                item !== undefined &&
                item !== null
        )
    ) {
        return candidates.map(
            item => normaliseText(item)
        );
    }

    return [];
}


function normaliseCorrectAnswer(
    mcq,
    options
) {
    const raw =
        firstText(
            mcq?.correctAnswer,
            mcq?.correct,
            mcq?.answer,
            mcq?.correctOption
        );

    if (!raw) {
        return -1;
    }

    const value =
        String(raw)
            .trim()
            .toUpperCase();

    /*
       A / B / C / D
    */

    const letterIndex =
        {
            A: 0,
            B: 1,
            C: 2,
            D: 3
        }[value];

    if (
        Number.isInteger(
            letterIndex
        )
    ) {
        return letterIndex;
    }

    /*
       1 / 2 / 3 / 4
    */

    if (
        /^[1-4]$/.test(value)
    ) {
        return Number(value) - 1;
    }

    /*
       Exact option text.
    */

    const exactIndex =
        options.findIndex(
            option =>
                option.trim().toUpperCase() ===
                value
        );

    if (
        exactIndex >= 0
    ) {
        return exactIndex;
    }

    return -1;
}


/* ============================================================
   MCQ RENDERING
   ============================================================ */

function renderMCQ(
    mcq,
    index
) {
    if (!isObject(mcq)) {
        return "";
    }

    const question =
        firstText(
            mcq.question,
            mcq.questionText,
            mcq.text,
            ""
        );

    const options =
        normaliseOptions(mcq);

    if (
        !question ||
        options.length !== 4
    ) {
        return `
            <article
                class="neet-mcq-card"
                data-invalid-mcq="true"
            >
                <div class="neet-mcq-number">
                    Question ${index + 1}
                </div>

                <p>
                    This question could not be displayed.
                </p>
            </article>
        `;
    }

    const correctIndex =
        normaliseCorrectAnswer(
            mcq,
            options
        );

    const explanation =
        firstText(
            mcq.explanation,
            mcq.answerExplanation,
            mcq.solution,
            ""
        );

    return `
        <article
            class="neet-mcq-card"
            data-mcq-index="${index}"
            data-correct-index="${correctIndex}"
            data-answered="false"
        >

            <div class="neet-mcq-number">
                Question ${index + 1}
            </div>

            <h4>
                ${renderText(question)}
            </h4>

            <div
                class="neet-options"
                role="group"
                aria-label="Question ${index + 1} options"
            >

                ${options
                    .map(
                        (option, optionIndex) => `
                            <button
                                type="button"
                                class="neet-option"
                                data-option-index="${optionIndex}"
                                aria-pressed="false"
                            >

                                <span
                                    class="neet-option-letter"
                                    aria-hidden="true"
                                >
                                    ${String.fromCharCode(
                                        65 + optionIndex
                                    )}
                                </span>

                                <span class="neet-option-text">
                                    ${renderText(option)}
                                </span>

                            </button>
                        `
                    )
                    .join("")}

            </div>

            <div
                class="neet-answer-panel"
                hidden
                aria-live="polite"
            >

                <div class="neet-answer-result"></div>

                <div class="neet-correct-answer"></div>

                ${
                    explanation
                        ? `
                            <div class="neet-explanation">

                                <strong>
                                    Explanation
                                </strong>

                                <div>
                                    ${renderText(
                                        explanation
                                    )}
                                </div>

                            </div>
                          `
                        : ""
                }

            </div>

        </article>
    `;
}


/* ============================================================
   MCQ INTERACTION
   ============================================================ */

function attachMCQHandlers() {
    if (!dayGrid) {
        return;
    }

    const cards =
        dayGrid.querySelectorAll(
            ".neet-mcq-card[data-mcq-index]"
        );

    cards.forEach(
        card => {

            const options =
                card.querySelectorAll(
                    ".neet-option"
                );

            const answerPanel =
                card.querySelector(
                    ".neet-answer-panel"
                );

            const result =
                card.querySelector(
                    ".neet-answer-result"
                );

            const correctAnswer =
                card.querySelector(
                    ".neet-correct-answer"
                );

            const correctIndex =
                Number(
                    card.dataset.correctIndex
                );

            options.forEach(
                option => {

                    option.addEventListener(
                        "click",
                        () => {

                            /*
                               One answer per MCQ.
                            */

                            if (
                                card.dataset.answered ===
                                "true"
                            ) {
                                return;
                            }

                            card.dataset.answered =
                                "true";

                            const selectedIndex =
                                Number(
                                    option.dataset.optionIndex
                                );

                            /*
                               Disable all options
                               after selection.
                            */

                            options.forEach(
                                item => {
                                    item.disabled =
                                        true;
                                }
                            );

                            /*
                               Correct answer.
                            */

                            if (
                                selectedIndex ===
                                correctIndex
                            ) {
                                option.classList.add(
                                    "correct"
                                );

                                option.setAttribute(
                                    "aria-pressed",
                                    "true"
                                );

                                if (result) {
                                    result.innerHTML =
                                        `<strong>✓ Correct</strong>`;
                                }

                            } else {

                                /*
                                   Selected wrong option.
                                */

                                option.classList.add(
                                    "wrong"
                                );

                                option.setAttribute(
                                    "aria-pressed",
                                    "true"
                                );

                                /*
                                   Highlight actual
                                   correct option.
                                */

                                if (
                                    correctIndex >= 0 &&
                                    correctIndex <
                                    options.length
                                ) {
                                    options[
                                        correctIndex
                                    ].classList.add(
                                        "correct"
                                    );
                                }

                                if (result) {
                                    result.innerHTML =
                                        `<strong>✗ Incorrect</strong>`;
                                }
                            }

                            /*
                               Show correct answer.
                            */

                            if (
                                correctAnswer &&
                                correctIndex >= 0 &&
                                correctIndex <
                                options.length
                            ) {
                                const letter =
                                    String.fromCharCode(
                                        65 +
                                        correctIndex
                                    );

                                correctAnswer.innerHTML = `
                                    <strong>
                                        Correct Answer:
                                    </strong>
                                    ${letter}. 
                                    ${renderText(
                                        options[
                                            correctIndex
                                        ]
                                    )}
                                `;
                            } else if (
                                correctAnswer
                            ) {
                                correctAnswer.innerHTML =
                                    `<strong>Answer:</strong> Not available`;
                            }

                            /*
                               Reveal answer panel.
                            */

                            if (answerPanel) {
                                answerPanel.hidden =
                                    false;
                            }
                        }
                    );
                }
            );
        }
    );
}


/* ============================================================
   LESSON RENDERER
   ============================================================ */

function renderLesson(
    lesson
) {
    if (
        !isObject(lesson)
    ) {
        throw new Error(
            "Invalid daily lesson JSON."
        );
    }

    if (!dayGrid) {
        throw new Error(
            "Day grid element not found."
        );
    }

    const sections =
        Array.isArray(
            lesson.sections
        )
            ? lesson.sections
            : [];

    const mcqs =
        Array.isArray(
            lesson.mcqs
        )
            ? lesson.mcqs
            : [];

    /*
       Turn the day-grid into a full-width
       lesson container.

       This prevents the lesson from becoming
       a narrow single grid column.
    */

    dayGrid.classList.add(
        "lesson-view"
    );

    const topicHTML =
        sections
            .map(
                (section, index) =>
                    renderTopic(
                        section,
                        index
                    )
            )
            .join("");

    const mcqHTML =
        mcqs
            .map(
                (mcq, index) =>
                    renderMCQ(
                        mcq,
                        index
                    )
            )
            .join("");

    const dayNumber =
        Number(lesson.day);

    dayGrid.innerHTML = `

        <div class="neet-lesson">

            <!-- BACK -->

            <button
                type="button"
                class="neet-back-button"
                id="back-to-days"
            >
                ← Back to Days
            </button>


            <!-- LESSON HEADER -->

            <header class="neet-lesson-header">

                <div class="neet-day-label">
                    DAY ${escapeHTML(dayNumber)}
                </div>

                <h2>
                    ${escapeHTML(
                        firstText(
                            lesson.title,
                            `NEET Day ${dayNumber}`
                        )
                    )}
                </h2>

                ${
                    lesson.subject ||
                    lesson.chapter
                        ? `
                            <div class="neet-meta">

                                ${
                                    lesson.subject
                                        ? escapeHTML(
                                            lesson.subject
                                        )
                                        : ""
                                }

                                ${
                                    lesson.subject &&
                                    lesson.chapter
                                        ? `
                                            <span>
                                                •
                                            </span>
                                          `
                                        : ""
                                }

                                ${
                                    lesson.chapter
                                        ? escapeHTML(
                                            lesson.chapter
                                        )
                                        : ""
                                }

                            </div>
                          `
                        : ""
                }

                ${
                    lesson.courseDate
                        ? `
                            <div class="neet-date">
                                ${escapeHTML(
                                    lesson.courseDate
                                )}
                                · 6:00 AM IST
                            </div>
                          `
                        : ""
                }

            </header>


            <!-- NEET FOCUS -->

            ${
                Array.isArray(
                    lesson.neetFocus
                ) &&
                lesson.neetFocus.length
                    ? `
                        <section class="neet-overview-card">

                            <h3>
                                NEET Focus
                            </h3>

                            ${renderList(
                                lesson.neetFocus
                            )}

                        </section>
                      `
                    : ""
            }


            <!-- LEARNING OUTCOME -->

            ${
                Array.isArray(
                    lesson.learningOutcome
                ) &&
                lesson.learningOutcome.length
                    ? `
                        <section class="neet-overview-card">

                            <h3>
                                What You Will Learn
                            </h3>

                            ${renderList(
                                lesson.learningOutcome
                            )}

                        </section>
                      `
                    : ""
            }


            <!-- CONCEPTS -->

            ${
                topicHTML
                    ? `
                        <section class="neet-section">

                            <div
                                class="neet-section-heading"
                            >

                                <span>
                                    01
                                </span>

                                <h2>
                                    Concepts
                                </h2>

                            </div>

                            ${topicHTML}

                        </section>
                      `
                    : ""
            }


            <!-- MCQs -->

            ${
                mcqHTML
                    ? `
                        <section
                            class="neet-section neet-mcq-section"
                        >

                            <div
                                class="neet-section-heading"
                            >

                                <span>
                                    02
                                </span>

                                <h2>
                                    NEET Practice MCQs
                                </h2>

                            </div>

                            <div class="neet-mcq-list">
                                ${mcqHTML}
                            </div>

                        </section>
                      `
                    : `
                        <section class="neet-overview-card">

                            <h3>
                                Practice Questions
                            </h3>

                            <p>
                                No MCQs are available
                                for this lesson yet.
                            </p>

                        </section>
                      `
            }

        </div>
    `;


    /*
       Back button.
    */

    const backButton =
        document.getElementById(
            "back-to-days"
        );

    if (backButton) {
        backButton.addEventListener(
            "click",
            () => {

                currentLesson =
                    null;

                currentDay =
                    0;

                renderDayGrid();

                window.scrollTo({
                    top: 0,
                    behavior: "smooth"
                });
            }
        );
    }


    /*
       MCQs become interactive
       only after rendering.
    */

    attachMCQHandlers();
}


/* ============================================================
   OPEN DAY
   ============================================================ */

async function openDay(
    dayNumber
) {
    const releasedDay =
        getReleaseDay();

    /*
       Absolute safety:
       future days can never be opened.
    */

    if (
        !Number.isInteger(dayNumber) ||
        dayNumber < 1 ||
        dayNumber > releasedDay
    ) {
        return;
    }

    clearError();

    setLoading(true);

    try {

        const lesson =
            await loadDay(
                dayNumber
            );

        /*
           Double safety:
           never display the wrong lesson.
        */

        if (
            Number(lesson.day) !==
            Number(dayNumber)
        ) {
            throw new Error(
                `Day mismatch: requested ${dayNumber}, received ${lesson.day}.`
            );
        }

        currentLesson =
            lesson;

        currentDay =
            dayNumber;

        renderLesson(
            lesson
        );

        setLoading(false);

        window.scrollTo({
            top: 0,
            behavior: "instant"
        });

    } catch (error) {

        console.error(
            "VIDHWAAN NEET lesson error:",
            error
        );

        setLoading(false);

        showError(
            `Day ${dayNumber} could not be loaded. ` +
            `Please try again.`
        );
    }
}


/* ============================================================
   REFRESH RELEASE STATE
   ============================================================ */

function refreshReleaseState() {
    /*
       If the student is reading a lesson,
       don't destroy it every minute.

       Only refresh the grid when the
       application is currently on the
       day-selection screen.
    */

    if (
        !currentLesson
    ) {
        renderDayGrid();
    }
}


function startReleaseTimer() {
    if (releaseTimer) {
        clearInterval(
            releaseTimer
        );
    }

    /*
       Check once per minute.

       This means the app does not need
       a reload at 6:00 AM.
    */

    releaseTimer =
        setInterval(
            refreshReleaseState,
            60 * 1000
        );
}


/* ============================================================
   RETRY
   ============================================================ */

function setupRetry() {
    if (!retryButton) {
        return;
    }

    retryButton.addEventListener(
        "click",
        async () => {

            clearError();

            setLoading(true);

            try {

                await loadConfig();

                currentLesson =
                    null;

                currentDay =
                    0;

                renderDayGrid();

                setLoading(false);

            } catch (error) {

                console.error(
                    "VIDHWAAN NEET retry failed:",
                    error
                );

                setLoading(false);

                showError(
                    "Unable to load the application. Please try again."
                );
            }
        }
    );
}


/* ============================================================
   PWA INSTALL
   ============================================================ */

function setupInstallPrompt() {

    window.addEventListener(
        "beforeinstallprompt",
        event => {

            event.preventDefault();

            deferredInstallPrompt =
                event;

            if (installButton) {
                installButton.classList.remove(
                    "hidden"
                );
            }
        }
    );


    if (installButton) {

        installButton.addEventListener(
            "click",
            async () => {

                if (
                    !deferredInstallPrompt
                ) {
                    return;
                }

                deferredInstallPrompt.prompt();

                try {
                    await deferredInstallPrompt.userChoice;
                } catch (error) {
                    console.debug(
                        "Install prompt closed."
                    );
                }

                deferredInstallPrompt =
                    null;

                installButton.classList.add(
                    "hidden"
                );
            }
        );
    }


    window.addEventListener(
        "appinstalled",
        () => {

            deferredInstallPrompt =
                null;

            if (installButton) {
                installButton.classList.add(
                    "hidden"
                );
            }
        }
    );
}


/* ============================================================
   SERVICE WORKER
   ============================================================ */

function registerServiceWorker() {

    if (
        !("serviceWorker" in navigator)
    ) {
        return;
    }

    window.addEventListener(
        "load",
        async () => {

            try {

                await navigator.serviceWorker.register(
                    "./sw.js",
                    {
                        scope: "./"
                    }
                );

            } catch (error) {

                console.error(
                    "VIDHWAAN NEET service worker registration failed:",
                    error
                );
            }
        }
    );
}


/* ============================================================
   VISIBILITY REFRESH
   ============================================================ */

function setupVisibilityRefresh() {

    document.addEventListener(
        "visibilitychange",
        () => {

            if (
                document.visibilityState ===
                "visible"
            ) {
                refreshReleaseState();
            }
        }
    );
}


/* ============================================================
   START APPLICATION
   ============================================================ */

async function startApp() {

    /*
       The loading screen is shown only while
       app-config is being loaded.

       Day 1 is NEVER opened automatically.
    */

    setLoading(true);

    clearError();

    try {

        await loadConfig();

        /*
           Main screen:
           365 day circles.
        */

        renderDayGrid();

        /*
           Release state updates automatically.
        */

        startReleaseTimer();

        setupRetry();

        setupInstallPrompt();

        setupVisibilityRefresh();

        registerServiceWorker();

        setLoading(false);

    } catch (error) {

        console.error(
            "VIDHWAAN NEET startup failed:",
            error
        );

        setLoading(false);

        showError(
            "VIDHWAAN NEET could not load. " +
            "Please check your connection and try again."
        );
    }
}


/* ============================================================
   START
   ============================================================ */

if (
    document.readyState ===
    "loading"
) {

    document.addEventListener(
        "DOMContentLoaded",
        startApp,
        {
            once: true
        }
    );

} else {

    startApp();
}

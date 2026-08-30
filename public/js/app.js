"use strict";

/*
============================================================
VIDHWAAN NEET — PRODUCTION FRONTEND
============================================================

COURSE
------------------------------------------------------------
Day 1   = 30 August 2026, 06:00 IST
Day 2   = 31 August 2026, 06:00 IST
Day 3   = 01 September 2026, 06:00 IST
...
Day 365 = 29 August 2027, 06:00 IST

FRONTEND DATA
------------------------------------------------------------
./data/app-config.json
./data/day-001.json
./data/day-002.json
...
./data/day-365.json

IMPORTANT
------------------------------------------------------------
syllabus.json is NEVER loaded by the student frontend.

USER FLOW
------------------------------------------------------------
Open app
   ↓
Show 365 numbered circles
   ↓
Released days are clickable
Future days are locked
   ↓
User clicks a day
   ↓
Load ONLY that day's JSON
   ↓
Render beautiful lesson
   ↓
Render interactive MCQs
   ↓
Answer:
Correct = GREEN
Wrong   = RED
   ↓
Show correct answer + explanation

No lesson is automatically opened.
============================================================
*/


/* ============================================================
   CONFIGURATION
   ============================================================ */

const DEFAULT_TOTAL_DAYS = 365;
const DEFAULT_START_DATE = "2026-08-30";
const DEFAULT_RELEASE_HOUR = 6;
const DEFAULT_RELEASE_MINUTE = 0;
const DEFAULT_TIMEZONE = "Asia/Kolkata";

const CONFIG_URL = "./data/app-config.json";
const DATA_DIRECTORY = "./data/";
const DAY_PREFIX = "day-";
const DAY_SUFFIX = ".json";


/* ============================================================
   APPLICATION STATE
   ============================================================ */

const state = {
    totalDays: DEFAULT_TOTAL_DAYS,
    startDate: DEFAULT_START_DATE,
    releaseHour: DEFAULT_RELEASE_HOUR,
    releaseMinute: DEFAULT_RELEASE_MINUTE,
    timezone: DEFAULT_TIMEZONE,

    releasedDay: 0,
    selectedDay: null,
    lesson: null,

    loading: false,
    deferredInstallPrompt: null,
    releaseTimer: null
};


/* ============================================================
   DOM REFERENCES
   ============================================================ */

const dom = {};


/* ============================================================
   START APPLICATION
   ============================================================ */

document.addEventListener("DOMContentLoaded", initialize);


async function initialize() {

    cacheDOM();

    try {

        hideError();
        hideLoading();

        /*
         * Configuration is useful but NOT allowed to stop
         * the student application if it is temporarily unavailable.
         */
        await loadConfiguration();

        state.releasedDay = calculateReleasedDay();

        renderDayGrid();
        updateHomeStatus();

        /*
         * CRITICAL:
         * Never automatically open a lesson.
         */
        showDays();

        setupEvents();
        setupInstallPrompt();
        registerServiceWorker();

        scheduleReleaseRefresh();

    } catch (error) {

        console.error(
            "VIDHWAAN NEET startup error:",
            error
        );

        showError(
            "VIDHWAAN NEET could not start. Please refresh the app."
        );
    }
}


/* ============================================================
   DOM CACHE
   ============================================================ */

function cacheDOM() {

    dom.app =
        document.getElementById("app");

    dom.daysView =
        document.getElementById("days-view");

    dom.lessonView =
        document.getElementById("lesson-view");

    dom.dayGrid =
        document.getElementById("day-grid");

    dom.lessonContainer =
        document.getElementById("lesson-container");

    dom.loadingState =
        document.getElementById("loading-state");

    dom.errorState =
        document.getElementById("error-state");

    dom.errorMessage =
        document.getElementById("error-message");

    dom.retryButton =
        document.getElementById("retry-button");

    dom.releaseStatusText =
        document.getElementById("release-status-text");

    dom.todayBadge =
        document.getElementById("today-badge");

    dom.releasedDaysCount =
        document.getElementById("released-days-count");

    dom.brandHome =
        document.getElementById("brand-home");

    dom.backButton =
        document.getElementById("back-button");

    dom.lessonDayBadge =
        document.getElementById("lesson-day-badge");

    dom.installButton =
        document.getElementById("install-button");


    const required = [
        ["day-grid", dom.dayGrid],
        ["days-view", dom.daysView],
        ["lesson-view", dom.lessonView],
        ["lesson-container", dom.lessonContainer]
    ];

    for (const [name, element] of required) {

        if (!element) {
            throw new Error(
                `Required HTML element missing: #${name}`
            );
        }
    }
}


/* ============================================================
   EVENTS
   ============================================================ */

function setupEvents() {

    if (dom.brandHome) {

        dom.brandHome.addEventListener(
            "click",
            showDays
        );
    }


    if (dom.backButton) {

        dom.backButton.addEventListener(
            "click",
            showDays
        );
    }


    if (dom.retryButton) {

        dom.retryButton.addEventListener(
            "click",
            retrySelectedDay
        );
    }
}


/* ============================================================
   CONFIGURATION
   ============================================================ */

async function loadConfiguration() {

    try {

        const response =
            await fetch(
                `${CONFIG_URL}?v=${Date.now()}`,
                {
                    method: "GET",
                    cache: "no-store",
                    headers: {
                        "Accept":
                            "application/json"
                    }
                }
            );


        if (!response.ok) {
            throw new Error(
                `Configuration HTTP ${response.status}`
            );
        }


        const loaded =
            await response.json();


        if (
            !loaded ||
            typeof loaded !== "object" ||
            Array.isArray(loaded)
        ) {
            throw new Error(
                "Invalid app configuration."
            );
        }


        /*
         * Use only configuration values relevant
         * to frontend release behavior.
         */
        state.totalDays =
            safeInteger(
                loaded.totalDays,
                DEFAULT_TOTAL_DAYS,
                1,
                DEFAULT_TOTAL_DAYS
            );


        state.startDate =
            firstValid(
                loaded.courseStartDate,
                loaded.releaseStartDate,
                loaded.programStartDateIST,
                DEFAULT_START_DATE
            );


        state.releaseHour =
            safeInteger(
                loaded.dailyActivationHourIST ??
                loaded.publishHour,
                DEFAULT_RELEASE_HOUR,
                0,
                23
            );


        state.releaseMinute =
            safeInteger(
                loaded.publishMinute,
                DEFAULT_RELEASE_MINUTE,
                0,
                59
            );


        state.timezone =
            firstValid(
                loaded.timezone,
                DEFAULT_TIMEZONE
            );


    } catch (error) {

        /*
         * Production fallback.
         *
         * The frontend still works using the known
         * production course schedule.
         */
        console.warn(
            "app-config.json unavailable. Using production defaults.",
            error
        );


        state.totalDays =
            DEFAULT_TOTAL_DAYS;

        state.startDate =
            DEFAULT_START_DATE;

        state.releaseHour =
            DEFAULT_RELEASE_HOUR;

        state.releaseMinute =
            DEFAULT_RELEASE_MINUTE;

        state.timezone =
            DEFAULT_TIMEZONE;
    }
}


/* ============================================================
   SAFE CONFIG HELPERS
   ============================================================ */

function safeInteger(
    value,
    fallback,
    minimum,
    maximum
) {

    const number =
        Number(value);

    if (
        Number.isInteger(number) &&
        number >= minimum &&
        number <= maximum
    ) {
        return number;
    }

    return fallback;
}


function firstValid(...values) {

    for (const value of values) {

        if (
            value !== null &&
            value !== undefined &&
            String(value).trim() !== ""
        ) {
            return String(value).trim();
        }
    }

    return "";
}


/* ============================================================
   IST CLOCK
   ============================================================ */

function getISTParts() {

    const parts =
        new Intl.DateTimeFormat(
            "en-CA",
            {
                timeZone:
                    DEFAULT_TIMEZONE,
                year: "numeric",
                month: "2-digit",
                day: "2-digit",
                hour: "2-digit",
                minute: "2-digit",
                second: "2-digit",
                hourCycle: "h23"
            }
        ).formatToParts(
            new Date()
        );


    const values = {};


    for (const part of parts) {

        if (
            part.type !== "literal"
        ) {
            values[part.type] =
                part.value;
        }
    }


    return {
        year: Number(values.year),
        month: Number(values.month),
        day: Number(values.day),
        hour: Number(values.hour),
        minute: Number(values.minute),
        second: Number(values.second)
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

function parseDateOnly(value) {

    const match =
        /^(\d{4})-(\d{2})-(\d{2})$/
            .exec(String(value));


    if (!match) {

        throw new Error(
            `Invalid date: ${value}`
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


function daysBetween(
    startDate,
    endDate
) {

    const start =
        parseDateOnly(startDate);

    const end =
        parseDateOnly(endDate);


    return Math.floor(
        (
            end.getTime() -
            start.getTime()
        ) / 86400000
    );
}


/* ============================================================
   RELEASE CALCULATION
   ============================================================ */

/*
   30 Aug 2026 05:59 → 0
   30 Aug 2026 06:00 → Day 1

   31 Aug 2026 05:59 → Day 1
   31 Aug 2026 06:00 → Day 2

   ...
*/

function calculateReleasedDay() {

    const today =
        getISTDateString();


    const difference =
        daysBetween(
            state.startDate,
            today
        );


    /*
     * Before course start.
     */
    if (difference < 0) {
        return 0;
    }


    const now =
        getISTParts();


    const releaseReached =
        now.hour >
            state.releaseHour ||
        (
            now.hour ===
                state.releaseHour &&
            now.minute >=
                state.releaseMinute
        );


    let released =
        difference +
        (
            releaseReached
                ? 1
                : 0
        );


    released =
        Math.max(
            0,
            Math.min(
                released,
                state.totalDays
            )
        );


    return released;
}


/* ============================================================
   DAY GRID
   ============================================================ */

function renderDayGrid() {

    if (!dom.dayGrid) {
        return;
    }


    state.releasedDay =
        calculateReleasedDay();


    const fragment =
        document.createDocumentFragment();


    for (
        let day = 1;
        day <= state.totalDays;
        day++
    ) {

        const button =
            document.createElement(
                "button"
            );


        button.type = "button";

        button.className =
            "day-button";

        button.dataset.day =
            String(day);


        const number =
            document.createElement(
                "span"
            );


        number.className =
            "day-number";

        number.textContent =
            String(day);


        button.appendChild(
            number
        );


        if (
            day <=
            state.releasedDay
        ) {

            button.classList.add(
                "available"
            );


            button.setAttribute(
                "aria-label",
                `Open Day ${day}`
            );


            button.addEventListener(
                "click",
                () => openDay(day)
            );


        } else {

            button.classList.add(
                "locked"
            );


            button.disabled =
                true;


            button.setAttribute(
                "aria-label",
                `Day ${day} locked`
            );


            button.setAttribute(
                "aria-disabled",
                "true"
            );
        }


        /*
         * The latest released day is the
         * highlighted current course day.
         */
        if (
            day ===
            state.releasedDay
        ) {

            button.classList.add(
                "current"
            );

            button.setAttribute(
                "aria-current",
                "true"
            );
        }


        fragment.appendChild(
            button
        );
    }


    dom.dayGrid.replaceChildren(
        fragment
    );


    updateDaysCount();
}


function updateDaysCount() {

    if (!dom.releasedDaysCount) {
        return;
    }


    dom.releasedDaysCount.textContent =
        `${state.releasedDay} / ${state.totalDays} available`;
}


/* ============================================================
   HOME STATUS
   ============================================================ */

function updateHomeStatus() {

    state.releasedDay =
        calculateReleasedDay();


    updateDaysCount();


    if (dom.todayBadge) {

        if (
            state.releasedDay > 0
        ) {

            dom.todayBadge.textContent =
                `Day ${state.releasedDay} available`;

        } else {

            dom.todayBadge.textContent =
                "Course starts at 6:00 AM IST";
        }
    }


    if (dom.releaseStatusText) {

        if (
            state.releasedDay === 0
        ) {

            dom.releaseStatusText.textContent =
                "Day 1 unlocks at 6:00 AM IST";

        } else if (
            state.releasedDay >=
            state.totalDays
        ) {

            dom.releaseStatusText.textContent =
                "All 365 days available";

        } else {

            dom.releaseStatusText.textContent =
                `Day ${state.releasedDay} available`;
        }
    }
}


/* ============================================================
   OPEN DAY
   ============================================================ */

async function openDay(dayNumber) {

    /*
     * Always recalculate before opening.
     * This prevents future days being opened manually.
     */
    const released =
        calculateReleasedDay();


    state.releasedDay =
        released;


    if (
        !Number.isInteger(dayNumber) ||
        dayNumber < 1 ||
        dayNumber > state.totalDays
    ) {
        return;
    }


    if (
        dayNumber >
        released
    ) {

        renderDayGrid();
        showDays();

        return;
    }


    state.selectedDay =
        dayNumber;


    try {

        hideError();
        showLoading();


        const lesson =
            await loadDayJSON(
                dayNumber
            );


        validateLesson(
            lesson,
            dayNumber
        );


        state.lesson =
            lesson;


        renderLesson(
            lesson,
            dayNumber
        );


        hideLoading();

        showLesson();


        window.scrollTo({
            top: 0,
            behavior: "smooth"
        });


    } catch (error) {

        console.error(
            `Day ${dayNumber} failed:`,
            error
        );


        hideLoading();


        showError(
            `Unable to load Day ${dayNumber}. Please try again.`
        );
    }
}


/* ============================================================
   LOAD ONE DAILY JSON
   ============================================================ */

async function loadDayJSON(
    dayNumber
) {

    const filename =
        `${DAY_PREFIX}` +
        `${String(dayNumber).padStart(3, "0")}` +
        `${DAY_SUFFIX}`;


    const url =
        `${DATA_DIRECTORY}${filename}?v=${Date.now()}`;


    const response =
        await fetch(
            url,
            {
                method: "GET",
                cache: "no-store",
                headers: {
                    "Accept":
                        "application/json"
                }
            }
        );


    if (!response.ok) {

        throw new Error(
            `HTTP ${response.status}: ${filename}`
        );
    }


    const data =
        await response.json();


    return data;
}


/* ============================================================
   VALIDATE DAILY JSON
   ============================================================ */

function validateLesson(
    lesson,
    expectedDay
) {

    if (
        !lesson ||
        typeof lesson !== "object" ||
        Array.isArray(lesson)
    ) {

        throw new Error(
            "Daily lesson JSON is invalid."
        );
    }


    if (
        lesson.day !== undefined &&
        Number(lesson.day) !==
            expectedDay
    ) {

        throw new Error(
            `Day mismatch: requested ${expectedDay}, received ${lesson.day}.`
        );
    }
}


/* ============================================================
   LESSON RENDERER
   ============================================================ */

function renderLesson(
    lesson,
    dayNumber
) {

    const title =
        firstValid(
            lesson.title,
            `Day ${dayNumber}`
        );


    const subject =
        firstValid(
            lesson.subject,
            ""
        );


    const unit =
        firstValid(
            lesson.unit,
            ""
        );


    const chapter =
        firstValid(
            lesson.chapter,
            ""
        );


    const focus =
        toArray(
            lesson.neetFocus
        );


    const outcomes =
        toArray(
            lesson.learningOutcome
        );


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


    if (dom.lessonDayBadge) {

        dom.lessonDayBadge.textContent =
            `DAY ${dayNumber}`;
    }


    dom.lessonContainer.innerHTML = `

        <article class="neet-lesson">

            <header class="lesson-hero">

                <span class="lesson-day-label">
                    DAY ${dayNumber}
                </span>

                <h1 class="lesson-title">
                    ${escapeHTML(title)}
                </h1>

                ${
                    subject ||
                    unit ||
                    chapter
                        ? `
                            <p class="lesson-subtitle">
                                ${renderMeta(
                                    subject,
                                    unit,
                                    chapter
                                )}
                            </p>
                          `
                        : ""
                }

            </header>


            ${
                focus.length
                    ? `
                        <section class="content-section">

                            <div class="content-card">

                                <h2>
                                    NEET Focus
                                </h2>

                                ${renderList(
                                    focus
                                )}

                            </div>

                        </section>
                      `
                    : ""
            }


            ${
                outcomes.length
                    ? `
                        <section class="content-section">

                            <div class="content-card">

                                <h2>
                                    What You Will Learn
                                </h2>

                                ${renderList(
                                    outcomes
                                )}

                            </div>

                        </section>
                      `
                    : ""
            }


            ${
                sections.length
                    ? `
                        <section class="content-section">

                            <div class="section-heading">

                                <div>

                                    <span class="section-kicker">
                                        CORE CONCEPTS
                                    </span>

                                    <h2>
                                        Concepts
                                    </h2>

                                </div>

                            </div>

                            <div class="topics-list">

                                ${sections
                                    .map(
                                        (
                                            section,
                                            index
                                        ) =>
                                            renderSection(
                                                section,
                                                index
                                            )
                                    )
                                    .join("")}

                            </div>

                        </section>
                      `
                    : ""
            }


            ${
                mcqs.length
                    ? `
                        <section
                            class="mcqs-section"
                            id="mcqs-section"
                        >

                            <div class="mcqs-header">

                                <span class="section-kicker">
                                    NEET PRACTICE
                                </span>

                                <h2>
                                    MCQs
                                </h2>

                                <p>
                                    Test your understanding.
                                    Select one answer for each question.
                                </p>

                            </div>

                            <div
                                class="mcqs-list"
                                id="mcqs-list"
                            >

                                ${mcqs
                                    .map(
                                        (
                                            mcq,
                                            index
                                        ) =>
                                            renderMCQ(
                                                mcq,
                                                index
                                            )
                                    )
                                    .join("")}

                            </div>

                        </section>
                      `
                    : ""
            }

        </article>
    `;


    attachMCQEvents();
}


/* ============================================================
   META
   ============================================================ */

function renderMeta(
    subject,
    unit,
    chapter
) {

    return [
        subject,
        unit,
        chapter
    ]
        .filter(Boolean)
        .map(
            escapeHTML
        )
        .join(" • ");
}


/* ============================================================
   SECTION / CONCEPT
   ============================================================ */

function renderSection(
    section,
    index
) {

    if (
        !section ||
        typeof section !== "object"
    ) {
        return "";
    }


    const topic =
        firstValid(
            section.topic,
            ""
        );


    const heading =
        firstValid(
            section.heading,
            topic ||
                `Concept ${index + 1}`
        );


    const content =
        section.content ??
        "";


    const subsections =
        Array.isArray(
            section.subsections
        )
            ? section.subsections
            : [];


    const keyPoints =
        toArray(
            section.keyPoints
        );


    const tips =
        toArray(
            section.neetTips
        );


    return `

        <article class="topic-card">

            <div class="topic-header">

                <span class="topic-number">
                    ${String(index + 1).padStart(2, "0")}
                </span>

                <div>

                    <h3 class="topic-title">
                        ${escapeHTML(heading)}
                    </h3>

                    ${
                        topic &&
                        topic !== heading
                            ? `
                                <div class="topic-name">
                                    ${escapeHTML(topic)}
                                </div>
                              `
                            : ""
                    }

                </div>

            </div>


            <div class="topic-content">

                ${
                    content
                        ? `
                            <p>
                                ${renderRichText(
                                    content
                                )}
                            </p>
                          `
                        : ""
                }


                ${
                    subsections.length
                        ? `
                            <div class="concepts-list">

                                ${subsections
                                    .map(
                                        (
                                            subsection
                                        ) =>
                                            renderSubsection(
                                                subsection
                                            )
                                    )
                                    .join("")}

                            </div>
                          `
                        : ""
                }


                ${
                    keyPoints.length
                        ? `
                            <div class="key-points">

                                <div class="key-points-title">
                                    Key Points
                                </div>

                                ${renderList(
                                    keyPoints
                                )}

                            </div>
                          `
                        : ""
                }


                ${
                    tips.length
                        ? `
                            <div class="neet-tips">

                                <div class="neet-tip-title">
                                    NEET Tips
                                </div>

                                ${renderList(
                                    tips
                                )}

                            </div>
                          `
                        : ""
                }

            </div>

        </article>
    `;
}


/* ============================================================
   SUBSECTION
   ============================================================ */

function renderSubsection(
    subsection
) {

    if (
        !subsection ||
        typeof subsection !== "object"
    ) {
        return "";
    }


    const heading =
        firstValid(
            subsection.heading,
            ""
        );


    const content =
        subsection.content ??
        "";


    return `

        <div class="concept-card">

            <div class="concept-header">

                <span class="concept-number">
                    •
                </span>

                <h3 class="concept-title">
                    ${escapeHTML(heading)}
                </h3>

            </div>

            <div class="concept-content">

                <p>
                    ${renderRichText(
                        content
                    )}
                </p>

            </div>

        </div>
    `;
}


/* ============================================================
   MCQ RENDERER
   ============================================================ */

function renderMCQ(
    mcq,
    index
) {
    if (
        !mcq ||
        typeof mcq !== "object"
    ) {
        return "";
    }

    const question =
        firstValid(
            mcq.question,
            `Question ${index + 1}`
        );

    const options =
        Array.isArray(mcq.options)
            ? mcq.options
            : [];

    /*
     * PRODUCTION JSON FORMAT
     *
     * answer: 0 = A
     * answer: 1 = B
     * answer: 2 = C
     * answer: 3 = D
     *
     * Example:
     * "answer": 2
     * means option C is correct.
     */
    const correct =
        normalizeAnswer(
            mcq.answer
        );

    const explanation =
        firstValid(
            mcq.explanation,
            "Explanation not provided."
        );

    return `
        <article
            class="mcq-card"
            data-mcq-index="${index}"
            data-correct-answer="${escapeHTML(correct)}"
        >

            <div class="mcq-header">

                <span class="mcq-number">
                    Question ${index + 1}
                </span>

                <span class="mcq-topic">
                    NEET MCQ
                </span>

            </div>

            <div class="mcq-body">

                <h3 class="mcq-question">
                    ${renderRichText(question)}
                </h3>

                <div class="mcq-options">

                    ${options
                        .map(
                            (
                                option,
                                optionIndex
                            ) =>
                                renderOption(
                                    option,
                                    optionIndex
                                )
                        )
                        .join("")}

                </div>

                <div
                    class="mcq-result"
                    hidden
                >
                </div>

                <div
                    class="mcq-explanation"
                    hidden
                >

                    <div class="mcq-explanation-title">
                        Explanation
                    </div>

                    <p>
                        ${renderRichText(
                            explanation
                        )}
                    </p>

                </div>

            </div>

        </article>
    `;
}



/* ============================================================
   MCQ OPTION
   ============================================================ */

function renderOption(
    option,
    index
) {

    const letter =
        String.fromCharCode(
            65 + index
        );


    return `

        <button
            type="button"
            class="mcq-option"
            data-option="${letter}"
        >

            <span class="option-letter">
                ${letter}
            </span>

            <span class="option-text">
                ${renderRichText(
                    option
                )}
            </span>

        </button>
    `;
}


/* ============================================================
   MCQ EVENTS
   ============================================================ */

function attachMCQEvents() {

    const cards =
        dom.lessonContainer
            .querySelectorAll(
                ".mcq-card"
            );


    cards.forEach(
        card => {

            const options =
                card.querySelectorAll(
                    ".mcq-option"
                );


            options.forEach(
                option => {

                    option.addEventListener(
                        "click",
                        () =>
                            answerMCQ(
                                card,
                                option
                            )
                    );
                }
            );
        }
    );
}


/* ============================================================
   ANSWER MCQ
   ============================================================ */

function answerMCQ(
    card,
    selectedOption
) {

    /*
     * Prevent answering the same question
     * more than once.
     */
    if (
        card.dataset.answered ===
        "true"
    ) {
        return;
    }

    /*
     * Selected answer:
     *
     * A / B / C / D
     */
    const selected =
        normalizeAnswer(
            selectedOption.dataset.option
        );

    /*
     * Correct answer comes from the
     * JSON through renderMCQ().
     */
    const correct =
        normalizeAnswer(
            card.dataset.correctAnswer
        );

    const allOptions =
        card.querySelectorAll(
            ".mcq-option"
        );

    const result =
        card.querySelector(
            ".mcq-result"
        );

    const explanation =
        card.querySelector(
            ".mcq-explanation"
        );

    /*
     * Safety validation.
     */
    if (
        !/^[A-D]$/.test(correct)
    ) {
        console.error(
            "Invalid MCQ correct answer:",
            card.dataset.correctAnswer
        );

        return;
    }

    /*
     * Check student's answer.
     */
    const isCorrect =
        selected === correct;

    /*
     * Mark question as answered.
     */
    card.dataset.answered =
        "true";

    /*
     * Disable all options after
     * the first answer.
     */
    allOptions.forEach(
        option => {
            option.disabled =
                true;
        }
    );

    /*
     * ALWAYS highlight the real
     * correct answer GREEN.
     */
    allOptions.forEach(
        option => {

            const optionLetter =
                normalizeAnswer(
                    option.dataset.option
                );

            if (
                optionLetter === correct
            ) {
                option.classList.add(
                    "correct",
                    "is-correct"
                );
            }
        }
    );

    /*
     * If the student selected
     * the wrong answer, mark
     * ONLY that selected answer RED.
     */
    if (!isCorrect) {

        selectedOption.classList.add(
            "wrong",
            "is-wrong"
        );
    }

    /*
     * Find the actual correct
     * option text.
     *
     * Example:
     * C — Ability to move
     */
    let correctOptionText = "";

    allOptions.forEach(
        option => {

            const optionLetter =
                normalizeAnswer(
                    option.dataset.option
                );

            if (
                optionLetter === correct
            ) {

                const text =
                    option.querySelector(
                        ".option-text"
                    );

                if (text) {
                    correctOptionText =
                        text.textContent.trim();
                }
            }
        }
    );

    /*
     * Show result immediately.
     */
    if (result) {

        result.hidden =
            false;

        result.className =
            `mcq-result ${
                isCorrect
                    ? "correct"
                    : "wrong"
            }`;

        result.innerHTML = `

            <div class="mcq-result-title">

                ${
                    isCorrect
                        ? "✓ Correct!"
                        : "✕ Incorrect"
                }

            </div>

            <p class="mcq-result-answer">

                Correct answer:

                <strong>
                    ${escapeHTML(correct)}
                </strong>

                ${
                    correctOptionText
                        ? `
                            — ${escapeHTML(
                                correctOptionText
                            )}
                          `
                        : ""
                }

            </p>

        `;
    }

    /*
     * ALWAYS open the explanation
     * immediately after the user
     * selects an answer.
     */
    if (explanation) {

        explanation.hidden =
            false;
    }
}



/* ============================================================
   ANSWER NORMALISATION
   ============================================================ */

function normalizeAnswer(
    value
) {

    if (
        value === null ||
        value === undefined
    ) {
        return "";
    }

    /*
     * Your generated JSON uses
     * ZERO-BASED answer indexes:
     *
     * 0 = A
     * 1 = B
     * 2 = C
     * 3 = D
     */
    if (
        typeof value === "number" &&
        Number.isInteger(value) &&
        value >= 0 &&
        value <= 3
    ) {
        return String.fromCharCode(
            65 + value
        );
    }

    const text =
        String(value)
            .trim()
            .toUpperCase();

    /*
     * Direct A / B / C / D
     */
    if (
        /^[A-D]$/.test(text)
    ) {
        return text;
    }

    /*
     * Numeric string:
     *
     * "0" = A
     * "1" = B
     * "2" = C
     * "3" = D
     */
    if (
        /^[0-3]$/.test(text)
    ) {
        return String.fromCharCode(
            65 + Number(text)
        );
    }

    /*
     * Support:
     *
     * Option A
     * Option B
     * Option C
     * Option D
     */
    const optionMatch =
        text.match(
            /\bOPTION\s+([A-D])\b/
        );

    if (optionMatch) {
        return optionMatch[1];
    }

    /*
     * Support:
     *
     * Answer: A
     * Answer: B
     * Answer: C
     * Answer: D
     */
    const answerMatch =
        text.match(
            /\bANSWER\s*[:\-]?\s*([A-D])\b/
        );

    if (answerMatch) {
        return answerMatch[1];
    }

    /*
     * Fallback:
     * preserve the normalized value.
     */
    return text;
}


/* ============================================================
   TEXT HELPERS
   ============================================================ */

function toArray(value) {

    if (
        !Array.isArray(value)
    ) {
        return [];
    }


    return value
        .filter(
            item =>
                item !== null &&
                item !== undefined &&
                String(item).trim() !== ""
        );
}


function renderList(
    items
) {

    if (
        !Array.isArray(items) ||
        items.length === 0
    ) {
        return "";
    }


    return `

        <ul class="neet-content-list">

            ${items
                .map(
                    item => `
                        <li>
                            ${renderRichText(
                                item
                            )}
                        </li>
                    `
                )
                .join("")}

        </ul>
    `;
}


/*
 * Safe text renderer.
 *
 * We intentionally escape HTML first.
 * This prevents generated JSON content
 * from injecting arbitrary HTML/JS.
 *
 * Basic Markdown-style emphasis is then
 * converted safely:
 *
 * *text* → <em>text</em>
 */
function renderRichText(
    value
) {

    const text =
        String(
            value ?? ""
        );


    let safe =
        escapeHTML(
            text
        );


    /*
     * Convert simple line breaks.
     */
    safe =
        safe.replace(
            /\r?\n/g,
            "<br>"
        );


    /*
     * Safe simple emphasis.
     */
    safe =
        safe.replace(
            /\*([^*]+)\*/g,
            "<em>$1</em>"
        );


    return safe;
}


/* ============================================================
   HTML ESCAPING
   ============================================================ */

function escapeHTML(
    value
) {

    return String(
        value ?? ""
    )
        .replaceAll(
            "&",
            "&amp;"
        )
        .replaceAll(
            "<",
            "&lt;"
        )
        .replaceAll(
            ">",
            "&gt;"
        )
        .replaceAll(
            '"',
            "&quot;"
        )
        .replaceAll(
            "'",
            "&#039;"
        );
}


/* ============================================================
   VIEWS
   ============================================================ */

function showDays() {

    hideLoading();
    hideError();


    if (dom.lessonView) {
        dom.lessonView.hidden =
            true;
    }


    if (dom.daysView) {
        dom.daysView.hidden =
            false;
    }


    state.selectedDay =
        null;

    state.lesson =
        null;


    updateHomeStatus();
    renderDayGrid();


    window.scrollTo({
        top: 0,
        behavior: "smooth"
    });
}


function showLesson() {

    hideError();


    if (dom.daysView) {
        dom.daysView.hidden =
            true;
    }


    if (dom.lessonView) {
        dom.lessonView.hidden =
            false;
    }
}


/* ============================================================
   LOADING
   ============================================================ */

function showLoading() {

    state.loading =
        true;


    if (dom.loadingState) {

        dom.loadingState.hidden =
            false;
    }
}


function hideLoading() {

    state.loading =
        false;


    if (dom.loadingState) {

        dom.loadingState.hidden =
            true;
    }
}


/* ============================================================
   ERROR
   ============================================================ */

function showError(
    message
) {

    if (dom.errorMessage) {

        dom.errorMessage.textContent =
            message;
    }


    if (dom.errorState) {

        dom.errorState.hidden =
            false;
    }
}


function hideError() {

    if (dom.errorState) {

        dom.errorState.hidden =
            true;
    }
}


async function retrySelectedDay() {

    hideError();


    if (
        Number.isInteger(
            state.selectedDay
        )
    ) {

        await openDay(
            state.selectedDay
        );

    } else {

        await initialize();
    }
}


/* ============================================================
   RELEASE REFRESH
   ============================================================ */

function scheduleReleaseRefresh() {

    if (state.releaseTimer) {

        clearInterval(
            state.releaseTimer
        );
    }


    /*
     * Check periodically so the app does not
     * require a manual refresh at 06:00.
     */
    state.releaseTimer =
        setInterval(
            () => {

                const previous =
                    state.releasedDay;


                const current =
                    calculateReleasedDay();


                if (
                    current !==
                    previous
                ) {

                    state.releasedDay =
                        current;


                    if (
                        !dom.lessonView ||
                        dom.lessonView.hidden
                    ) {

                        renderDayGrid();
                        updateHomeStatus();
                    }
                }

            },
            30000
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

            state.deferredInstallPrompt =
                event;


            if (dom.installButton) {

                dom.installButton.hidden =
                    false;
            }
        }
    );


    window.addEventListener(
        "appinstalled",
        () => {

            state.deferredInstallPrompt =
                null;


            if (dom.installButton) {

                dom.installButton.hidden =
                    true;
            }
        }
    );


    if (dom.installButton) {

        dom.installButton.addEventListener(
            "click",
            installApplication
        );
    }
}


async function installApplication() {

    const prompt =
        state.deferredInstallPrompt;


    if (!prompt) {
        return;
    }


    prompt.prompt();


    try {

        await prompt.userChoice;

    } catch (error) {

        console.warn(
            "PWA install choice failed:",
            error
        );
    }


    state.deferredInstallPrompt =
        null;


    if (dom.installButton) {

        dom.installButton.hidden =
            true;
    }
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
        () => {

            navigator.serviceWorker
                .register(
                    "./sw.js",
                    {
                        scope: "./"
                    }
                )
                .then(
                    registration => {

                        console.log(
                            "VIDHWAAN NEET service worker registered:",
                            registration.scope
                        );
                    }
                )
                .catch(
                    error => {

                        console.warn(
                            "Service worker registration failed:",
                            error
                        );
                    }
                );
        }
    );
}
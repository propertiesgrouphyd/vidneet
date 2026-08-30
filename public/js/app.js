/* ============================================================
   VIDHWAAN NEET
   365-DAY DAILY JSON ENGINE
   ============================================================

   DAILY RELEASE RULE

   Program start:
       30 August 2026

   Activation:
       Every day at 06:00 Asia/Kolkata

   Therefore:
       30 Aug 2026 06:00 -> day-001.json
       31 Aug 2026 06:00 -> day-002.json
       01 Sep 2026 06:00 -> day-003.json
       ...

   IMPORTANT:
   - syllabus.json is NEVER loaded.
   - day.html is NOT required.
   - Each lesson is loaded directly from data/days/.
   - Future days remain locked.
   - Clicking an available day loads that day's JSON.
   - MCQs are interactive.
   ============================================================ */

"use strict";


/* ============================================================
   CONFIGURATION
   ============================================================ */

const CONFIG_PATH = "./data/app-config.json";

const FALLBACK_CONFIG = {
    totalDays: 365,
    programStartDateIST: "2026-08-30",
    dailyActivationHourIST: 6,
    contentDirectory: "data/days",
    timezone: "Asia/Kolkata"
};


/* ============================================================
   APPLICATION STATE
   ============================================================ */

const state = {
    config: null,

    totalDays: 365,

    startDate: null,

    activationHour: 6,

    contentDirectory: "data/days",

    todayDayNumber: 0,

    selectedDay: null,

    lesson: null,

    mcqAnswers: new Map(),

    deferredInstallPrompt: null
};


/* ============================================================
   DOM REFERENCES
   ============================================================ */

const dom = {
    dayGrid:
        document.getElementById("day-grid"),

    lessonContainer:
        document.getElementById("lesson-container"),

    loadingState:
        document.getElementById("loading-state"),

    errorState:
        document.getElementById("error-state"),

    errorMessage:
        document.getElementById("error-message"),

    retryButton:
        document.getElementById("retry-button"),

    todayBadgeText:
        document.getElementById("today-badge-text"),

    syllabusSummary:
        document.getElementById("syllabus-summary"),

    releaseStatusText:
        document.getElementById("release-status-text"),

    installButton:
        document.getElementById("install-button")
};


/* ============================================================
   INITIALIZATION
   ============================================================ */

document.addEventListener("DOMContentLoaded", initialize);


async function initialize() {

    bindGlobalEvents();

    showLoading();

    try {

        state.config = await loadConfig();

        applyConfig();

        calculateReleasedDay();

        renderDayGrid();

        updateStatus();

        /*
         * Automatically load today's released lesson.
         *
         * If the current time is before 06:00 on the
         * program start date, no lesson is released yet.
         */
        if (state.todayDayNumber >= 1) {

            await loadDay(state.todayDayNumber, false);

        } else {

            showPreReleaseState();

        }

    } catch (error) {

        console.error(
            "[Vidhwaan NEET] Initialization failed:",
            error
        );

        showError(
            "The application could not initialize. Please refresh and try again."
        );
    }
}


/* ============================================================
   CONFIG LOADING
   ============================================================ */

async function loadConfig() {

    try {

        const response = await fetch(
            `${CONFIG_PATH}?v=${Date.now()}`,
            {
                cache: "no-store"
            }
        );

        if (!response.ok) {
            throw new Error(
                `Config request failed: ${response.status}`
            );
        }

        const config = await response.json();

        return {
            ...FALLBACK_CONFIG,
            ...config
        };

    } catch (error) {

        /*
         * The application can still operate using the
         * production fallback values.
         */
        console.warn(
            "[Vidhwaan NEET] Config unavailable. Using fallback configuration.",
            error
        );

        return {
            ...FALLBACK_CONFIG
        };
    }
}


/* ============================================================
   APPLY CONFIG
   ============================================================ */

function applyConfig() {

    state.totalDays =
        Number(state.config.totalDays) || 365;

    state.activationHour =
        Number(state.config.dailyActivationHourIST) || 6;

    state.contentDirectory =
        String(
            state.config.contentDirectory ||
            "data/days"
        ).replace(/\/+$/, "");

    const configuredStart =
        state.config.programStartDateIST ||
        state.config.courseStartDate ||
        state.config.releaseStartDate ||
        "2026-08-30";

    state.startDate =
        parseISTDate(configuredStart);

    if (!state.startDate) {

        throw new Error(
            "Invalid program start date."
        );
    }
}


/* ============================================================
   IST DATE HELPERS
   ============================================================ */

/*
 * Parse YYYY-MM-DD as an IST calendar date.
 *
 * We intentionally do not use:
 *
 *     new Date("2026-08-30")
 *
 * because that is interpreted as UTC midnight and can cause
 * timezone-related off-by-one errors.
 */
function parseISTDate(dateString) {

    const match =
        String(dateString).match(
            /^(\d{4})-(\d{2})-(\d{2})$/
        );

    if (!match) {
        return null;
    }

    const year =
        Number(match[1]);

    const month =
        Number(match[2]);

    const day =
        Number(match[3]);

    return {
        year,
        month,
        day
    };
}


/*
 * Return current time represented in Asia/Kolkata.
 *
 * The browser may be in any timezone.
 * The calculation therefore uses Intl.DateTimeFormat.
 */
function getCurrentISTParts() {

    const formatter =
        new Intl.DateTimeFormat(
            "en-CA",
            {
                timeZone: "Asia/Kolkata",

                year: "numeric",
                month: "2-digit",
                day: "2-digit",

                hour: "2-digit",
                minute: "2-digit",
                second: "2-digit",

                hourCycle: "h23"
            }
        );

    const parts =
        formatter.formatToParts(new Date());

    const result = {};

    for (const part of parts) {

        if (part.type !== "literal") {
            result[part.type] =
                Number(part.value);
        }
    }

    return result;
}


/*
 * Convert an IST calendar date into a UTC timestamp.
 *
 * India is UTC+05:30.
 */
function istCalendarToUTC(
    year,
    month,
    day,
    hour = 0,
    minute = 0,
    second = 0
) {

    return Date.UTC(
        year,
        month - 1,
        day,
        hour - 5,
        minute - 30,
        second
    );
}


/*
 * Get the number of calendar days between two IST dates.
 */
function calendarDayDifference(
    start,
    current
) {

    const startUTC =
        istCalendarToUTC(
            start.year,
            start.month,
            start.day
        );

    const currentUTC =
        istCalendarToUTC(
            current.year,
            current.month,
            current.day
        );

    return Math.floor(
        (
            currentUTC -
            startUTC
        ) /
        86400000
    );
}


/* ============================================================
   DAILY RELEASE CALCULATION
   ============================================================ */

function calculateReleasedDay() {

    const now =
        getCurrentISTParts();

    const daysSinceStart =
        calendarDayDifference(
            state.startDate,
            now
        );

    /*
     * Before the course start date.
     */
    if (daysSinceStart < 0) {

        state.todayDayNumber = 0;

        return;
    }


    /*
     * The program's first lesson is not available
     * until the configured activation hour.
     *
     * Example:
     *
     * 30 Aug 05:59 -> Day 0
     * 30 Aug 06:00 -> Day 1
     */
    if (
        daysSinceStart === 0 &&
        now.hour < state.activationHour
    ) {

        state.todayDayNumber = 0;

        return;
    }


    /*
     * Day number is calendar difference + 1.
     */
    const calculatedDay =
        daysSinceStart + 1;


    /*
     * Never expose a day beyond the 365-day course.
     */
    state.todayDayNumber =
        Math.max(
            0,
            Math.min(
                calculatedDay,
                state.totalDays
            )
        );
}


/* ============================================================
   DAY GRID
   ============================================================ */

function renderDayGrid() {

    dom.dayGrid.innerHTML = "";

    const fragment =
        document.createDocumentFragment();


    for (
        let day = 1;
        day <= state.totalDays;
        day++
    ) {

        const button =
            document.createElement("button");

        button.type = "button";

        button.className =
            "day-button";

        button.dataset.day =
            String(day);

        button.setAttribute(
            "aria-label",
            `Day ${day}`
        );


        const label =
            document.createElement("span");

        label.textContent =
            String(day);

        button.appendChild(label);


        /*
         * Future day.
         */
        if (
            day >
            state.todayDayNumber
        ) {

            button.classList.add(
                "locked"
            );

            button.disabled = true;

            button.setAttribute(
                "aria-disabled",
                "true"
            );

        }

        /*
         * Released day.
         */
        else {

            button.classList.add(
                "available"
            );

            button.addEventListener(
                "click",
                () => loadDay(day, true)
            );
        }


        /*
         * Today's released day.
         */
        if (
            day ===
            state.todayDayNumber
        ) {

            button.classList.add(
                "today"
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


    dom.dayGrid.appendChild(
        fragment
    );
}


/* ============================================================
   DAY JSON PATH
   ============================================================ */

function getDayFileName(dayNumber) {

    const padded =
        String(dayNumber)
            .padStart(3, "0");

    return `${state.contentDirectory}/day-${padded}.json`;
}


/* ============================================================
   LOAD DAILY JSON
   ============================================================ */

async function loadDay(
    dayNumber,
    scrollToLesson = true
) {

    /*
     * Safety check:
     * Future days can never be loaded.
     */
    if (
        dayNumber < 1 ||
        dayNumber >
        state.todayDayNumber
    ) {

        return;
    }


    /*
     * Prevent loading the same day repeatedly
     * while it is already displayed.
     */
    if (
        state.selectedDay ===
        dayNumber &&
        state.lesson
    ) {

        if (scrollToLesson) {
            scrollToLessonContainer();
        }

        return;
    }


    showLoading();

    state.selectedDay =
        dayNumber;

    state.lesson =
        null;

    state.mcqAnswers.clear();


    const path =
        getDayFileName(dayNumber);


    try {

        const response =
            await fetch(
                `${path}?v=${cacheVersion()}`,
                {
                    cache: "no-store"
                }
            );


        if (!response.ok) {

            throw new Error(
                `Lesson request failed: ${response.status}`
            );
        }


        const lesson =
            await response.json();


        /*
         * Validate that we received an object.
         */
        if (
            !lesson ||
            typeof lesson !== "object" ||
            Array.isArray(lesson)
        ) {

            throw new Error(
                "Daily JSON has an invalid format."
            );
        }


        state.lesson =
            lesson;


        renderLesson(
            lesson,
            dayNumber
        );


        hideLoading();

        updateSelectedDayUI(
            dayNumber
        );


        if (scrollToLesson) {

            scrollToLessonContainer();
        }

    } catch (error) {

        console.error(
            `[Vidhwaan NEET] Failed to load Day ${dayNumber}:`,
            error
        );

        showError(
            `Day ${String(dayNumber).padStart(3, "0")} could not be loaded. Please check that the JSON file exists in data/days/.`
        );
    }
}


/* ============================================================
   CACHE VERSION
   ============================================================ */

function cacheVersion() {

    /*
     * Daily JSON is deliberately requested with a changing
     * version so a newly generated daily file can become
     * available without relying on stale browser cache.
     */
    const now =
        getCurrentISTParts();

    return [
        now.year,
        String(now.month).padStart(2, "0"),
        String(now.day).padStart(2, "0"),
        String(now.hour).padStart(2, "0")
    ].join("");
}


/* ============================================================
   LESSON RENDERER
   ============================================================ */

function renderLesson(
    lesson,
    dayNumber
) {

    dom.lessonContainer.innerHTML = "";


    const wrapper =
        document.createElement("div");

    wrapper.className =
        "lesson-wrapper";


    /*
     * HEADER
     */

    const header =
        document.createElement("article");

    header.className =
        "lesson-header";


    const eyebrow =
        document.createElement("div");

    eyebrow.className =
        "lesson-eyebrow";

    eyebrow.textContent =
        `DAY ${dayNumber}`;


    const title =
        document.createElement("h2");

    title.textContent =
        getLessonTitle(
            lesson,
            dayNumber
        );


    const date =
        document.createElement("div");

    date.className =
        "lesson-date";

    date.textContent =
        formatDayDate(dayNumber);


    header.appendChild(
        eyebrow
    );

    header.appendChild(
        title
    );

    header.appendChild(
        date
    );


    wrapper.appendChild(
        header
    );


    /*
     * INTRODUCTION
     */

    const introduction =
        getFirstValue(
            lesson,
            [
                "introduction",
                "overview",
                "summary",
                "description"
            ]
        );


    if (introduction) {

        const introCard =
            document.createElement("article");

        introCard.className =
            "lesson-introduction";


        const label =
            document.createElement("div");

        label.className =
            "lesson-card-label";

        label.textContent =
            "Today's Focus";


        const paragraph =
            document.createElement("p");

        paragraph.textContent =
            normalizeText(
                introduction
            );


        introCard.appendChild(
            label
        );

        introCard.appendChild(
            paragraph
        );

        wrapper.appendChild(
            introCard
        );
    }


    /*
     * CONCEPTS
     */

    const concepts =
        getConcepts(
            lesson
        );


    if (concepts.length > 0) {

        const sectionContainer =
            document.createElement("div");

        sectionContainer.className =
            "lesson-sections";


        concepts.forEach(
            (concept, index) => {

                sectionContainer.appendChild(
                    renderConcept(
                        concept,
                        index + 1
                    )
                );
            }
        );


        wrapper.appendChild(
            sectionContainer
        );
    }


    /*
     * LEARNING OUTCOMES
     */

    const outcomes =
        getLearningOutcomes(
            lesson
        );


    if (outcomes.length > 0) {

        wrapper.appendChild(
            renderLearningOutcomes(
                outcomes
            )
        );
    }


    /*
     * MCQS
     */

    const mcqs =
        getMCQs(
            lesson
        );


    if (mcqs.length > 0) {

        wrapper.appendChild(
            renderMCQSection(
                mcqs
            )
        );
    }


    /*
     * Nothing recognizable.
     */

    if (
        concepts.length === 0 &&
        outcomes.length === 0 &&
        mcqs.length === 0 &&
        !introduction
    ) {

        wrapper.appendChild(
            renderRawLesson(
                lesson
            )
        );
    }


    dom.lessonContainer.appendChild(
        wrapper
    );
}


/* ============================================================
   LESSON TITLE
   ============================================================ */

function getLessonTitle(
    lesson,
    dayNumber
) {

    const title =
        getFirstValue(
            lesson,
            [
                "title",
                "lessonTitle",
                "topic",
                "name"
            ]
        );


    if (title) {
        return normalizeText(title);
    }


    /*
     * Some generated files may store the topic
     * inside metadata.
     */
    if (
        lesson.metadata &&
        typeof lesson.metadata === "object"
    ) {

        const metadataTitle =
            getFirstValue(
                lesson.metadata,
                [
                    "title",
                    "topic",
                    "name"
                ]
            );

        if (metadataTitle) {
            return normalizeText(
                metadataTitle
            );
        }
    }


    return `NEET Preparation — Day ${dayNumber}`;
}


/* ============================================================
   CONCEPT EXTRACTION
   ============================================================ */

function getConcepts(lesson) {

    let concepts =
        getFirstValue(
            lesson,
            [
                "concepts",
                "topics",
                "sections",
                "content"
            ]
        );


    if (!Array.isArray(concepts)) {

        /*
         * Some JSON structures may contain a single
         * concept object.
         */
        if (
            concepts &&
            typeof concepts === "object"
        ) {

            concepts = [
                concepts
            ];

        } else {

            concepts = [];
        }
    }


    return concepts;
}


/* ============================================================
   CONCEPT RENDERER
   ============================================================ */

function renderConcept(
    concept,
    number
) {

    const card =
        document.createElement("article");

    card.className =
        "lesson-section";


    const numberBadge =
        document.createElement("div");

    numberBadge.className =
        "lesson-section-number";

    numberBadge.textContent =
        String(number).padStart(2, "0");


    card.appendChild(
        numberBadge
    );


    const title =
        document.createElement("h3");

    title.textContent =
        getObjectText(
            concept,
            [
                "title",
                "name",
                "heading",
                "topic",
                "subtopic"
            ],
            `Concept ${number}`
        );


    card.appendChild(
        title
    );


    const explanation =
        getObjectText(
            concept,
            [
                "explanation",
                "content",
                "description",
                "details",
                "text"
            ],
            ""
        );


    if (explanation) {

        const paragraph =
            document.createElement("p");

        paragraph.textContent =
            normalizeText(
                explanation
            );

        card.appendChild(
            paragraph
        );
    }


    /*
     * Key points.
     */

    const keyPoints =
        getArrayValue(
            concept,
            [
                "keyPoints",
                "key_points",
                "points",
                "importantPoints",
                "takeaways"
            ]
        );


    if (keyPoints.length > 0) {

        const heading =
            document.createElement("h4");

        heading.textContent =
            "Key Points";

        card.appendChild(
            heading
        );


        const list =
            document.createElement("ul");

        list.className =
            "lesson-key-points";


        keyPoints.forEach(
            point => {

                const item =
                    document.createElement("li");

                item.textContent =
                    normalizeText(point);

                list.appendChild(
                    item
                );
            }
        );


        card.appendChild(
            list
        );
    }


    /*
     * NEET tip.
     */

    const tip =
        getFirstValue(
            concept,
            [
                "neetTip",
                "neet_tip",
                "examTip",
                "tip",
                "examPoint"
            ]
        );


    if (tip) {

        const tipCard =
            document.createElement("div");

        tipCard.className =
            "neet-tip";


        const strong =
            document.createElement("strong");

        strong.textContent =
            "NEET Tip";


        const paragraph =
            document.createElement("p");

        paragraph.textContent =
            normalizeText(
                tip
            );


        tipCard.appendChild(
            strong
        );

        tipCard.appendChild(
            paragraph
        );

        card.appendChild(
            tipCard
        );
    }


    return card;
}


/* ============================================================
   LEARNING OUTCOMES
   ============================================================ */

function getLearningOutcomes(lesson) {

    const value =
        getFirstValue(
            lesson,
            [
                "learningOutcomes",
                "learning_outcomes",
                "outcomes",
                "objectives",
                "objectivesForToday"
            ]
        );


    if (!value) {
        return [];
    }


    if (Array.isArray(value)) {
        return value;
    }


    return [
        value
    ];
}


function renderLearningOutcomes(
    outcomes
) {

    const card =
        document.createElement("article");

    card.className =
        "learning-outcome";


    const title =
        document.createElement("h3");

    title.textContent =
        "What You Should Know";


    card.appendChild(
        title
    );


    outcomes.forEach(
        outcome => {

            const paragraph =
                document.createElement("p");

            paragraph.textContent =
                normalizeText(
                    outcome
                );

            card.appendChild(
                paragraph
            );
        }
    );


    return card;
}


/* ============================================================
   MCQ EXTRACTION
   ============================================================ */

function getMCQs(lesson) {

    const value =
        getFirstValue(
            lesson,
            [
                "mcqs",
                "MCQs",
                "questions",
                "quiz",
                "practiceQuestions"
            ]
        );


    if (!Array.isArray(value)) {
        return [];
    }


    return value;
}


/* ============================================================
   MCQ SECTION
   ============================================================ */

function renderMCQSection(
    mcqs
) {

    const section =
        document.createElement("section");

    section.className =
        "mcq-section";


    const header =
        document.createElement("div");

    header.className =
        "mcq-header";


    const eyebrow =
        document.createElement("div");

    eyebrow.className =
        "lesson-eyebrow";

    eyebrow.textContent =
        "NEET PRACTICE";


    const title =
        document.createElement("h3");

    title.textContent =
        "Test Your Understanding";


    const description =
        document.createElement("p");

    description.textContent =
        "Choose the best answer. Your answer and explanation will appear immediately.";


    header.appendChild(
        eyebrow
    );

    header.appendChild(
        title
    );

    header.appendChild(
        description
    );


    section.appendChild(
        header
    );


    mcqs.forEach(
        (mcq, index) => {

            section.appendChild(
                renderMCQ(
                    mcq,
                    index
                )
            );
        }
    );


    return section;
}


/* ============================================================
   SINGLE MCQ
   ============================================================ */

function renderMCQ(
    mcq,
    index
) {

    const card =
        document.createElement("article");

    card.className =
        "mcq-card";


    const number =
        document.createElement("div");

    number.className =
        "mcq-number";

    number.textContent =
        `Question ${index + 1}`;


    const question =
        document.createElement("h4");

    question.className =
        "mcq-question";

    question.textContent =
        getObjectText(
            mcq,
            [
                "question",
                "questionText",
                "text",
                "prompt"
            ],
            "Question"
        );


    const options =
        getMCQOptions(
            mcq
        );


    const optionsContainer =
        document.createElement("div");

    optionsContainer.className =
        "mcq-options";


    const answerPanel =
        document.createElement("div");

    answerPanel.className =
        "mcq-answer-panel";

    answerPanel.hidden = true;


    options.forEach(
        (option, optionIndex) => {

            const optionButton =
                createMCQOption(
                    mcq,
                    option,
                    optionIndex,
                    options,
                    answerPanel
                );

            optionsContainer.appendChild(
                optionButton
            );
        }
    );


    card.appendChild(
        number
    );

    card.appendChild(
        question
    );

    card.appendChild(
        optionsContainer
    );

    card.appendChild(
        answerPanel
    );


    return card;
}


/* ============================================================
   MCQ OPTIONS
   ============================================================ */

function getMCQOptions(
    mcq
) {

    const raw =
        getFirstValue(
            mcq,
            [
                "options",
                "choices",
                "answers"
            ]
        );


    if (!Array.isArray(raw)) {
        return [];
    }


    return raw.map(
        (option, index) => {

            if (
                typeof option === "string" ||
                typeof option === "number"
            ) {

                return {
                    text: String(option),
                    index
                };
            }


            if (
                option &&
                typeof option === "object"
            ) {

                return {
                    text:
                        getObjectText(
                            option,
                            [
                                "text",
                                "label",
                                "answer",
                                "option"
                            ],
                            ""
                        ),

                    index,

                    isCorrect:
                        option.isCorrect === true ||
                        option.correct === true
                };
            }


            return {
                text: "",
                index
            };
        }
    );
}


/* ============================================================
   MCQ OPTION BUTTON
   ============================================================ */

function createMCQOption(
    mcq,
    option,
    optionIndex,
    options,
    answerPanel
) {

    const button =
        document.createElement("button");

    button.type =
        "button";

    button.className =
        "mcq-option";


    const letter =
        document.createElement("span");

    letter.className =
        "mcq-option-letter";

    letter.textContent =
        String.fromCharCode(
            65 + optionIndex
        );


    const text =
        document.createElement("span");

    text.className =
        "mcq-option-text";

    text.textContent =
        option.text;


    button.appendChild(
        letter
    );

    button.appendChild(
        text
    );


    button.addEventListener(
        "click",
        () => {

            answerMCQ(
                mcq,
                optionIndex,
                options,
                button.closest(".mcq-card"),
                answerPanel
            );
        }
    );


    return button;
}


/* ============================================================
   MCQ ANSWERING
   ============================================================ */

function answerMCQ(
    mcq,
    selectedIndex,
    options,
    card,
    answerPanel
) {

    /*
     * A question can only be answered once.
     */
    if (
        card.dataset.answered === "true"
    ) {

        return;
    }


    card.dataset.answered =
        "true";


    const correctIndex =
        findCorrectOption(
            mcq,
            options
        );


    const isCorrect =
        selectedIndex ===
        correctIndex;


    const optionButtons =
        Array.from(
            card.querySelectorAll(
                ".mcq-option"
            )
        );


    /*
     * Disable every option after selection.
     */
    optionButtons.forEach(
        button => {
            button.disabled =
                true;
        }
    );


    /*
     * Selected option.
     */
    if (
        optionButtons[selectedIndex]
    ) {

        optionButtons[
            selectedIndex
        ].classList.add(
            isCorrect
                ? "correct"
                : "wrong"
        );
    }


    /*
     * If the user chose incorrectly,
     * also show the actual correct answer.
     */
    if (
        !isCorrect &&
        correctIndex >= 0 &&
        optionButtons[correctIndex]
    ) {

        optionButtons[
            correctIndex
        ].classList.add(
            "correct"
        );
    }


    renderMCQAnswerPanel(
        answerPanel,
        mcq,
        options,
        correctIndex,
        isCorrect
    );
}


/* ============================================================
   FIND CORRECT ANSWER
   ============================================================ */

function findCorrectOption(
    mcq,
    options
) {

    /*
     * Most robust case:
     * option itself says it is correct.
     */
    const explicitIndex =
        options.findIndex(
            option =>
                option.isCorrect === true
        );


    if (
        explicitIndex >= 0
    ) {

        return explicitIndex;
    }


    /*
     * Check common JSON answer fields.
     */
    const rawCorrect =
        getFirstValue(
            mcq,
            [
                "correctAnswer",
                "correct_answer",
                "answer",
                "correctOption",
                "correct_option",
                "correctIndex",
                "correct_index"
            ]
        );


    if (
        rawCorrect === null ||
        rawCorrect === undefined
    ) {

        return -1;
    }


    /*
     * Numeric answer.
     */
    if (
        typeof rawCorrect === "number"
    ) {

        /*
         * Support both:
         *   0-based: 0,1,2,3
         *   1-based: 1,2,3,4
         *
         * Prefer exact 0-based when valid.
         */
        if (
            rawCorrect >= 0 &&
            rawCorrect < options.length
        ) {

            return rawCorrect;
        }


        if (
            rawCorrect >= 1 &&
            rawCorrect <= options.length
        ) {

            return rawCorrect - 1;
        }
    }


    const answer =
        String(rawCorrect)
            .trim();


    /*
     * Letter answer:
     * A / B / C / D
     */
    if (
        /^[A-Za-z]$/.test(answer)
    ) {

        const index =
            answer
                .toUpperCase()
                .charCodeAt(0) - 65;


        if (
            index >= 0 &&
            index < options.length
        ) {

            return index;
        }
    }


    /*
     * Numeric string.
     */
    if (
        /^\d+$/.test(answer)
    ) {

        const number =
            Number(answer);


        if (
            number >= 0 &&
            number < options.length
        ) {

            return number;
        }


        if (
            number >= 1 &&
            number <= options.length
        ) {

            return number - 1;
        }
    }


    /*
     * Match the actual option text.
     */
    const normalizedAnswer =
        normalizeForComparison(
            answer
        );


    const matchingIndex =
        options.findIndex(
            option =>
                normalizeForComparison(
                    option.text
                ) ===
                normalizedAnswer
        );


    return matchingIndex;
}


/* ============================================================
   MCQ ANSWER PANEL
   ============================================================ */

function renderMCQAnswerPanel(
    panel,
    mcq,
    options,
    correctIndex,
    isCorrect
) {

    panel.innerHTML = "";

    panel.hidden = false;

    panel.classList.toggle(
        "is-correct",
        isCorrect
    );


    const result =
        document.createElement("div");

    result.className =
        "mcq-result";

    result.textContent =
        isCorrect
            ? "✓ Correct! Excellent work."
            : "✕ Not quite. Review the explanation below.";


    panel.appendChild(
        result
    );


    if (
        correctIndex >= 0 &&
        options[correctIndex]
    ) {

        const correctAnswer =
            document.createElement("div");

        correctAnswer.className =
            "mcq-correct-answer";


        const label =
            document.createElement("strong");

        label.textContent =
            "Correct Answer";


        const answer =
            document.createElement("span");

        answer.textContent =
            `${String.fromCharCode(65 + correctIndex)}. ${options[correctIndex].text}`;


        correctAnswer.appendChild(
            label
        );

        correctAnswer.appendChild(
            answer
        );

        panel.appendChild(
            correctAnswer
        );
    }


    const explanation =
        getFirstValue(
            mcq,
            [
                "explanation",
                "answerExplanation",
                "answer_explanation",
                "solution",
                "rationale"
            ]
        );


    if (explanation) {

        const explanationContainer =
            document.createElement("div");

        explanationContainer.className =
            "mcq-explanation";


        const label =
            document.createElement("strong");

        label.textContent =
            "Explanation";


        const paragraph =
            document.createElement("p");

        paragraph.textContent =
            normalizeText(
                explanation
            );


        explanationContainer.appendChild(
            label
        );

        explanationContainer.appendChild(
            paragraph
        );


        panel.appendChild(
            explanationContainer
        );
    }
}


/* ============================================================
   RAW JSON FALLBACK
   ============================================================ */

function renderRawLesson(
    lesson
) {

    const card =
        document.createElement("article");

    card.className =
        "lesson-section";


    const title =
        document.createElement("h3");

    title.textContent =
        "Today's Lesson";


    const paragraph =
        document.createElement("p");

    paragraph.textContent =
        JSON.stringify(
            lesson,
            null,
            2
        );


    card.appendChild(
        title
    );

    card.appendChild(
        paragraph
    );


    return card;
}


/* ============================================================
   SELECTED DAY UI
   ============================================================ */

function updateSelectedDayUI(
    dayNumber
) {

    const buttons =
        dom.dayGrid.querySelectorAll(
            ".day-button"
        );


    buttons.forEach(
        button => {

            const value =
                Number(
                    button.dataset.day
                );


            button.classList.toggle(
                "selected",
                value === dayNumber
            );
        }
    );
}


/* ============================================================
   STATUS
   ============================================================ */

function updateStatus() {

    if (
        state.todayDayNumber <= 0
    ) {

        dom.todayBadgeText.textContent =
            "Starts at 6:00 AM";

        dom.releaseStatusText.textContent =
            "Today's lesson releases at 6:00 AM IST";

        dom.syllabusSummary.textContent =
            "Your first NEET lesson will unlock at 6:00 AM IST.";

        return;
    }


    dom.todayBadgeText.textContent =
        `Day ${state.todayDayNumber} Live`;


    dom.releaseStatusText.textContent =
        `Day ${state.todayDayNumber} is live`;


    dom.syllabusSummary.textContent =
        `${state.todayDayNumber} of ${state.totalDays} days released`;
}


/* ============================================================
   PRE-RELEASE STATE
   ============================================================ */

function showPreReleaseState() {

    hideLoading();

    dom.lessonContainer.innerHTML = "";


    const card =
        document.createElement("article");

    card.className =
        "lesson-introduction";


    const label =
        document.createElement("div");

    label.className =
        "lesson-card-label";

    label.textContent =
        "Course Starts Today";


    const paragraph =
        document.createElement("p");

    paragraph.textContent =
        "Your Day 1 lesson will become available automatically at 6:00 AM IST.";


    card.appendChild(
        label
    );

    card.appendChild(
        paragraph
    );


    dom.lessonContainer.appendChild(
        card
    );
}


/* ============================================================
   LOADING STATE
   ============================================================ */

function showLoading() {

    if (dom.loadingState) {
        dom.loadingState.style.display =
            "flex";
    }

    if (dom.errorState) {
        dom.errorState.classList.add(
            "hidden"
        );
    }
}


function hideLoading() {

    if (dom.loadingState) {
        dom.loadingState.style.display =
            "none";
    }
}


/* ============================================================
   ERROR STATE
   ============================================================ */

function showError(
    message
) {

    hideLoading();

    dom.lessonContainer.innerHTML = "";


    if (dom.errorMessage) {

        dom.errorMessage.textContent =
            message;
    }


    if (dom.errorState) {

        dom.errorState.classList.remove(
            "hidden"
        );
    }
}


/* ============================================================
   RETRY
   ============================================================ */

function retryCurrentLesson() {

    const day =
        state.selectedDay ||
        state.todayDayNumber;


    if (
        day >= 1 &&
        day <= state.todayDayNumber
    ) {

        loadDay(
            day,
            false
        );

    } else {

        initialize();
    }
}


/* ============================================================
   SCROLL
   ============================================================ */

function scrollToLessonContainer() {

    if (
        !dom.lessonContainer
    ) {
        return;
    }


    setTimeout(
        () => {

            dom.lessonContainer.scrollIntoView(
                {
                    behavior: "smooth",
                    block: "start"
                }
            );

        },
        50
    );
}


/* ============================================================
   DATE DISPLAY
   ============================================================ */

function formatDayDate(
    dayNumber
) {

    const utcTimestamp =
        istCalendarToUTC(
            state.startDate.year,
            state.startDate.month,
            state.startDate.day
        ) +
        (
            dayNumber - 1
        ) *
        86400000;


    const date =
        new Date(
            utcTimestamp
        );


    return new Intl.DateTimeFormat(
        "en-IN",
        {
            timeZone:
                "Asia/Kolkata",

            day:
                "numeric",

            month:
                "long",

            year:
                "numeric"
        }
    ).format(date);
}


/* ============================================================
   GENERIC JSON HELPERS
   ============================================================ */

function getFirstValue(
    object,
    keys
) {

    if (
        !object ||
        typeof object !== "object"
    ) {

        return null;
    }


    for (
        const key of keys
    ) {

        if (
            Object.prototype.hasOwnProperty.call(
                object,
                key
            )
        ) {

            const value =
                object[key];


            if (
                value !== null &&
                value !== undefined &&
                value !== ""
            ) {

                return value;
            }
        }
    }


    return null;
}


function getArrayValue(
    object,
    keys
) {

    const value =
        getFirstValue(
            object,
            keys
        );


    return Array.isArray(value)
        ? value
        : [];
}


function getObjectText(
    object,
    keys,
    fallback = ""
) {

    const value =
        getFirstValue(
            object,
            keys
        );


    if (
        value === null ||
        value === undefined
    ) {

        return fallback;
    }


    return normalizeText(
        value
    );
}


/* ============================================================
   TEXT NORMALIZATION
   ============================================================ */

function normalizeText(
    value
) {

    if (
        value === null ||
        value === undefined
    ) {

        return "";
    }


    if (
        typeof value === "string"
    ) {

        return value.trim();
    }


    if (
        typeof value === "number" ||
        typeof value === "boolean"
    ) {

        return String(value);
    }


    /*
     * If generated JSON contains a small structured
     * object where text is expected, try the common fields.
     */
    if (
        typeof value === "object"
    ) {

        const text =
            getFirstValue(
                value,
                [
                    "text",
                    "content",
                    "description",
                    "explanation",
                    "value"
                ]
            );


        if (text !== null) {

            return normalizeText(
                text
            );
        }


        return JSON.stringify(
            value
        );
    }


    return String(value);
}


function normalizeForComparison(
    value
) {

    return normalizeText(value)
        .toLowerCase()
        .replace(/\s+/g, " ")
        .trim();
}


/* ============================================================
   GLOBAL EVENTS
   ============================================================ */

function bindGlobalEvents() {

    /*
     * Retry.
     */
    if (dom.retryButton) {

        dom.retryButton.addEventListener(
            "click",
            retryCurrentLesson
        );
    }


    /*
     * PWA installation.
     */
    window.addEventListener(
        "beforeinstallprompt",
        event => {

            event.preventDefault();

            state.deferredInstallPrompt =
                event;

            if (dom.installButton) {

                dom.installButton.classList.remove(
                    "hidden"
                );
            }
        }
    );


    if (dom.installButton) {

        dom.installButton.addEventListener(
            "click",
            installPWA
        );
    }


    window.addEventListener(
        "appinstalled",
        () => {

            state.deferredInstallPrompt =
                null;

            if (dom.installButton) {

                dom.installButton.classList.add(
                    "hidden"
                );
            }
        }
    );


    /*
     * Recalculate release state when the browser
     * becomes visible again.
     *
     * This is important when the user leaves the app
     * open overnight and returns after 6:00 AM.
     */
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
   RELEASE REFRESH
   ============================================================ */

async function refreshReleaseState() {

    if (!state.config) {
        return;
    }


    const previousDay =
        state.todayDayNumber;


    calculateReleasedDay();


    if (
        previousDay !==
        state.todayDayNumber
    ) {

        renderDayGrid();

        updateStatus();


        /*
         * Automatically load the newly released day.
         */
        if (
            state.todayDayNumber >= 1
        ) {

            await loadDay(
                state.todayDayNumber,
                false
            );
        }
    }
}


/* ============================================================
   PWA INSTALL
   ============================================================ */

async function installPWA() {

    if (
        !state.deferredInstallPrompt
    ) {

        return;
    }


    state.deferredInstallPrompt.prompt();


    try {

        await state.deferredInstallPrompt.userChoice;

    } catch (error) {

        console.warn(
            "[Vidhwaan NEET] Install prompt error:",
            error
        );
    }


    state.deferredInstallPrompt =
        null;


    if (dom.installButton) {

        dom.installButton.classList.add(
            "hidden"
        );
    }
}


/* ============================================================
   OPTIONAL MIDNIGHT / 6 AM CHECK
   ============================================================ */

/*
 * Check periodically so an already-open page updates
 * when a new day becomes available.
 *
 * This does NOT load syllabus.json.
 *
 * It only recalculates the calendar release number.
 */
setInterval(
    () => {

        refreshReleaseState();

    },
    60 * 1000
);


/* ============================================================
   SERVICE WORKER
   ============================================================ */

if (
    "serviceWorker" in navigator
) {

    window.addEventListener(
        "load",
        () => {

            navigator.serviceWorker
                .register(
                    "./sw.js"
                )
                .then(
                    registration => {

                        console.log(
                            "[Vidhwaan NEET] Service worker registered:",
                            registration.scope
                        );
                    }
                )
                .catch(
                    error => {

                        console.warn(
                            "[Vidhwaan NEET] Service worker registration failed:",
                            error
                        );
                    }
                );
        }
    );
}

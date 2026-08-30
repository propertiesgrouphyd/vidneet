/* ============================================================
   VIDHWAAN NEET
   365-DAY DAILY LEARNING ENGINE
   ============================================================

   PRODUCTION RULE

   30 August 2026 06:00 IST  -> Day 1
   31 August 2026 06:00 IST  -> Day 2
   01 September 2026 06:00 IST -> Day 3
   ...
   29 August 2027 06:00 IST -> Day 365

   DAILY CONTENT

   Day 1  -> day-001.json
   Day 2  -> day-002.json
   Day 3  -> day-003.json
   ...
   Day 365 -> day-365.json

   IMPORTANT

   - NEVER loads syllabus.json
   - NEVER requires day.html
   - Loads daily JSON directly
   - Future days stay locked
   - Released days become clickable
   - Today's released day is automatically loaded
   - MCQs are fully interactive
   - Correct answer = green
   - Wrong answer = red
   - Correct answer + explanation are revealed
   - Uses Asia/Kolkata release time
   ============================================================ */

"use strict";


/* ============================================================
   CONFIG
   ============================================================ */

const CONFIG_PATH = "./data/app-config.json";

const DEFAULT_CONFIG = {
    totalDays: 365,
    programStartDateIST: "2026-08-30",
    dailyActivationHourIST: 6,
    contentDirectory: "data/days",
    timezone: "Asia/Kolkata"
};


/* ============================================================
   APP STATE
   ============================================================ */

const state = {

    config: null,

    totalDays: 365,

    startDate: null,

    activationHour: 6,

    contentDirectory: "data/days",

    releasedDay: 0,

    selectedDay: null,

    currentLesson: null,

    loading: false,

    mcqAnswered: new Set(),

    installPrompt: null
};


/* ============================================================
   DOM
   ============================================================ */

const dom = {

    dayGrid: null,

    lessonView: null,

    lessonContainer: null,

    loadingState: null,

    errorState: null,

    errorMessage: null,

    retryButton: null,

    releaseStatusText: null,

    todayBadgeText: null,

    syllabusSummary: null,

    installButton: null
};


/* ============================================================
   INITIALIZE DOM REFERENCES
   ============================================================ */

function cacheDOM() {

    dom.dayGrid =
        document.getElementById("day-grid");

    dom.lessonView =
        document.getElementById("lesson-view");

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

    dom.todayBadgeText =
        document.getElementById("today-badge-text");

    dom.syllabusSummary =
        document.getElementById("syllabus-summary");

    dom.installButton =
        document.getElementById("install-button");
}


/* ============================================================
   START APPLICATION
   ============================================================ */

document.addEventListener(
    "DOMContentLoaded",
    startApplication
);


async function startApplication() {

    cacheDOM();

    bindEvents();

    showLoading();

    try {

        state.config =
            await loadConfiguration();

        applyConfiguration();

        calculateReleasedDay();

        renderDayGrid();

        updateReleaseUI();

        hideError();

        /*
         * IMPORTANT:
         *
         * If Day 1 is released, automatically show
         * Day 1 content.
         *
         * Before 06:00 on 30 Aug:
         * releasedDay = 0.
         */
        if (
            state.releasedDay >= 1
        ) {

            await loadDay(
                state.releasedDay,
                false
            );

        } else {

            showBeforeRelease();

        }

    } catch (error) {

        console.error(
            "[VIDHWAAN NEET] Startup error:",
            error
        );

        showError(
            "The application could not start. Please refresh the page."
        );
    }
}


/* ============================================================
   LOAD CONFIGURATION
   ============================================================ */

async function loadConfiguration() {

    try {

        const response =
            await fetch(
                `${CONFIG_PATH}?v=${Date.now()}`,
                {
                    cache: "no-store"
                }
            );

        if (!response.ok) {

            throw new Error(
                `Configuration HTTP ${response.status}`
            );
        }

        const config =
            await response.json();

        return {
            ...DEFAULT_CONFIG,
            ...config
        };

    } catch (error) {

        console.warn(
            "[VIDHWAAN NEET] app-config.json could not be loaded.",
            "Using safe production defaults.",
            error
        );

        return {
            ...DEFAULT_CONFIG
        };
    }
}


/* ============================================================
   APPLY CONFIGURATION
   ============================================================ */

function applyConfiguration() {

    state.totalDays =
        toPositiveInteger(
            state.config.totalDays,
            365
        );

    state.activationHour =
        toInteger(
            state.config.dailyActivationHourIST,
            6
        );

    state.activationHour =
        Math.max(
            0,
            Math.min(
                23,
                state.activationHour
            )
        );

    state.contentDirectory =
        normalizeDirectory(
            state.config.contentDirectory ||
            "data/days"
        );

    const startDate =
        state.config.programStartDateIST ||
        "2026-08-30";

    state.startDate =
        parseDateOnly(
            startDate
        );

    if (!state.startDate) {

        throw new Error(
            "Invalid programStartDateIST."
        );
    }
}


/* ============================================================
   INTEGER HELPERS
   ============================================================ */

function toInteger(
    value,
    fallback
) {

    const number =
        Number(value);

    return Number.isFinite(number)
        ? Math.trunc(number)
        : fallback;
}


function toPositiveInteger(
    value,
    fallback
) {

    const number =
        toInteger(
            value,
            fallback
        );

    return number > 0
        ? number
        : fallback;
}


/* ============================================================
   DIRECTORY NORMALIZATION
   ============================================================ */

function normalizeDirectory(
    value
) {

    return String(value)
        .trim()
        .replace(/^\.\/+/, "")
        .replace(/\/+$/, "");
}


/* ============================================================
   DATE-ONLY PARSER
   ============================================================ */

function parseDateOnly(
    value
) {

    const match =
        String(value).match(
            /^(\d{4})-(\d{2})-(\d{2})$/
        );

    if (!match) {
        return null;
    }

    return {

        year:
            Number(match[1]),

        month:
            Number(match[2]),

        day:
            Number(match[3])
    };
}


/* ============================================================
   CURRENT IST TIME
   ============================================================ */

function getCurrentIST() {

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
        formatter.formatToParts(
            new Date()
        );

    const result = {};

    for (
        const part of parts
    ) {

        if (
            part.type !== "literal"
        ) {

            result[part.type] =
                Number(part.value);
        }
    }

    return result;
}


/* ============================================================
   DATE TO UTC
   ============================================================ */

function istDateToUTC(
    year,
    month,
    day,
    hour = 0,
    minute = 0,
    second = 0
) {

    /*
     * IST = UTC + 05:30
     *
     * Therefore:
     *
     * UTC = IST - 05:30
     */

    return Date.UTC(
        year,
        month - 1,
        day,
        hour - 5,
        minute - 30,
        second
    );
}


/* ============================================================
   CALENDAR DAY DIFFERENCE
   ============================================================ */

function calendarDayDifference(
    start,
    current
) {

    const startUTC =
        istDateToUTC(
            start.year,
            start.month,
            start.day
        );

    const currentUTC =
        istDateToUTC(
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
   CALCULATE RELEASED DAY
   ============================================================ */

function calculateReleasedDay() {

    const now =
        getCurrentIST();

    const daysSinceStart =
        calendarDayDifference(
            state.startDate,
            now
        );


    /*
     * Before course start date.
     */

    if (
        daysSinceStart < 0
    ) {

        state.releasedDay = 0;

        return;
    }


    /*
     * On the first course day,
     * Day 1 does not exist until 06:00 IST.
     */

    if (
        daysSinceStart === 0 &&
        now.hour < state.activationHour
    ) {

        state.releasedDay = 0;

        return;
    }


    /*
     * Every subsequent calendar day
     * releases one additional lesson.
     */

    const dayNumber =
        daysSinceStart + 1;


    state.releasedDay =
        Math.max(
            0,
            Math.min(
                dayNumber,
                state.totalDays
            )
        );
}


/* ============================================================
   RENDER 365 DAY CIRCLES
   ============================================================ */

function renderDayGrid() {

    if (!dom.dayGrid) {
        return;
    }

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


        const number =
            document.createElement("span");

        number.className =
            "day-number";

        number.textContent =
            String(day);


        button.appendChild(
            number
        );


        /*
         * FUTURE DAY
         */

        if (
            day >
            state.releasedDay
        ) {

            button.classList.add(
                "locked"
            );

            button.disabled =
                true;

            button.setAttribute(
                "aria-disabled",
                "true"
            );

        }


        /*
         * RELEASED DAY
         */

        else {

            button.classList.add(
                "available"
            );

            button.addEventListener(
                "click",
                function () {

                    loadDay(
                        day,
                        true
                    );

                }
            );
        }


        /*
         * CURRENT LIVE DAY
         */

        if (
            day ===
            state.releasedDay
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
   DAILY JSON FILE PATH
   ============================================================ */

function getPrimaryDayPath(
    dayNumber
) {

    const filename =
        `day-${String(dayNumber).padStart(3, "0")}.json`;

    return `${state.contentDirectory}/${filename}`;
}


/* ============================================================
   LOAD DAY JSON
   ============================================================ */

async function loadDay(
    dayNumber,
    scrollToLesson = true
) {

    /*
     * Never permit a future day to load.
     */

    if (
        dayNumber < 1 ||
        dayNumber >
        state.releasedDay
    ) {

        return;
    }


    /*
     * If same lesson is already visible,
     * simply scroll to it.
     */

    if (
        state.selectedDay === dayNumber &&
        state.currentLesson
    ) {

        if (scrollToLesson) {
            scrollToLessonView();
        }

        return;
    }


    state.loading = true;

    state.selectedDay =
        dayNumber;

    state.currentLesson =
        null;

    state.mcqAnswered.clear();


    showLoading();

    hideError();


    try {

        const lesson =
            await fetchDayJSON(
                dayNumber
            );


        validateLesson(
            lesson,
            dayNumber
        );


        state.currentLesson =
            lesson;


        renderLesson(
            lesson,
            dayNumber
        );


        updateSelectedDay(
            dayNumber
        );


        hideLoading();

        showLessonView();


        if (scrollToLesson) {

            scrollToLessonView();
        }


    } catch (error) {

        console.error(
            `[VIDHWAAN NEET] Day ${dayNumber} load failed:`,
            error
        );

        state.currentLesson =
            null;

        showError(
            `Day ${String(dayNumber).padStart(3, "0")} could not be loaded. Please check that the daily JSON file exists.`
        );

    } finally {

        state.loading = false;
    }
}


/* ============================================================
   FETCH DAILY JSON
   ============================================================ */

async function fetchDayJSON(
    dayNumber
) {

    const primaryPath =
        getPrimaryDayPath(
            dayNumber
        );


    /*
     * PRIMARY PATH
     *
     * app-config.json currently points to:
     *
     * data/days
     */

    try {

        const response =
            await fetch(
                `${primaryPath}?v=${getCacheVersion()}`,
                {
                    cache: "no-store"
                }
            );

        if (response.ok) {

            return await response.json();
        }

        console.warn(
            `[VIDHWAAN NEET] Primary daily path failed: ${primaryPath}`
        );

    } catch (error) {

        console.warn(
            `[VIDHWAAN NEET] Primary daily request failed: ${primaryPath}`,
            error
        );
    }


    /*
     * FALLBACK PATH
     *
     * This protects the deployment if the files are stored
     * directly under data/ instead of data/days/.
     *
     * Example:
     *
     * data/day-001.json
     */

    const fallbackPath =
        `data/day-${String(dayNumber).padStart(3, "0")}.json`;


    /*
     * Do not request the same URL twice.
     */

    if (
        fallbackPath ===
        primaryPath
    ) {

        throw new Error(
            `Daily JSON unavailable: ${primaryPath}`
        );
    }


    const fallbackResponse =
        await fetch(
            `${fallbackPath}?v=${getCacheVersion()}`,
            {
                cache: "no-store"
            }
        );


    if (
        !fallbackResponse.ok
    ) {

        throw new Error(
            `Daily JSON unavailable: ${primaryPath} and ${fallbackPath}`
        );
    }


    return await fallbackResponse.json();
}


/* ============================================================
   VALIDATE LESSON
   ============================================================ */

function validateLesson(
    lesson,
    dayNumber
) {

    if (
        !lesson ||
        typeof lesson !== "object" ||
        Array.isArray(lesson)
    ) {

        throw new Error(
            "Daily JSON is not a valid object."
        );
    }


    /*
     * The uploaded Day JSON has a day field.
     *
     * We do not reject content if a generator omits it,
     * but if it exists it must agree with the requested day.
     */

    if (
        lesson.day !== undefined &&
        Number(lesson.day) !== dayNumber
    ) {

        throw new Error(
            `Daily JSON day mismatch. Requested Day ${dayNumber}, received Day ${lesson.day}.`
        );
    }


    /*
     * A proper lesson should have at least one of:
     *
     * title
     * sections
     * mcqs
     * introduction
     */

    const hasContent =
        Boolean(
            lesson.title ||
            lesson.introduction ||
            Array.isArray(lesson.sections) ||
            Array.isArray(lesson.mcqs)
        );


    if (!hasContent) {

        throw new Error(
            "Daily JSON contains no recognizable lesson content."
        );
    }
}


/* ============================================================
   RENDER LESSON
   ============================================================ */

function renderLesson(
    lesson,
    dayNumber
) {

    if (!dom.lessonContainer) {
        return;
    }


    dom.lessonContainer.innerHTML = "";


    const fragment =
        document.createDocumentFragment();


    /*
     * LESSON HERO
     */

    fragment.appendChild(
        renderLessonHeader(
            lesson,
            dayNumber
        )
    );


    /*
     * INTRODUCTION
     */

    if (
        lesson.introduction
    ) {

        fragment.appendChild(
            renderIntroduction(
                lesson.introduction
            )
        );
    }


    /*
     * NEET FOCUS
     */

    const neetFocus =
        Array.isArray(
            lesson.neetFocus
        )
            ? lesson.neetFocus
            : [];


    if (
        neetFocus.length > 0
    ) {

        fragment.appendChild(
            renderFocusCard(
                neetFocus
            );
        );
    }


    /*
     * LEARNING OUTCOMES
     */

    const learningOutcome =
        Array.isArray(
            lesson.learningOutcome
        )
            ? lesson.learningOutcome
            : [];


    if (
        learningOutcome.length > 0
    ) {

        fragment.appendChild(
            renderLearningOutcome(
                learningOutcome
            )
        );
    }


    /*
     * SECTIONS
     */

    const sections =
        Array.isArray(
            lesson.sections
        )
            ? lesson.sections
            : [];


    if (
        sections.length > 0
    ) {

        const sectionsWrapper =
            document.createElement("div");

        sectionsWrapper.className =
            "lesson-sections";


        sections.forEach(
            (
                section,
                index
            ) => {

                sectionsWrapper.appendChild(
                    renderSection(
                        section,
                        index + 1
                    )
                );

            }
        );


        fragment.appendChild(
            sectionsWrapper
        );
    }


    /*
     * MCQS
     */

    const mcqs =
        getMCQs(
            lesson
        );


    if (
        mcqs.length > 0
    ) {

        fragment.appendChild(
            renderMCQSection(
                mcqs
            )
        );
    }


    /*
     * FALLBACK CONTENT
     */

    if (
        sections.length === 0 &&
        mcqs.length === 0 &&
        !lesson.introduction &&
        neetFocus.length === 0 &&
        learningOutcome.length === 0
    ) {

        fragment.appendChild(
            renderFallbackContent(
                lesson
            )
        );
    }


    dom.lessonContainer.appendChild(
        fragment
    );
}


/* ============================================================
   LESSON HEADER
   ============================================================ */

function renderLessonHeader(
    lesson,
    dayNumber
) {

    const card =
        document.createElement("article");

    card.className =
        "lesson-hero";


    const badge =
        document.createElement("div");

    badge.className =
        "lesson-day-badge";

    badge.textContent =
        `DAY ${String(dayNumber).padStart(3, "0")}`;


    const title =
        document.createElement("h2");

    title.id =
        "lesson-page-title";

    title.textContent =
        cleanText(
            lesson.title ||
            `NEET Preparation — Day ${dayNumber}`
        );


    const meta =
        document.createElement("div");

    meta.className =
        "lesson-meta";


    const subject =
        lesson.subject ||
        "NEET Preparation";


    const chapter =
        lesson.chapter ||
        "";


    meta.textContent =
        chapter
            ? `${subject} • ${chapter}`
            : subject;


    const date =
        document.createElement("div");

    date.className =
        "lesson-date";

    date.textContent =
        formatCourseDate(
            dayNumber
        );


    card.appendChild(
        badge
    );

    card.appendChild(
        title
    );

    card.appendChild(
        meta
    );

    card.appendChild(
        date
    );


    return card;
}


/* ============================================================
   INTRODUCTION
   ============================================================ */

function renderIntroduction(
    introduction
) {

    const card =
        document.createElement("article");

    card.className =
        "lesson-introduction";


    const label =
        document.createElement("div");

    label.className =
        "lesson-card-label";

    label.textContent =
        "Today's Lesson";


    const paragraph =
        document.createElement("p");

    paragraph.textContent =
        cleanText(
            introduction
        );


    card.appendChild(
        label
    );

    card.appendChild(
        paragraph
    );


    return card;
}


/* ============================================================
   NEET FOCUS
   ============================================================ */

function renderFocusCard(
    focus
) {

    const card =
        document.createElement("article");

    card.className =
        "lesson-focus";


    const title =
        document.createElement("h3");

    title.textContent =
        "NEET Focus";


    const list =
        document.createElement("ul");


    focus.forEach(
        item => {

            const li =
                document.createElement("li");

            li.textContent =
                cleanText(
                    item
                );

            list.appendChild(
                li
            );
        }
    );


    card.appendChild(
        title
    );

    card.appendChild(
        list
    );


    return card;
}


/* ============================================================
   LEARNING OUTCOME
   ============================================================ */

function renderLearningOutcome(
    outcomes
) {

    const card =
        document.createElement("article");

    card.className =
        "learning-outcomes";


    const title =
        document.createElement("h3");

    title.textContent =
        "By the End of Today";


    const list =
        document.createElement("ul");


    outcomes.forEach(
        outcome => {

            const li =
                document.createElement("li");

            li.textContent =
                cleanText(
                    outcome
                );

            list.appendChild(
                li
            );
        }
    );


    card.appendChild(
        title
    );

    card.appendChild(
        list
    );


    return card;
}


/* ============================================================
   SECTION RENDERER
   ============================================================ */

function renderSection(
    section,
    index
) {

    const card =
        document.createElement("article");

    card.className =
        "lesson-section";


    const top =
        document.createElement("div");

    top.className =
        "lesson-section-top";


    const number =
        document.createElement("span");

    number.className =
        "lesson-section-number";

    number.textContent =
        String(index).padStart(2, "0");


    const topic =
        document.createElement("span");

    topic.className =
        "lesson-section-topic";

    topic.textContent =
        cleanText(
            section.topic ||
            `Topic ${index}`
        );


    top.appendChild(
        number
    );

    top.appendChild(
        topic
    );


    const heading =
        document.createElement("h3");

    heading.textContent =
        cleanText(
            section.heading ||
            section.topic ||
            `Concept ${index}`
        );


    card.appendChild(
        top
    );

    card.appendChild(
        heading
    );


    /*
     * Main explanation.
     */

    if (
        section.content
    ) {

        const paragraph =
            document.createElement("p");

        paragraph.className =
            "lesson-content";

        paragraph.textContent =
            cleanText(
                section.content
            );

        card.appendChild(
            paragraph
        );
    }


    /*
     * Subsections.
     */

    const subsections =
        Array.isArray(
            section.subsections
        )
            ? section.subsections
            : [];


    if (
        subsections.length > 0
    ) {

        const subWrapper =
            document.createElement("div");

        subWrapper.className =
            "lesson-subsections";


        subsections.forEach(
            subsection => {

                const sub =
                    document.createElement("div");

                sub.className =
                    "lesson-subsection";


                const subHeading =
                    document.createElement("h4");

                subHeading.textContent =
                    cleanText(
                        subsection.heading ||
                        subsection.title ||
                        ""
                    );


                const subContent =
                    document.createElement("p");

                subContent.textContent =
                    cleanText(
                        subsection.content ||
                        subsection.explanation ||
                        ""
                    );


                if (
                    subHeading.textContent
                ) {

                    sub.appendChild(
                        subHeading
                    );
                }


                if (
                    subContent.textContent
                ) {

                    sub.appendChild(
                        subContent
                    );
                }


                subWrapper.appendChild(
                    sub
                );
            }
        );


        card.appendChild(
            subWrapper
        );
    }


    /*
     * Key points.
     */

    const keyPoints =
        Array.isArray(
            section.keyPoints
        )
            ? section.keyPoints
            : [];


    if (
        keyPoints.length > 0
    ) {

        const keyBlock =
            document.createElement("div");

        keyBlock.className =
            "key-points";


        const title =
            document.createElement("h4");

        title.textContent =
            "Key Points";


        const list =
            document.createElement("ul");


        keyPoints.forEach(
            point => {

                const li =
                    document.createElement("li");

                li.textContent =
                    cleanText(
                        point
                    );

                list.appendChild(
                    li
                );
            }
        );


        keyBlock.appendChild(
            title
        );

        keyBlock.appendChild(
            list
        );


        card.appendChild(
            keyBlock
        );
    }


    /*
     * NEET Tips.
     *
     * The actual uploaded JSON uses:
     *
     * "neetTips": [...]
     */

    const neetTips =
        Array.isArray(
            section.neetTips
        )
            ? section.neetTips
            : [];


    if (
        neetTips.length > 0
    ) {

        const tips =
            document.createElement("div");

        tips.className =
            "neet-tips";


        const title =
            document.createElement("h4");

        title.textContent =
            "NEET Tip";


        tips.appendChild(
            title
        );


        neetTips.forEach(
            tip => {

                const paragraph =
                    document.createElement("p");

                paragraph.textContent =
                    cleanText(
                        tip
                    );

                tips.appendChild(
                    paragraph
                );
            }
        );


        card.appendChild(
            tips
        );
    }


    return card;
}


/* ============================================================
   MCQ EXTRACTION
   ============================================================ */

function getMCQs(
    lesson
) {

    const candidates = [

        lesson.mcqs,

        lesson.MCQs,

        lesson.questions,

        lesson.quiz,

        lesson.practiceQuestions,

        lesson.practice_questions
    ];


    for (
        const candidate of candidates
    ) {

        if (
            Array.isArray(candidate)
        ) {

            return candidate;
        }
    }


    return [];
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
        `${mcqs.length} NEET-level questions. Select an option to reveal the answer and explanation.`;


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
        (
            mcq,
            index
        ) => {

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

    card.dataset.question =
        String(index);


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
        cleanText(
            mcq.question ||
            mcq.questionText ||
            mcq.prompt ||
            mcq.text ||
            "Question"
        );


    const options =
        normalizeMCQOptions(
            mcq.options ||
            mcq.choices ||
            mcq.answers ||
            []
        );


    const optionsWrapper =
        document.createElement("div");

    optionsWrapper.className =
        "mcq-options";


    const answerPanel =
        document.createElement("div");

    answerPanel.className =
        "mcq-answer-panel";

    answerPanel.hidden =
        true;


    options.forEach(
        (
            option,
            optionIndex
        ) => {

            optionsWrapper.appendChild(
                createMCQOptionButton(
                    mcq,
                    option,
                    optionIndex,
                    options,
                    card,
                    answerPanel
                )
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
        optionsWrapper
    );

    card.appendChild(
        answerPanel
    );


    return card;
}


/* ============================================================
   NORMALIZE MCQ OPTIONS
   ============================================================ */

function normalizeMCQOptions(
    options
) {

    if (
        !Array.isArray(options)
    ) {

        return [];
    }


    return options.map(
        (
            option,
            index
        ) => {

            if (
                typeof option === "string" ||
                typeof option === "number"
            ) {

                return {

                    text:
                        String(option),

                    index:
                        index,

                    isCorrect:
                        false
                };
            }


            if (
                option &&
                typeof option === "object"
            ) {

                return {

                    text:
                        cleanText(
                            option.text ||
                            option.label ||
                            option.answer ||
                            option.option ||
                            ""
                        ),

                    index:
                        index,

                    isCorrect:
                        option.isCorrect === true ||
                        option.correct === true
                };
            }


            return {

                text: "",

                index,

                isCorrect: false
            };
        }
    );
}


/* ============================================================
   CREATE MCQ OPTION
   ============================================================ */

function createMCQOptionButton(
    mcq,
    option,
    optionIndex,
    options,
    card,
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
        function () {

            answerMCQ(
                mcq,
                optionIndex,
                options,
                card,
                answerPanel
            );

        }
    );


    return button;
}


/* ============================================================
   ANSWER MCQ
   ============================================================ */

function answerMCQ(
    mcq,
    selectedIndex,
    options,
    card,
    answerPanel
) {

    /*
     * Do not allow changing an answered question.
     */

    if (
        card.dataset.answered ===
        "true"
    ) {

        return;
    }


    const correctIndex =
        findCorrectAnswer(
            mcq,
            options
        );


    const isCorrect =
        selectedIndex ===
        correctIndex;


    card.dataset.answered =
        "true";


    state.mcqAnswered.add(
        card.dataset.question
    );


    const buttons =
        Array.from(
            card.querySelectorAll(
                ".mcq-option"
            )
        );


    /*
     * Disable all options.
     */

    buttons.forEach(
        button => {

            button.disabled =
                true;
        }
    );


    /*
     * SELECTED ANSWER
     */

    if (
        buttons[selectedIndex]
    ) {

        buttons[
            selectedIndex
        ].classList.add(
            isCorrect
                ? "correct"
                : "wrong"
        );
    }


    /*
     * IF WRONG:
     *
     * show the actual correct option in green.
     */

    if (
        !isCorrect &&
        correctIndex >= 0 &&
        buttons[correctIndex]
    ) {

        buttons[
            correctIndex
        ].classList.add(
            "correct"
        );
    }


    /*
     * ANSWER PANEL
     */

    renderMCQAnswer(
        answerPanel,
        mcq,
        options,
        correctIndex,
        isCorrect
    );


    /*
     * Make the result visible smoothly.
     */

    requestAnimationFrame(
        function () {

            answerPanel.scrollIntoView(
                {
                    behavior: "smooth",
                    block: "nearest"
                }
            );

        }
    );
}


/* ============================================================
   FIND CORRECT MCQ ANSWER
   ============================================================ */

function findCorrectAnswer(
    mcq,
    options
) {

    /*
     * FIRST:
     *
     * Explicit isCorrect flag on options.
     */

    const explicit =
        options.findIndex(
            option =>
                option.isCorrect === true
        );


    if (
        explicit >= 0
    ) {

        return explicit;
    }


    /*
     * ACTUAL UPLOADED DAY JSON FORMAT:
     *
     * "answer": 0
     *
     * This is zero-based.
     *
     * 0 = A
     * 1 = B
     * 2 = C
     * 3 = D
     */

    if (
        typeof mcq.answer ===
        "number"
    ) {

        if (
            mcq.answer >= 0 &&
            mcq.answer < options.length
        ) {

            return mcq.answer;
        }
    }


    /*
     * Other common formats.
     */

    const raw =
        mcq.correctAnswer !== undefined
            ? mcq.correctAnswer
            : mcq.correct_answer !== undefined
                ? mcq.correct_answer
                : mcq.correctOption !== undefined
                    ? mcq.correctOption
                    : mcq.correct_option !== undefined
                        ? mcq.correct_option
                        : mcq.correctIndex !== undefined
                            ? mcq.correctIndex
                            : mcq.correct_index !== undefined
                                ? mcq.correct_index
                                : undefined;


    if (
        raw === undefined ||
        raw === null
    ) {

        return -1;
    }


    /*
     * Number.
     */

    if (
        typeof raw === "number"
    ) {

        if (
            raw >= 0 &&
            raw < options.length
        ) {

            return raw;
        }


        if (
            raw >= 1 &&
            raw <= options.length
        ) {

            return raw - 1;
        }
    }


    const value =
        String(raw)
            .trim();


    /*
     * A / B / C / D
     */

    if (
        /^[A-Za-z]$/.test(
            value
        )
    ) {

        const index =
            value
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
        /^\d+$/.test(value)
    ) {

        const number =
            Number(value);


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
     * Text match.
     */

    const normalized =
        normalizeComparison(
            value
        );


    const textIndex =
        options.findIndex(
            option =>
                normalizeComparison(
                    option.text
                ) === normalized
        );


    return textIndex;
}


/* ============================================================
   RENDER MCQ ANSWER
   ============================================================ */

function renderMCQAnswer(
    panel,
    mcq,
    options,
    correctIndex,
    isCorrect
) {

    panel.innerHTML = "";

    panel.hidden =
        false;


    panel.classList.toggle(
        "is-correct",
        isCorrect
    );

    panel.classList.toggle(
        "is-wrong",
        !isCorrect
    );


    /*
     * RESULT
     */

    const result =
        document.createElement("div");

    result.className =
        "mcq-result";

    result.textContent =
        isCorrect
            ? "✓ Correct! Excellent work."
            : "✕ Incorrect. Review the explanation below.";


    panel.appendChild(
        result
    );


    /*
     * CORRECT ANSWER
     */

    if (
        correctIndex >= 0 &&
        options[correctIndex]
    ) {

        const correct =
            document.createElement("div");

        correct.className =
            "mcq-correct-answer";


        const label =
            document.createElement("strong");

        label.textContent =
            "Correct Answer";


        const value =
            document.createElement("span");

        value.textContent =
            `${String.fromCharCode(65 + correctIndex)}. ${options[correctIndex].text}`;


        correct.appendChild(
            label
        );

        correct.appendChild(
            value
        );


        panel.appendChild(
            correct
        );
    }


    /*
     * EXPLANATION
     */

    if (
        mcq.explanation
    ) {

        const explanation =
            document.createElement("div");

        explanation.className =
            "mcq-explanation";


        const label =
            document.createElement("strong");

        label.textContent =
            "Explanation";


        const text =
            document.createElement("p");

        text.textContent =
            cleanText(
                mcq.explanation
            );


        explanation.appendChild(
            label
        );

        explanation.appendChild(
            text
        );


        panel.appendChild(
            explanation
        );
    }


    /*
     * TOPIC
     */

    if (
        mcq.topic
    ) {

        const topic =
            document.createElement("div");

        topic.className =
            "mcq-topic";

        topic.textContent =
            `Topic: ${cleanText(mcq.topic)}`;


        panel.appendChild(
            topic
        );
    }
}


/* ============================================================
   FALLBACK LESSON
   ============================================================ */

function renderFallbackContent(
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
        cleanText(
            lesson.content ||
            lesson.description ||
            "Lesson content is available."
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

function updateSelectedDay(
    dayNumber
) {

    if (!dom.dayGrid) {
        return;
    }


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
   RELEASE STATUS UI
   ============================================================ */

function updateReleaseUI() {

    if (
        dom.releaseStatusText
    ) {

        if (
            state.releasedDay === 0
        ) {

            dom.releaseStatusText.textContent =
                "Day 1 releases at 6:00 AM IST";

        } else {

            dom.releaseStatusText.textContent =
                `Day ${state.releasedDay} is live`;
        }
    }


    if (
        dom.todayBadgeText
    ) {

        if (
            state.releasedDay === 0
        ) {

            dom.todayBadgeText.textContent =
                "Starts at 6:00 AM";

        } else {

            dom.todayBadgeText.textContent =
                `Day ${state.releasedDay} Live`;
        }
    }


    if (
        dom.syllabusSummary
    ) {

        if (
            state.releasedDay === 0
        ) {

            dom.syllabusSummary.textContent =
                "Day 1 will unlock automatically at 6:00 AM IST.";

        } else {

            dom.syllabusSummary.textContent =
                `${state.releasedDay} of ${state.totalDays} days released`;
        }
    }
}


/* ============================================================
   BEFORE FIRST RELEASE
   ============================================================ */

function showBeforeRelease() {

    hideLoading();

    hideError();

    hideLessonView();


    if (
        !dom.lessonContainer
    ) {
        return;
    }


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
        "COURSE STARTS TODAY";


    const title =
        document.createElement("h3");

    title.textContent =
        "Your Day 1 lesson unlocks at 6:00 AM IST.";


    const paragraph =
        document.createElement("p");

    paragraph.textContent =
        "Come back after the daily release time and Day 1 will become available automatically.";


    card.appendChild(
        label
    );

    card.appendChild(
        title
    );

    card.appendChild(
        paragraph
    );


    dom.lessonContainer.appendChild(
        card
    );
}


/* ============================================================
   LESSON VIEW
   ============================================================ */

function showLessonView() {

    if (
        dom.lessonView
    ) {

        dom.lessonView.classList.remove(
            "hidden"
        );
    }
}


function hideLessonView() {

    if (
        dom.lessonView
    ) {

        dom.lessonView.classList.add(
            "hidden"
        );
    }
}


/* ============================================================
   LOADING
   ============================================================ */

function showLoading() {

    if (
        dom.loadingState
    ) {

        dom.loadingState.classList.remove(
            "hidden"
        );
    }
}


function hideLoading() {

    if (
        dom.loadingState
    ) {

        dom.loadingState.classList.add(
            "hidden"
        );
    }
}


/* ============================================================
   ERROR
   ============================================================ */

function showError(
    message
) {

    hideLoading();

    hideLessonView();


    if (
        dom.errorMessage
    ) {

        dom.errorMessage.textContent =
            message;
    }


    if (
        dom.errorState
    ) {

        dom.errorState.classList.remove(
            "hidden"
        );
    }
}


function hideError() {

    if (
        dom.errorState
    ) {

        dom.errorState.classList.add(
            "hidden"
        );
    }
}


/* ============================================================
   RETRY
   ============================================================ */

async function retryLesson() {

    calculateReleasedDay();

    renderDayGrid();

    updateReleaseUI();


    const day =
        state.selectedDay ||
        state.releasedDay;


    if (
        day >= 1 &&
        day <= state.releasedDay
    ) {

        await loadDay(
            day,
            false
        );

    } else {

        showBeforeRelease();
    }
}


/* ============================================================
   SCROLL TO LESSON
   ============================================================ */

function scrollToLessonView() {

    if (
        !dom.lessonView
    ) {
        return;
    }


    setTimeout(
        function () {

            dom.lessonView.scrollIntoView(
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
   COURSE DATE
   ============================================================ */

function formatCourseDate(
    dayNumber
) {

    const timestamp =
        istDateToUTC(
            state.startDate.year,
            state.startDate.month,
            state.startDate.day
        ) +
        (
            dayNumber - 1
        ) *
        86400000;


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
    ).format(
        new Date(timestamp)
    );
}


/* ============================================================
   CACHE VERSION
   ============================================================ */

function getCacheVersion() {

    const now =
        getCurrentIST();


    return [
        now.year,
        String(now.month).padStart(2, "0"),
        String(now.day).padStart(2, "0"),
        String(now.hour).padStart(2, "0"),
        String(now.minute).padStart(2, "0")
    ].join("");
}


/* ============================================================
   TEXT HELPERS
   ============================================================ */

function cleanText(
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


    if (
        typeof value === "object"
    ) {

        if (
            value.text !== undefined
        ) {

            return cleanText(
                value.text
            );
        }


        if (
            value.content !== undefined
        ) {

            return cleanText(
                value.content
            );
        }


        return JSON.stringify(
            value
        );
    }


    return String(value);
}


function normalizeComparison(
    value
) {

    return cleanText(
        value
    )
        .toLowerCase()
        .replace(
            /\s+/g,
            " "
        )
        .trim();
}


/* ============================================================
   GLOBAL EVENTS
   ============================================================ */

function bindEvents() {

    /*
     * Retry
     */

    if (
        dom.retryButton
    ) {

        dom.retryButton.addEventListener(
            "click",
            retryLesson
        );
    }


    /*
     * PWA install
     */

    window.addEventListener(
        "beforeinstallprompt",
        function (event) {

            event.preventDefault();

            state.installPrompt =
                event;


            if (
                dom.installButton
            ) {

                dom.installButton.classList.remove(
                    "hidden"
                );
            }
        }
    );


    if (
        dom.installButton
    ) {

        dom.installButton.addEventListener(
            "click",
            installApplication
        );
    }


    window.addEventListener(
        "appinstalled",
        function () {

            state.installPrompt =
                null;


            if (
                dom.installButton
            ) {

                dom.installButton.classList.add(
                    "hidden"
                );
            }
        }
    );


    /*
     * Recalculate when returning to the app.
     */

    document.addEventListener(
        "visibilitychange",
        function () {

            if (
                document.visibilityState ===
                "visible"
            ) {

                refreshReleaseState();
            }
        }
    );


    /*
     * Recalculate if the system clock/timezone changes.
     */

    window.addEventListener(
        "focus",
        function () {

            refreshReleaseState();
        }
    );
}


/* ============================================================
   RELEASE REFRESH
   ============================================================ */

async function refreshReleaseState() {

    if (
        !state.config
    ) {
        return;
    }


    const previous =
        state.releasedDay;


    calculateReleasedDay();


    if (
        previous !==
        state.releasedDay
    ) {

        renderDayGrid();

        updateReleaseUI();


        /*
         * A new daily lesson became live.
         *
         * Automatically load it.
         */

        if (
            state.releasedDay >= 1
        ) {

            await loadDay(
                state.releasedDay,
                false
            );
        }

    } else {

        /*
         * Keep status accurate even if no new day
         * has been released.
         */

        updateReleaseUI();
    }
}


/* ============================================================
   CHECK EVERY MINUTE
   ============================================================ */

setInterval(
    function () {

        refreshReleaseState();

    },
    60000
);


/* ============================================================
   PWA INSTALL
   ============================================================ */

async function installApplication() {

    if (
        !state.installPrompt
    ) {

        return;
    }


    try {

        state.installPrompt.prompt();

        await state.installPrompt.userChoice;

    } catch (error) {

        console.warn(
            "[VIDHWAAN NEET] PWA install prompt failed:",
            error
        );
    }


    state.installPrompt =
        null;


    if (
        dom.installButton
    ) {

        dom.installButton.classList.add(
            "hidden"
        );
    }
}


/* ============================================================
   SERVICE WORKER
   ============================================================ */

if (
    "serviceWorker" in navigator
) {

    window.addEventListener(
        "load",
        function () {

            navigator.serviceWorker
                .register(
                    "./sw.js"
                )
                .then(
                    registration => {

                        console.log(
                            "[VIDHWAAN NEET] Service worker registered:",
                            registration.scope
                        );
                    }
                )
                .catch(
                    error => {

                        console.warn(
                            "[VIDHWAAN NEET] Service worker registration failed:",
                            error
                        );
                    }
                );
        }
    );
}

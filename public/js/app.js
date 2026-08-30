/* ============================================================
   VIDHWAAN NEET
   PRODUCTION SINGLE-PAGE APPLICATION
   ============================================================

   ARCHITECTURE

   app-config.json
        ↓
   Determine current IST date/time
        ↓
   Determine released day
        ↓
   365 day circles
        ↓
   Click released day
        ↓
   data/days/day-XXX.json
        ↓
   Render lesson
        ↓
   Interactive MCQs

   RELEASE RULE

   Day 1  = 30 Aug 2026 at 06:00 IST
   Day 2  = 31 Aug 2026 at 06:00 IST
   Day 3  = 01 Sep 2026 at 06:00 IST
   ...
   Day 365 = 29 Aug 2027 at 06:00 IST

   IMPORTANT

   syllabus.json is NOT used.

   Daily lesson content comes directly from:

       data/days/day-001.json
       data/days/day-002.json
       ...
       data/days/day-365.json
   ============================================================ */


/* ============================================================
   CONFIG
   ============================================================ */

const CONFIG_URL = "./data/app-config.json";

const DEFAULT_START_DATE = "2026-08-30";
const DEFAULT_ACTIVATION_HOUR = 6;
const TOTAL_DAYS = 365;

const IST_TIMEZONE = "Asia/Kolkata";

const RELEASE_CHECK_INTERVAL = 30 * 1000;


/* ============================================================
   STATE
   ============================================================ */

let config = null;

let releasedDay = 0;

let selectedDay = null;

let selectedLesson = null;

let releaseTimer = null;

let loading = false;

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

const syllabusSummary =
    document.getElementById("syllabus-summary");

const todayBadgeText =
    document.getElementById("today-badge-text");

const releaseStatusText =
    document.getElementById("release-status-text");

const retryButton =
    document.getElementById("retry-button");

const installButton =
    document.getElementById("install-button");


/* ============================================================
   INITIALIZATION
   ============================================================ */

document.addEventListener(
    "DOMContentLoaded",
    initialize
);


async function initialize() {
    setupInstallPrompt();

    setupRetry();

    setupVisibilityRefresh();

    await loadApplication();

    startReleaseWatcher();
}


/* ============================================================
   IST TIME
   ============================================================ */

function getISTParts() {
    const formatter =
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
        );

    const parts =
        formatter.formatToParts(
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
        String(now.year)
            .padStart(4, "0"),

        String(now.month)
            .padStart(2, "0"),

        String(now.day)
            .padStart(2, "0")
    ].join("-");
}


function getISTMinutes() {
    const now =
        getISTParts();

    return (
        now.hour * 60 +
        now.minute
    );
}


/* ============================================================
   DATE HELPERS
   ============================================================ */

function parseDateOnly(
    dateString
) {
    const match =
        /^(\d{4})-(\d{2})-(\d{2})$/
            .exec(dateString);

    if (!match) {
        throw new Error(
            `Invalid date: ${dateString}`
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
        parseDateOnly(
            startDate
        );

    const end =
        parseDateOnly(
            endDate
        );

    return Math.floor(
        (
            end.getTime() -
            start.getTime()
        ) /
        86400000
    );
}


/* ============================================================
   CONFIGURATION
   ============================================================ */

async function loadConfig() {
    config =
        await fetchLiveJSON(
            CONFIG_URL
        );

    if (
        !config ||
        typeof config !== "object"
    ) {
        throw new Error(
            "Invalid app configuration."
        );
    }

    validateConfig();
}


function validateConfig() {
    const startDate =
        getCourseStartDate();

    parseDateOnly(
        startDate
    );

    const activationHour =
        getActivationHour();

    if (
        !Number.isInteger(
            activationHour
        ) ||
        activationHour < 0 ||
        activationHour > 23
    ) {
        throw new Error(
            "Invalid daily activation hour."
        );
    }

    const totalDays =
        Number(
            config.totalDays
        );

    if (
        Number.isFinite(totalDays) &&
        totalDays !== TOTAL_DAYS
    ) {
        throw new Error(
            `Configuration must contain ${TOTAL_DAYS} days.`
        );
    }
}


function getCourseStartDate() {
    return (
        config?.programStartDateIST ||
        config?.releaseStartDate ||
        config?.courseStartDate ||
        DEFAULT_START_DATE
    );
}


function getActivationHour() {
    const configured =
        Number(
            config?.dailyActivationHourIST
        );

    if (
        Number.isInteger(
            configured
        ) &&
        configured >= 0 &&
        configured <= 23
    ) {
        return configured;
    }

    return DEFAULT_ACTIVATION_HOUR;
}


function getContentDirectory() {
    return (
        config?.contentDirectory ||
        "data/days"
    )
        .replace(/^\/+/, "")
        .replace(/\/+$/, "");
}


/* ============================================================
   RELEASE CALCULATION
   ============================================================ */

function calculateReleasedDay() {
    const today =
        getISTDateString();

    const start =
        getCourseStartDate();

    const calendarOffset =
        daysBetween(
            start,
            today
        );

    const calendarDay =
        calendarOffset + 1;

    const activationMinutes =
        getActivationHour() * 60;

    const currentMinutes =
        getISTMinutes();

    let day;

    /*
       Before 06:00 IST:
       today's lesson is NOT released.

       Example:

       31 Aug 05:59
       calendar day = 2
       released day = 1
    */

    if (
        currentMinutes <
        activationMinutes
    ) {
        day =
            calendarDay - 1;
    } else {
        /*
           At 06:00 IST and after:

           31 Aug 06:00
           calendar day = 2
           released day = 2
        */

        day =
            calendarDay;
    }

    return Math.min(
        Math.max(
            day,
            0
        ),
        TOTAL_DAYS
    );
}


/* ============================================================
   DAILY JSON PATH
   ============================================================ */

function getDayURL(
    dayNumber
) {
    const padded =
        String(dayNumber)
            .padStart(3, "0");

    return (
        `./${getContentDirectory()}` +
        `/day-${padded}.json`
    );
}


/* ============================================================
   LIVE FETCH
   ============================================================ */

async function fetchLiveJSON(
    url
) {
    const separator =
        url.includes("?")
            ? "&"
            : "?";

    const liveURL =
        `${url}${separator}_=${Date.now()}`;

    const response =
        await fetch(
            liveURL,
            {
                method: "GET",

                cache: "no-store",

                credentials:
                    "same-origin",

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
            `Unable to load ${url} — HTTP ${response.status}`
        );
    }

    return response.json();
}


/* ============================================================
   LOAD DAILY LESSON
   ============================================================ */

async function loadDay(
    dayNumber
) {
    if (
        dayNumber < 1 ||
        dayNumber > TOTAL_DAYS
    ) {
        throw new Error(
            `Invalid Day ${dayNumber}.`
        );
    }

    const url =
        getDayURL(
            dayNumber
        );

    const lesson =
        await fetchLiveJSON(
            url
        );

    if (
        !lesson ||
        typeof lesson !== "object"
    ) {
        throw new Error(
            `Day ${dayNumber} content is invalid.`
        );
    }

    /*
       Safety validation:
       requested Day 1 must actually contain day: 1.
    */

    if (
        Number(lesson.day) !==
        dayNumber
    ) {
        throw new Error(
            `Content mismatch: requested Day ${dayNumber}, received Day ${lesson.day}.`
        );
    }

    /*
       Validate course date if provided.
    */

    if (
        lesson.courseDate
    ) {
        const expectedDate =
            getCourseDate(
                dayNumber
            );

        if (
            lesson.courseDate !==
            expectedDate
        ) {
            throw new Error(
                `Day ${dayNumber} has incorrect course date.`
            );
        }
    }

    return lesson;
}


/* ============================================================
   COURSE DATE
   ============================================================ */

function getCourseDate(
    dayNumber
) {
    const start =
        parseDateOnly(
            getCourseStartDate()
        );

    const date =
        new Date(
            start.getTime() +
            (
                (dayNumber - 1) *
                86400000
            )
        );

    return (
        `${date.getUTCFullYear()}-` +
        `${String(
            date.getUTCMonth() + 1
        ).padStart(2, "0")}-` +
        `${String(
            date.getUTCDate()
        ).padStart(2, "0")}`
    );
}


/* ============================================================
   APPLICATION LOAD
   ============================================================ */

async function loadApplication() {
    if (loading) {
        return;
    }

    loading = true;

    showLoading();

    hideError();

    try {
        await loadConfig();

        const newReleasedDay =
            calculateReleasedDay();

        releasedDay =
            newReleasedDay;

        /*
           We do NOT load syllabus.json.

           We load only the currently released
           daily JSON.
        */

        if (
            releasedDay >= 1
        ) {
            selectedDay =
                releasedDay;

            selectedLesson =
                await loadDay(
                    releasedDay
                );
        } else {
            selectedDay = null;
            selectedLesson = null;
        }

        renderApplication();

        hideLoading();

    } catch (error) {
        console.error(
            "[Vidhwaan NEET]",
            error
        );

        selectedLesson = null;

        hideLoading();

        showError(
            error?.message ||
            "Unable to load today's lesson."
        );

    } finally {
        loading = false;
    }
}


/* ============================================================
   RENDER APPLICATION
   ============================================================ */

function renderApplication() {
    renderStatus();

    renderDayGrid();

    renderLesson();
}


/* ============================================================
   STATUS
   ============================================================ */

function renderStatus() {
    if (
        releasedDay <= 0
    ) {
        setText(
            todayBadgeText,
            "Day 1 locked"
        );

        setText(
            releaseStatusText,
            "Day 1 unlocks at 6:00 AM IST"
        );

        setText(
            syllabusSummary,
            "Your 365-day NEET journey begins at 6:00 AM IST."
        );

        return;
    }

    setText(
        todayBadgeText,
        `Day ${releasedDay} available`
    );

    setText(
        releaseStatusText,
        `Day ${releasedDay} is live`
    );

    setText(
        syllabusSummary,
        `Day ${releasedDay} of ${TOTAL_DAYS} released`
    );
}


/* ============================================================
   DAY GRID
   ============================================================ */

function renderDayGrid() {
    if (!dayGrid) {
        return;
    }

    dayGrid.innerHTML = "";

    for (
        let day = 1;
        day <= TOTAL_DAYS;
        day++
    ) {
        const button =
            document.createElement(
                "button"
            );

        button.type =
            "button";

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
            /*
               Released days are clickable.
            */

            button.classList.add(
                "available"
            );

            button.disabled =
                false;

            button.addEventListener(
                "click",
                () => {
                    selectDay(
                        day
                    );
                }
            );

            /*
               Current released day gets
               the gold "today" state.
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
            }

        } else {
            /*
               Future days remain locked.
            */

            button.classList.add(
                "locked"
            );

            button.disabled =
                true;

            button.setAttribute(
                "aria-disabled",
                "true"
            );

            button.title =
                "This lesson has not been released yet";
        }

        dayGrid.appendChild(
            button
        );
    }
}


/* ============================================================
   SELECT DAY
   ============================================================ */

async function selectDay(
    dayNumber
) {
    /*
       Never allow a future day to be opened
       even if someone manipulates the DOM.
    */

    if (
        dayNumber < 1 ||
        dayNumber > releasedDay
    ) {
        return;
    }

    if (loading) {
        return;
    }

    loading = true;

    try {
        hideError();

        /*
           Always fetch the selected day's
           actual JSON.

           Example:

           Day 1 → day-001.json
           Day 2 → day-002.json
        */

        const lesson =
            await loadDay(
                dayNumber
            );

        selectedDay =
            dayNumber;

        selectedLesson =
            lesson;

        renderDayGrid();

        renderLesson();

        /*
           Bring the lesson into view.
        */

        const lessonElement =
            document.getElementById(
                "lesson-container"
            );

        if (
            lessonElement
        ) {
            lessonElement.scrollIntoView(
                {
                    behavior: "smooth",
                    block: "start"
                }
            );
        }

    } catch (error) {
        console.error(
            "[Vidhwaan NEET] Day loading error:",
            error
        );

        showError(
            error?.message ||
            `Unable to load Day ${dayNumber}.`
        );

    } finally {
        loading = false;
    }
}


/* ============================================================
   LESSON RENDERING
   ============================================================ */

function renderLesson() {
    let container =
        document.getElementById(
            "lesson-container"
        );

    /*
       Create lesson container dynamically.

       This means the existing index.html does not
       need a separate day.html.
    */

    if (!container) {
        container =
            document.createElement(
                "section"
            );

        container.id =
            "lesson-container";

        container.className =
            "lesson-container";

        if (dayGrid) {
            dayGrid.parentNode.insertBefore(
                container,
                dayGrid.nextSibling
            );
        } else {
            document
                .querySelector("main")
                ?.appendChild(
                    container
                );
        }
    }

    if (
        !selectedLesson
    ) {
        container.innerHTML = "";
        return;
    }

    container.innerHTML = "";

    renderLessonHeader(
        container,
        selectedLesson
    );

    renderIntroduction(
        container,
        selectedLesson
    );

    renderSections(
        container,
        selectedLesson
    );

    renderLearningOutcome(
        container,
        selectedLesson
    );

    renderMCQs(
        container,
        selectedLesson
    );
}


/* ============================================================
   LESSON HEADER
   ============================================================ */

function renderLessonHeader(
    container,
    lesson
) {
    const header =
        document.createElement(
            "div"
        );

    header.className =
        "lesson-header";

    const eyebrow =
        document.createElement(
            "div"
        );

    eyebrow.className =
        "lesson-eyebrow";

    eyebrow.textContent =
        `DAY ${lesson.day}`;

    const title =
        document.createElement(
            "h2"
        );

    title.textContent =
        lesson.title ||
        `Day ${lesson.day}`;

    header.appendChild(
        eyebrow
    );

    header.appendChild(
        title
    );

    if (
        lesson.courseDate
    ) {
        const date =
            document.createElement(
                "div"
            );

        date.className =
            "lesson-date";

        date.textContent =
            formatReadableDate(
                lesson.courseDate
            );

        header.appendChild(
            date
        );
    }

    container.appendChild(
        header
    );
}


/* ============================================================
   INTRODUCTION
   ============================================================ */

function renderIntroduction(
    container,
    lesson
) {
    if (
        !lesson.introduction
    ) {
        return;
    }

    const card =
        document.createElement(
            "article"
        );

    card.className =
        "lesson-introduction";

    const label =
        document.createElement(
            "div"
        );

    label.className =
        "lesson-card-label";

    label.textContent =
        "TODAY'S FOCUS";

    const text =
        document.createElement(
            "p"
        );

    text.textContent =
        lesson.introduction;

    card.appendChild(
        label
    );

    card.appendChild(
        text
    );

    container.appendChild(
        card
    );
}


/* ============================================================
   SECTIONS
   ============================================================ */

function renderSections(
    container,
    lesson
) {
    if (
        !Array.isArray(
            lesson.sections
        )
    ) {
        return;
    }

    const wrapper =
        document.createElement(
            "div"
        );

    wrapper.className =
        "lesson-sections";

    lesson.sections.forEach(
        (
            section,
            index
        ) => {
            const card =
                document.createElement(
                    "article"
                );

            card.className =
                "lesson-section";

            const number =
                document.createElement(
                    "div"
                );

            number.className =
                "lesson-section-number";

            number.textContent =
                String(index + 1)
                    .padStart(2, "0");

            const heading =
                document.createElement(
                    "h3"
                );

            heading.textContent =
                section.heading ||
                section.topic ||
                `Concept ${index + 1}`;

            const content =
                document.createElement(
                    "p"
                );

            content.textContent =
                section.content ||
                "";

            card.appendChild(
                number
            );

            card.appendChild(
                heading
            );

            card.appendChild(
                content
            );

            /*
               Key points
            */

            if (
                Array.isArray(
                    section.keyPoints
                ) &&
                section.keyPoints.length
            ) {
                const keyTitle =
                    document.createElement(
                        "h4"
                    );

                keyTitle.textContent =
                    "Key Points";

                const list =
                    document.createElement(
                        "ul"
                    );

                list.className =
                    "lesson-key-points";

                section.keyPoints.forEach(
                    point => {
                        const item =
                            document.createElement(
                                "li"
                            );

                        item.textContent =
                            point;

                        list.appendChild(
                            item
                        );
                    }
                );

                card.appendChild(
                    keyTitle
                );

                card.appendChild(
                    list
                );
            }

            /*
               NEET tips
            */

            if (
                Array.isArray(
                    section.neetTips
                ) &&
                section.neetTips.length
            ) {
                const tipBox =
                    document.createElement(
                        "div"
                    );

                tipBox.className =
                    "neet-tip";

                const tipTitle =
                    document.createElement(
                        "strong"
                    );

                tipTitle.textContent =
                    "NEET TIP";

                tipBox.appendChild(
                    tipTitle
                );

                section.neetTips.forEach(
                    tip => {
                        const text =
                            document.createElement(
                                "p"
                            );

                        text.textContent =
                            tip;

                        tipBox.appendChild(
                            text
                        );
                    }
                );

                card.appendChild(
                    tipBox
                );
            }

            wrapper.appendChild(
                card
            );
        }
    );

    container.appendChild(
        wrapper
    );
}


/* ============================================================
   LEARNING OUTCOME
   ============================================================ */

function renderLearningOutcome(
    container,
    lesson
) {
    if (
        !Array.isArray(
            lesson.learningOutcome
        ) ||
        !lesson.learningOutcome.length
    ) {
        return;
    }

    const card =
        document.createElement(
            "article"
        );

    card.className =
        "learning-outcome";

    const title =
        document.createElement(
            "h3"
        );

    title.textContent =
        "What You Should Know";

    card.appendChild(
        title
    );

    lesson.learningOutcome.forEach(
        outcome => {
            const p =
                document.createElement(
                    "p"
                );

            p.textContent =
                outcome;

            card.appendChild(
                p
            );
        }
    );

    container.appendChild(
        card
    );
}


/* ============================================================
   MCQS
   ============================================================ */

function renderMCQs(
    container,
    lesson
) {
    if (
        !Array.isArray(
            lesson.mcqs
        ) ||
        !lesson.mcqs.length
    ) {
        return;
    }

    const section =
        document.createElement(
            "section"
        );

    section.className =
        "mcq-section";

    const header =
        document.createElement(
            "div"
        );

    header.className =
        "mcq-header";

    const eyebrow =
        document.createElement(
            "div"
        );

    eyebrow.className =
        "lesson-eyebrow";

    eyebrow.textContent =
        "NEET PRACTICE";

    const title =
        document.createElement(
            "h3"
        );

    title.textContent =
        "Test Your Understanding";

    const subtitle =
        document.createElement(
            "p"
        );

    subtitle.textContent =
        `${lesson.mcqs.length} question${lesson.mcqs.length === 1 ? "" : "s"} from today's lesson.`;

    header.appendChild(
        eyebrow
    );

    header.appendChild(
        title
    );

    header.appendChild(
        subtitle
    );

    section.appendChild(
        header
    );

    lesson.mcqs.forEach(
        (
            question,
            index
        ) => {
            renderMCQ(
                section,
                question,
                index
            );
        }
    );

    container.appendChild(
        section
    );
}


/* ============================================================
   SINGLE MCQ
   ============================================================ */

function renderMCQ(
    container,
    question,
    questionIndex
) {
    const card =
        document.createElement(
            "article"
        );

    card.className =
        "mcq-card";

    const number =
        document.createElement(
            "div"
        );

    number.className =
        "mcq-number";

    number.textContent =
        `QUESTION ${questionIndex + 1}`;

    const questionText =
        document.createElement(
            "h4"
        );

    questionText.className =
        "mcq-question";

    questionText.textContent =
        question.question ||
        "";

    card.appendChild(
        number
    );

    card.appendChild(
        questionText
    );

    const options =
        document.createElement(
            "div"
        );

    options.className =
        "mcq-options";

    const buttons = [];

    if (
        !Array.isArray(
            question.options
        )
    ) {
        card.appendChild(
            options
        );

        container.appendChild(
            card
        );

        return;
    }

    question.options.forEach(
        (
            option,
            optionIndex
        ) => {
            const button =
                document.createElement(
                    "button"
                );

            button.type =
                "button";

            button.className =
                "mcq-option";

            button.dataset.option =
                String(optionIndex);

            const letter =
                document.createElement(
                    "span"
                );

            letter.className =
                "mcq-option-letter";

            letter.textContent =
                String.fromCharCode(
                    65 + optionIndex
                );

            const text =
                document.createElement(
                    "span"
                );

            text.className =
                "mcq-option-text";

            text.textContent =
                option;

            button.appendChild(
                letter
            );

            button.appendChild(
                text
            );

            button.addEventListener(
                "click",
                () => {
                    handleMCQAnswer(
                        question,
                        optionIndex,
                        buttons,
                        answerPanel
                    );
                }
            );

            buttons.push(
                button
            );

            options.appendChild(
                button
            );
        }
    );

    card.appendChild(
        options
    );

    /*
       Answer/explanation panel starts hidden.
    */

    const answerPanel =
        document.createElement(
            "div"
        );

    answerPanel.className =
        "mcq-answer-panel";

    answerPanel.hidden =
        true;

    card.appendChild(
        answerPanel
    );

    container.appendChild(
        card
    );
}


/* ============================================================
   MCQ ANSWER
   ============================================================ */

function handleMCQAnswer(
    question,
    selectedIndex,
    buttons,
    answerPanel
) {
    /*
       JSON uses zero-based answer indexes.

       Example:

       answer: 2

       means option C.
    */

    const correctIndex =
        Number(
            question.answer
        );

    const isCorrect =
        selectedIndex ===
        correctIndex;

    /*
       Lock the question after answer.
    */

    buttons.forEach(
        button => {
            button.disabled =
                true;

            button.classList.remove(
                "correct",
                "wrong",
                "selected"
            );
        }
    );

    /*
       Selected option.
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
       If wrong, explicitly reveal
       the correct answer in green.
    */

    if (
        !isCorrect &&
        buttons[correctIndex]
    ) {
        buttons[
            correctIndex
        ].classList.add(
            "correct"
        );
    }

    /*
       Answer panel.
    */

    answerPanel.innerHTML = "";

    answerPanel.hidden =
        false;

    answerPanel.classList.toggle(
        "is-correct",
        isCorrect
    );

    const result =
        document.createElement(
            "div"
        );

    result.className =
        "mcq-result";

    result.textContent =
        isCorrect
            ? "✓ Correct!"
            : "✕ Incorrect";

    answerPanel.appendChild(
        result
    );

    const answer =
        document.createElement(
            "div"
        );

    answer.className =
        "mcq-correct-answer";

    const answerLabel =
        document.createElement(
            "strong"
        );

    answerLabel.textContent =
        "Correct Answer";

    const answerText =
        document.createElement(
            "span"
        );

    answerText.textContent =
        question.options?.[
            correctIndex
        ] ||
        "";

    answer.appendChild(
        answerLabel
    );

    answer.appendChild(
        answerText
    );

    answerPanel.appendChild(
        answer
    );

    /*
       Explanation.
    */

    if (
        question.explanation
    ) {
        const explanation =
            document.createElement(
                "div"
            );

        explanation.className =
            "mcq-explanation";

        const explanationTitle =
            document.createElement(
                "strong"
            );

        explanationTitle.textContent =
            "Explanation";

        const explanationText =
            document.createElement(
                "p"
            );

        explanationText.textContent =
            question.explanation;

        explanation.appendChild(
            explanationTitle
        );

        explanation.appendChild(
            explanationText
        );

        answerPanel.appendChild(
            explanation
        );
    }
}


/* ============================================================
   DATE DISPLAY
   ============================================================ */

function formatReadableDate(
    dateString
) {
    const date =
        parseDateOnly(
            dateString
        );

    return new Intl.DateTimeFormat(
        "en-IN",
        {
            timeZone:
                "Asia/Kolkata",

            day: "numeric",
            month: "long",
            year: "numeric"
        }
    ).format(date);
}


/* ============================================================
   LOADING
   ============================================================ */

function showLoading() {
    if (
        loadingState
    ) {
        loadingState.style.display =
            "flex";
    }
}


function hideLoading() {
    if (
        loadingState
    ) {
        loadingState.style.display =
            "none";
    }
}


/* ============================================================
   ERROR
   ============================================================ */

function showError(
    message
) {
    if (
        errorState
    ) {
        errorState.classList.remove(
            "hidden"
        );
    }

    setText(
        errorMessage,
        message
    );
}


function hideError() {
    if (
        errorState
    ) {
        errorState.classList.add(
            "hidden"
        );
    }
}


/* ============================================================
   TEXT HELPER
   ============================================================ */

function setText(
    element,
    value
) {
    if (element) {
        element.textContent =
            value;
    }
}


/* ============================================================
   AUTOMATIC RELEASE WATCHER
   ============================================================

   Important:

   If a user keeps the application open at:

       05:59

   it will automatically detect:

       06:00

   and load the new JSON.

   Example:

       Day 1 → Day 2
   ============================================================ */

function startReleaseWatcher() {
    if (
        releaseTimer
    ) {
        clearInterval(
            releaseTimer
        );
    }

    releaseTimer =
        setInterval(
            async () => {
                const newDay =
                    calculateReleasedDay();

                if (
                    newDay !==
                    releasedDay
                ) {
                    console.log(
                        `[Vidhwaan NEET] Release changed: Day ${releasedDay} → Day ${newDay}`
                    );

                    await loadApplication();
                }
            },
            RELEASE_CHECK_INTERVAL
        );
}


/* ============================================================
   VISIBILITY REFRESH
   ============================================================ */

function setupVisibilityRefresh() {
    document.addEventListener(
        "visibilitychange",
        async () => {
            if (
                document.visibilityState ===
                "visible"
            ) {
                const newDay =
                    calculateReleasedDay();

                if (
                    newDay !==
                    releasedDay
                ) {
                    await loadApplication();
                }
            }
        }
    );

    window.addEventListener(
        "focus",
        async () => {
            const newDay =
                calculateReleasedDay();

            if (
                newDay !==
                releasedDay
            ) {
                await loadApplication();
            }
        }
    );
}


/* ============================================================
   RETRY
   ============================================================ */

function setupRetry() {
    if (
        retryButton
    ) {
        retryButton.addEventListener(
            "click",
            () => {
                loadApplication();
            }
        );
    }
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

            if (
                installButton
            ) {
                installButton.classList.remove(
                    "hidden"
                );
            }
        }
    );

    if (
        installButton
    ) {
        installButton.addEventListener(
            "click",
            async () => {
                if (
                    !deferredInstallPrompt
                ) {
                    return;
                }

                deferredInstallPrompt.prompt();

                await deferredInstallPrompt.userChoice;

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

            if (
                installButton
            ) {
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
                        console.error(
                            "[Vidhwaan NEET] Service worker registration failed:",
                            error
                        );
                    }
                );
        }
    );
}

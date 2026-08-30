/* ============================================================
   VIDHWAAN NEET — PRODUCTION FRONTEND
   ============================================================

   FRONTEND RULE
   ------------------------------------------------------------
   syllabus.json is NEVER used by the student application.

   The generator uses syllabus.json to create:
       ./data/day-001.json
       ./data/day-002.json
       ...
       ./data/day-365.json

   RELEASE SCHEDULE
   ------------------------------------------------------------
   Day 1   = 2026-08-30 at 06:00 IST
   Day 2   = 2026-08-31 at 06:00 IST
   Day 3   = 2026-09-01 at 06:00 IST
   ...
   Day 365 = 2027-08-29 at 06:00 IST

   IMPORTANT
   ------------------------------------------------------------
   The student application determines the active day from the
   current IST date/time.

   It then loads ONLY that day's generated JSON.

   ============================================================ */

"use strict";

/* ============================================================
   CONFIG
   ============================================================ */

const CONFIG_URL = "./data/app-config.json";

const DEFAULT_START_DATE = "2026-08-30";
const DEFAULT_ACTIVATION_HOUR = 6;
const DEFAULT_TOTAL_DAYS = 365;

const DAY_FILE_PREFIX = "day-";
const DAY_FILE_EXTENSION = ".json";

let config = null;
let currentDay = 0;
let deferredInstallPrompt = null;
let releaseTimer = null;

/* ============================================================
   DOM REFERENCES
   ============================================================ */

const dayGrid = document.getElementById("day-grid");

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
   IST CLOCK
   ============================================================ */

function getISTParts() {
    const parts = new Intl.DateTimeFormat(
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
    const now = getISTParts();

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
        /^(\d{4})-(\d{2})-(\d{2})$/.exec(
            String(dateString)
        );

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
        ) /
        86400000
    );
}

/* ============================================================
   RELEASE CONFIGURATION
   ============================================================ */

function getStartDate() {
    return (
        config?.courseStartDate ||
        config?.releaseStartDate ||
        config?.programStartDateIST ||
        DEFAULT_START_DATE
    );
}

function getActivationHour() {
    const value =
        config?.dailyActivationHourIST ??
        config?.publishHour ??
        DEFAULT_ACTIVATION_HOUR;

    const hour = Number(value);

    if (
        !Number.isInteger(hour) ||
        hour < 0 ||
        hour > 23
    ) {
        return DEFAULT_ACTIVATION_HOUR;
    }

    return hour;
}

function getTotalDays() {
    const value =
        config?.totalDays ||
        DEFAULT_TOTAL_DAYS;

    const total = Number(value);

    if (
        !Number.isInteger(total) ||
        total < 1
    ) {
        return DEFAULT_TOTAL_DAYS;
    }

    return total;
}

/* ============================================================
   RELEASE DAY
   ============================================================

   Example:

   2026-08-29 23:59 IST
       Day 0

   2026-08-30 05:59 IST
       Day 0

   2026-08-30 06:00 IST
       Day 1

   2026-08-31 05:59 IST
       Day 1

   2026-08-31 06:00 IST
       Day 2

   ============================================================ */

function getReleaseDay() {
    const now = getISTParts();

    const startDate =
        getStartDate();

    const today =
        getISTDateString();

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

    if (now.hour < activationHour) {
        dayNumber -= 1;
    }

    return Math.min(
        Math.max(dayNumber, 0),
        getTotalDays()
    );
}

/* ============================================================
   RELEASE STATUS
   ============================================================ */

function getNextReleaseText() {
    const now = getISTParts();

    const releasedDay =
        getReleaseDay();

    const totalDays =
        getTotalDays();

    const activationHour =
        getActivationHour();

    if (releasedDay >= totalDays) {
        return "All 365 days released";
    }

    if (releasedDay === 0) {
        return "Day 1 unlocks at 6:00 AM IST";
    }

    if (now.hour < activationHour) {
        return `Day ${releasedDay + 1} unlocks at 6:00 AM IST`;
    }

    return `Day ${releasedDay} available`;
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
            `HTTP ${response.status}: ${url}`
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
        !loaded ||
        typeof loaded !== "object" ||
        Array.isArray(loaded)
    ) {
        throw new Error(
            "Invalid app configuration."
        );
    }

    config = loaded;

    config.totalDays =
        Number(
            config.totalDays ||
            DEFAULT_TOTAL_DAYS
        );

    if (
        !Number.isInteger(config.totalDays) ||
        config.totalDays < 1
    ) {
        throw new Error(
            "Invalid totalDays in app-config.json."
        );
    }

    return config;
}

/* ============================================================
   DAILY JSON PATH
   ============================================================ */

function getDayURL(dayNumber) {
    if (
        !Number.isInteger(dayNumber) ||
        dayNumber < 1
    ) {
        throw new Error(
            `Invalid day number: ${dayNumber}`
        );
    }

    const filename =
        `${DAY_FILE_PREFIX}` +
        `${String(dayNumber).padStart(3, "0")}` +
        `${DAY_FILE_EXTENSION}`;

    /*
       IMPORTANT:

       public/data/day-001.json
       becomes

       ./data/day-001.json

       because the frontend itself is inside public/.
    */

    return `./data/${filename}`;
}

/* ============================================================
   LOAD ONE DAILY LESSON
   ============================================================ */

async function loadDay(dayNumber) {
    const totalDays =
        getTotalDays();

    if (
        !Number.isInteger(dayNumber) ||
        dayNumber < 1 ||
        dayNumber > totalDays
    ) {
        throw new Error(
            `Invalid lesson day: ${dayNumber}`
        );
    }

    const lesson =
        await fetchJSON(
            getDayURL(dayNumber)
        );

    if (
        !lesson ||
        typeof lesson !== "object" ||
        Array.isArray(lesson)
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
            `Lesson mismatch: requested Day ${dayNumber}, received Day ${lesson.day}.`
        );
    }

    return lesson;
}

/* ============================================================
   HTML SAFETY
   ============================================================ */

function escapeHTML(value) {
    return String(value ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}

/* ============================================================
   TEXT RENDERING
   ============================================================ */

function renderText(value) {
    if (
        value === null ||
        value === undefined
    ) {
        return "";
    }

    if (Array.isArray(value)) {
        return value
            .map(item =>
                renderText(item)
            )
            .join("<br>");
    }

    if (
        typeof value === "object"
    ) {
        return escapeHTML(
            JSON.stringify(value)
        );
    }

    return escapeHTML(value)
        .replace(/\r?\n/g, "<br>");
}

/* ============================================================
   LIST RENDERER
   ============================================================ */

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

/* ============================================================
   LESSON STYLES
   ============================================================

   These styles are intentionally injected by app.js.

   Therefore:

   NO extra lesson CSS file is required.

   Most important fix:

       .day-grid.lesson-view

   changes the 365-day grid into a full-width lesson
   container.

   ============================================================ */

function injectLessonStyles() {
    if (
        document.getElementById(
            "vidhwaan-neet-lesson-styles"
        )
    ) {
        return;
    }

    const style =
        document.createElement("style");

    style.id =
        "vidhwaan-neet-lesson-styles";

    style.textContent = `

        /* =====================================================
           CRITICAL FULL-WIDTH LESSON FIX
           ===================================================== */

        .day-grid.lesson-view {
            display: block !important;
            width: 100% !important;
            max-width: 100% !important;
            min-width: 0 !important;
            padding: 0 !important;
            margin: 0 !important;
        }

        .day-grid.lesson-view .neet-lesson {
            display: block;
            width: 100%;
            max-width: 1040px;
            min-width: 0;
            margin: 0 auto;
            padding: 0 0 70px;
        }

        .day-grid.lesson-view .neet-lesson,
        .day-grid.lesson-view .neet-lesson * {
            box-sizing: border-box;
        }

        /* =====================================================
           LESSON CONTAINER
           ===================================================== */

        .neet-lesson {
            width: 100%;
            max-width: 1040px;
            margin: 0 auto;
            padding: 0 0 70px;
        }

        /* =====================================================
           BACK BUTTON
           ===================================================== */

        .neet-back-button {
            display: inline-flex;
            align-items: center;
            gap: 8px;

            border: 1px solid #e6e9ee;
            background: #ffffff;
            color: #171717;

            cursor: pointer;

            font: inherit;
            font-weight: 800;

            margin: 0 0 18px;
            padding: 11px 16px;

            border-radius: 12px;

            transition:
                transform .18s ease,
                box-shadow .18s ease,
                border-color .18s ease;
        }

        .neet-back-button:hover {
            transform: translateY(-1px);
            border-color: #d7b64b;
            box-shadow: 0 6px 18px rgba(0,0,0,.06);
        }

        .neet-back-button:focus-visible {
            outline: 3px solid rgba(199,154,25,.25);
            outline-offset: 2px;
        }

        /* =====================================================
           LESSON HEADER
           ===================================================== */

        .neet-lesson-header {
            background: #ffffff;
            border: 1px solid #e6e9ee;
            border-radius: 22px;
            padding: 32px;
            margin-bottom: 20px;
            box-shadow: 0 10px 32px rgba(0,0,0,.05);
        }

        .neet-day-label {
            display: inline-flex;
            align-items: center;

            padding: 7px 11px;

            border-radius: 999px;

            background: #fff8df;
            border: 1px solid #ead79a;

            font-size: 12px;
            font-weight: 900;
            letter-spacing: .12em;

            margin-bottom: 14px;
        }

        .neet-lesson-header h2 {
            margin: 0;

            font-size: clamp(
                30px,
                5vw,
                48px
            );

            line-height: 1.12;

            letter-spacing: -.025em;
        }

        .neet-meta {
            margin-top: 14px;

            font-size: 16px;
            font-weight: 700;

            color: #555;
        }

        .neet-date {
            margin-top: 8px;

            font-size: 14px;

            color: #777;
        }

        /* =====================================================
           OVERVIEW CARDS
           ===================================================== */

        .neet-overview-card {
            background: #ffffff;
            border: 1px solid #e6e9ee;
            border-radius: 18px;
            padding: 24px;
            margin-bottom: 18px;
            box-shadow: 0 6px 22px rgba(0,0,0,.035);
        }

        .neet-overview-card h3 {
            margin: 0;
            font-size: 20px;
        }

        /* =====================================================
           SECTION HEADINGS
           ===================================================== */

        .neet-section {
            margin-top: 38px;
        }

        .neet-section-heading {
            display: flex;
            align-items: center;
            gap: 13px;

            margin-bottom: 17px;
        }

        .neet-section-heading span {
            display: inline-flex;
            align-items: center;
            justify-content: center;

            width: 38px;
            height: 38px;

            border-radius: 11px;

            background: #fff8df;
            border: 1px solid #ead79a;

            font-size: 12px;
            font-weight: 900;

            flex: 0 0 auto;
        }

        .neet-section-heading h2 {
            margin: 0;

            font-size: clamp(
                22px,
                4vw,
                30px
            );

            line-height: 1.2;
        }

        /* =====================================================
           TOPIC CARDS
           ===================================================== */

        .neet-topic-card {
            background: #ffffff;

            border: 1px solid #e6e9ee;
            border-radius: 18px;

            padding: 25px;

            margin-bottom: 16px;

            box-shadow:
                0 6px 22px rgba(0,0,0,.04);

            overflow-wrap: anywhere;
        }

        .neet-topic-number,
        .neet-mcq-number {
            font-size: 11px;
            font-weight: 900;
            letter-spacing: .09em;

            text-transform: uppercase;

            color: #8a8a8a;

            margin-bottom: 9px;
        }

        .neet-topic-card h3 {
            margin: 0 0 10px;

            font-size: 23px;
            line-height: 1.25;
        }

        .neet-topic-name {
            font-weight: 700;
            margin-bottom: 15px;
            color: #666;
        }

        .neet-topic-content {
            line-height: 1.78;
            font-size: 16px;
            color: #252525;
        }

        /* =====================================================
           SUBSECTIONS
           ===================================================== */

        .neet-subsections {
            margin-top: 20px;
        }

        .neet-subsection {
            margin-top: 20px;
            padding-top: 20px;

            border-top: 1px solid #edf0f3;
        }

        .neet-subsection h4 {
            margin: 0 0 9px;

            font-size: 17px;
            line-height: 1.35;
        }

        .neet-subsection div {
            line-height: 1.72;
        }

        /* =====================================================
           KEY POINTS / NEET TIPS
           ===================================================== */

        .neet-keypoints,
        .neet-tips {
            margin-top: 19px;
            padding: 17px;

            border-radius: 14px;
        }

        .neet-keypoints {
            background: #f7f9fb;
            border: 1px solid #edf0f3;
        }

        .neet-tips {
            background: #fffaf0;
            border: 1px solid #f0dfaa;
        }

        .neet-keypoints strong,
        .neet-tips strong {
            font-size: 14px;
        }

        .neet-content-list {
            margin: 10px 0 0;
            padding-left: 22px;
        }

        .neet-content-list li {
            margin: 7px 0;
            line-height: 1.58;
        }

        /* =====================================================
           MCQ CARDS
           ===================================================== */

        .neet-mcq-card {
            background: #ffffff;

            border: 1px solid #e6e9ee;
            border-radius: 18px;

            padding: 24px;

            margin-bottom: 16px;

            box-shadow:
                0 6px 22px rgba(0,0,0,.04);
        }

        .neet-mcq-card h4 {
            margin: 0 0 17px;

            font-size: 18px;
            line-height: 1.58;
        }

        /* =====================================================
           MCQ OPTIONS
           ===================================================== */

        .neet-options {
            display: grid;
            gap: 10px;
        }

        .neet-option {
            display: flex;
            gap: 11px;
            align-items: flex-start;

            width: 100%;

            padding: 14px;

            border: 1px solid #e5e8ec;
            border-radius: 13px;

            line-height: 1.5;

            background: #ffffff;

            overflow-wrap: anywhere;
        }

        .neet-option-letter {
            display: inline-flex;
            align-items: center;
            justify-content: center;

            width: 27px;
            height: 27px;

            border-radius: 8px;

            background: #f7f7f5;

            font-weight: 900;

            flex: 0 0 auto;
        }

        /* =====================================================
           ANSWER BUTTON
           ===================================================== */

        .neet-answer-toggle {
            margin-top: 17px;

            border: 1px solid #d9b84e;

            background: #fff8df;

            color: #5e4905;

            border-radius: 11px;

            padding: 10px 14px;

            cursor: pointer;

            font: inherit;
            font-weight: 800;
        }

        .neet-answer-toggle:hover {
            background: #fff3c4;
        }

        .neet-answer-toggle:focus-visible {
            outline: 3px solid rgba(199,154,25,.25);
            outline-offset: 2px;
        }

        .neet-answer-panel {
            margin-top: 13px;
        }

        .neet-answer {
            padding: 14px;

            border-radius: 12px;

            background: #f2f7f3;

            border: 1px solid #dbe9df;

            line-height: 1.55;
        }

        .neet-explanation {
            margin-top: 10px;

            padding: 14px;

            border-radius: 12px;

            background: #f7f8fa;

            border: 1px solid #edf0f3;

            line-height: 1.65;
        }

        /* =====================================================
           EMPTY STATE
           ===================================================== */

        .neet-empty {
            padding: 28px;

            text-align: center;

            color: #777;

            background: #fafafa;

            border: 1px dashed #ddd;

            border-radius: 14px;
        }

        /* =====================================================
           LESSON NAVIGATION
           ===================================================== */

        .neet-lesson-navigation {
            display: flex;
            justify-content: space-between;
            gap: 12px;

            margin-top: 30px;
        }

        .neet-nav-button {
            border: 1px solid #e3e6ea;
            background: #ffffff;
            color: #171717;

            border-radius: 12px;

            padding: 11px 15px;

            cursor: pointer;

            font: inherit;
            font-weight: 800;
        }

        .neet-nav-button:disabled {
            opacity: .45;
            cursor: not-allowed;
        }

        .neet-nav-button:not(:disabled):hover {
            border-color: #d7b64b;
        }

        /* =====================================================
           MOBILE
           ===================================================== */

        @media (max-width: 640px) {

            .day-grid.lesson-view {
                display: block !important;
                width: 100% !important;
                padding: 0 !important;
            }

            .day-grid.lesson-view .neet-lesson {
                width: 100%;
                max-width: none;
                padding:
                    0
                    0
                    52px;
            }

            .neet-back-button {
                margin-bottom: 13px;
            }

            .neet-lesson-header {
                border-radius: 16px;
                padding: 19px;
                margin-bottom: 14px;
            }

            .neet-lesson-header h2 {
                font-size: 29px;
            }

            .neet-meta {
                font-size: 14px;
            }

            .neet-overview-card,
            .neet-topic-card,
            .neet-mcq-card {
                border-radius: 15px;
                padding: 17px;
            }

            .neet-topic-card h3 {
                font-size: 20px;
            }

            .neet-topic-content {
                font-size: 15px;
                line-height: 1.75;
            }

            .neet-section {
                margin-top: 28px;
            }

            .neet-section-heading h2 {
                font-size: 21px;
            }

            .neet-mcq-card h4 {
                font-size: 16px;
            }

            .neet-option {
                padding: 12px;
            }

            .neet-lesson-navigation {
                flex-direction: column;
            }

            .neet-nav-button {
                width: 100%;
            }
        }

    `;

    document.head.appendChild(style);
}

/* ============================================================
   DAY GRID VIEW
   ============================================================ */

function renderDayGrid() {
    if (!dayGrid) {
        return;
    }

    /*
       IMPORTANT:

       When returning from a lesson, remove lesson-view.

       This restores the original 365-day CSS grid.
    */

    dayGrid.classList.remove(
        "lesson-view"
    );

    dayGrid.innerHTML = "";

    const totalDays =
        getTotalDays();

    const releasedDay =
        getReleaseDay();

    currentDay =
        releasedDay;

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

        if (day <= releasedDay) {

            button.classList.add(
                "available"
            );

            if (day === releasedDay) {

                button.classList.add(
                    "today"
                );

                button.setAttribute(
                    "aria-current",
                    "date"
                );
            }

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
   STATUS UI
   ============================================================ */

function updateStatus(releasedDay) {
    const totalDays =
        getTotalDays();

    const status =
        getNextReleaseText();

    if (releaseStatusText) {
        releaseStatusText.textContent =
            status;
    }

    if (todayBadgeText) {
        todayBadgeText.textContent =
            releasedDay > 0
                ? `Day ${releasedDay} released`
                : "Day 1 locked";
    }

    if (syllabusSummary) {
        syllabusSummary.textContent =
            releasedDay > 0
                ? `Day ${releasedDay} of ${totalDays} released`
                : `Day 1 of ${totalDays} begins at 6:00 AM IST`;
    }
}

/* ============================================================
   LOADING UI
   ============================================================ */

function setLoading(isLoading) {
    if (!loadingState) {
        return;
    }

    if (isLoading) {

        loadingState.style.display =
            "flex";

        if (errorState) {
            errorState.classList.add(
                "hidden"
            );
        }

    } else {

        loadingState.style.display =
            "none";
    }
}

/* ============================================================
   ERROR UI
   ============================================================ */

function showError(message) {
    if (!errorState) {
        return;
    }

    errorState.classList.remove(
        "hidden"
    );

    if (errorMessage) {
        errorMessage.textContent =
            message;
    }
}

/* ============================================================
   MCQ RENDERER
   ============================================================ */

function renderMCQ(mcq, index) {
    if (
        !mcq ||
        typeof mcq !== "object"
    ) {
        return "";
    }

    const options =
        Array.isArray(mcq.options)
            ? mcq.options
            : [];

    const answer =
        mcq.correctAnswer ??
        "";

    const explanation =
        mcq.explanation ??
        "";

    const answerPanelId =
        `neet-answer-${index}-${Date.now()}`;

    return `
        <article class="neet-mcq-card">

            <div class="neet-mcq-number">
                Question ${index + 1}
            </div>

            <h4>
                ${renderText(
                    mcq.question ||
                    "Question"
                )}
            </h4>

            <div class="neet-options">

                ${options
                    .map(
                        (option, optionIndex) => {

                            const letter =
                                String.fromCharCode(
                                    65 +
                                    optionIndex
                                );

                            return `
                                <div class="neet-option">

                                    <span
                                        class="neet-option-letter"
                                    >
                                        ${letter}
                                    </span>

                                    <span>
                                        ${renderText(
                                            option
                                        )}
                                    </span>

                                </div>
                            `;
                        }
                    )
                    .join("")}

            </div>

            ${
                answer || explanation
                    ? `
                        <button
                            type="button"
                            class="neet-answer-toggle"
                            aria-expanded="false"
                            aria-controls="${answerPanelId}"
                        >
                            Show Answer & Explanation
                        </button>

                        <div
                            id="${answerPanelId}"
                            class="neet-answer-panel"
                            hidden
                        >

                            ${
                                answer
                                    ? `
                                        <div class="neet-answer">
                                            <strong>
                                                Correct Answer:
                                            </strong>
                                            ${renderText(answer)}
                                        </div>
                                      `
                                    : ""
                            }

                            ${
                                explanation
                                    ? `
                                        <div class="neet-explanation">
                                            <strong>
                                                Explanation:
                                            </strong>
                                            ${renderText(
                                                explanation
                                            )}
                                        </div>
                                      `
                                    : ""
                            }

                        </div>
                      `
                    : ""
            }

        </article>
    `;
}

/* ============================================================
   TOPIC RENDERER
   ============================================================ */

function renderTopic(
    section,
    index
) {
    if (
        !section ||
        typeof section !== "object"
    ) {
        return "";
    }

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

    const heading =
        section.heading ||
        section.topic ||
        `Topic ${index + 1}`;

    return `
        <article class="neet-topic-card">

            <div class="neet-topic-number">
                Topic ${index + 1}
            </div>

            <h3>
                ${escapeHTML(heading)}
            </h3>

            ${
                section.topic &&
                section.heading &&
                section.topic !== section.heading
                    ? `
                        <div class="neet-topic-name">
                            ${escapeHTML(
                                section.topic
                            )}
                        </div>
                      `
                    : ""
            }

            ${
                section.content
                    ? `
                        <div class="neet-topic-content">
                            ${renderText(
                                section.content
                            )}
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
                                    subsection => `
                                        <section
                                            class="neet-subsection"
                                        >

                                            <h4>
                                                ${escapeHTML(
                                                    subsection?.heading ||
                                                    "Key Concept"
                                                )}
                                            </h4>

                                            <div>
                                                ${renderText(
                                                    subsection?.content ||
                                                    ""
                                                )}
                                            </div>

                                        </section>
                                    `
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
   LESSON RENDERER
   ============================================================ */

function renderLesson(lesson) {
    if (
        !lesson ||
        typeof lesson !== "object"
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

    /*
       ========================================================
       CRITICAL FIX
       ========================================================

       The original application used #day-grid as the 365-day
       CSS grid.

       A lesson was then inserted directly into that grid.

       Result:

           Day 1
              ↓
           lesson becomes one grid item
              ↓
           narrow column
              ↓
           text wraps vertically

       We explicitly switch #day-grid into full-width lesson
       mode before inserting the lesson.
    */

    dayGrid.classList.add(
        "lesson-view"
    );

    const sections =
        Array.isArray(lesson.sections)
            ? lesson.sections
            : [];

    const mcqs =
        Array.isArray(lesson.mcqs)
            ? lesson.mcqs
            : [];

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

    const totalDays =
        getTotalDays();

    const releasedDay =
        getReleaseDay();

    const previousDay =
        Number(lesson.day) - 1;

    const nextDay =
        Number(lesson.day) + 1;

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
                    DAY ${escapeHTML(
                        lesson.day
                    )}
                </div>

                <h2>
                    ${escapeHTML(
                        lesson.title ||
                        `NEET Day ${lesson.day}`
                    )}
                </h2>

                ${
                    lesson.subject
                        ? `
                            <div class="neet-meta">
                                ${escapeHTML(
                                    lesson.subject
                                )}

                                ${
                                    lesson.chapter
                                        ? `
                                            <span>
                                                •
                                            </span>
                                            ${escapeHTML(
                                                lesson.chapter
                                            )}
                                          `
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
                        <section
                            class="neet-overview-card"
                        >

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
                        <section
                            class="neet-overview-card"
                        >

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


            <!-- COMPLETE LESSON -->

            <section class="neet-section">

                <div
                    class="neet-section-heading"
                >

                    <span>
                        01
                    </span>

                    <h2>
                        Complete Lesson
                    </h2>

                </div>

                ${
                    topicHTML ||
                    `
                        <div class="neet-empty">
                            No lesson topics are available.
                        </div>
                    `
                }

            </section>


            <!-- MCQS -->

            <section class="neet-section">

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

                ${
                    mcqHTML ||
                    `
                        <div class="neet-empty">
                            No MCQs are available for this lesson.
                        </div>
                    `
                }

            </section>


            <!-- LESSON NAVIGATION -->

            <div
                class="neet-lesson-navigation"
            >

                <button
                    type="button"
                    class="neet-nav-button"
                    id="previous-day-button"
                    ${
                        previousDay < 1
                            ? "disabled"
                            : ""
                    }
                >
                    ← Previous Day
                </button>

                <button
                    type="button"
                    class="neet-nav-button"
                    id="next-day-button"
                    ${
                        nextDay > releasedDay ||
                        nextDay > totalDays
                            ? "disabled"
                            : ""
                    }
                >
                    Next Day →
                </button>

            </div>

        </div>
    `;

    /* ========================================================
       BACK BUTTON
       ======================================================== */

    const backButton =
        document.getElementById(
            "back-to-days"
        );

    if (backButton) {
        backButton.addEventListener(
            "click",
            () => {
                renderDayGrid();

                window.scrollTo({
                    top: 0,
                    behavior: "smooth"
                });
            }
        );
    }

    /* ========================================================
       MCQ ANSWER TOGGLES
       ======================================================== */

    const answerButtons =
        dayGrid.querySelectorAll(
            ".neet-answer-toggle"
        );

    for (const button of answerButtons) {

        button.addEventListener(
            "click",
            () => {

                const targetId =
                    button.getAttribute(
                        "aria-controls"
                    );

                const panel =
                    targetId
                        ? document.getElementById(
                            targetId
                        )
                        : null;

                if (!panel) {
                    return;
                }

                const isHidden =
                    panel.hidden;

                panel.hidden =
                    !isHidden;

                button.setAttribute(
                    "aria-expanded",
                    String(isHidden)
                );

                button.textContent =
                    isHidden
                        ? "Hide Answer & Explanation"
                        : "Show Answer & Explanation";
            }
        );
    }

    /* ========================================================
       PREVIOUS DAY
       ======================================================== */

    const previousButton =
        document.getElementById(
            "previous-day-button"
        );

    if (
        previousButton &&
        !previousButton.disabled
    ) {
        previousButton.addEventListener(
            "click",
            () => {
                openDay(
                    previousDay
                );
            }
        );
    }

    /* ========================================================
       NEXT DAY
       ======================================================== */

    const nextButton =
        document.getElementById(
            "next-day-button"
        );

    if (
        nextButton &&
        !nextButton.disabled
    ) {
        nextButton.addEventListener(
            "click",
            () => {
                openDay(
                    nextDay
                );
            }
        );
    }
}

/* ============================================================
   OPEN DAILY LESSON
   ============================================================ */

async function openDay(dayNumber) {
    const releasedDay =
        getReleaseDay();

    if (
        !Number.isInteger(dayNumber) ||
        dayNumber < 1 ||
        dayNumber > releasedDay
    ) {
        return;
    }

    setLoading(true);

    try {

        const lesson =
            await loadDay(
                dayNumber
            );

        /*
           Safety verification.
        */

        if (
            Number(lesson.day) !==
            Number(dayNumber)
        ) {
            throw new Error(
                `Lesson mismatch: requested Day ${dayNumber}, received Day ${lesson.day}.`
            );
        }

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
            "Vidhwaan NEET lesson loading error:",
            error
        );

        setLoading(false);

        showError(
            `Day ${dayNumber} could not be loaded. ` +
            `The daily lesson may not have been generated yet.`
        );
    }
}

/* ============================================================
   NEXT 06:00 IST BOUNDARY
   ============================================================ */

function getNextISTBoundary(
    ist,
    hour
) {
    /*
       Asia/Kolkata = UTC+05:30.

       06:00 IST
       =
       00:30 UTC
    */

    const targetUTC =
        Date.UTC(
            ist.year,
            ist.month - 1,
            ist.day,
            hour - 5,
            30,
            0,
            0
        );

    return targetUTC;
}

/* ============================================================
   AUTO REFRESH
   ============================================================ */

function scheduleNextRelease() {
    if (releaseTimer) {
        clearTimeout(
            releaseTimer
        );

        releaseTimer =
            null;
    }

    const now =
        new Date();

    const ist =
        getISTParts();

    const target =
        getNextISTBoundary(
            ist,
            getActivationHour()
        );

    let delay =
        target -
        now.getTime();

    /*
       If today's 06:00 has already passed,
       schedule tomorrow's 06:00.
    */

    if (delay <= 1000) {
        delay += 86400000;
    }

    /*
       Safety protection.

       Never schedule less than one second.
    */

    delay =
        Math.max(
            delay,
            1000
        );

    releaseTimer =
        setTimeout(
            async () => {

                try {
                    await refreshRelease();
                } catch (error) {

                    console.error(
                        "Daily release refresh failed:",
                        error
                    );
                }

                scheduleNextRelease();

            },
            delay
        );
}

/* ============================================================
   REFRESH RELEASE
   ============================================================ */

async function refreshRelease() {
    await loadConfig();

    const newReleasedDay =
        getReleaseDay();

    /*
       Always rebuild the day grid first.
    */

    renderDayGrid();

    /*
       Automatically open today's newly released lesson.

       This is especially useful if the app was already open
       when 06:00 IST arrived.
    */

    if (
        newReleasedDay > 0
    ) {
        await openDay(
            newReleasedDay
        );
    }
}

/* ============================================================
   RETRY
   ============================================================ */

if (retryButton) {

    retryButton.addEventListener(
        "click",
        async () => {

            try {

                setLoading(
                    true
                );

                await loadConfig();

                setLoading(
                    false
                );

                renderDayGrid();

                const released =
                    getReleaseDay();

                if (
                    released > 0
                ) {
                    await openDay(
                        released
                    );
                }

            } catch (error) {

                console.error(
                    error
                );

                setLoading(
                    false
                );

                showError(
                    error?.message ||
                    "Unable to load Vidhwaan NEET."
                );
            }
        }
    );
}

/* ============================================================
   PWA INSTALL
   ============================================================ */

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

            try {

                deferredInstallPrompt.prompt();

                await deferredInstallPrompt.userChoice;

            } catch (error) {

                console.error(
                    "PWA installation prompt failed:",
                    error
                );

            } finally {

                deferredInstallPrompt =
                    null;

                installButton.classList.add(
                    "hidden"
                );
            }
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
                            "Vidhwaan NEET service worker registered:",
                            registration.scope
                        );
                    }
                )
                .catch(
                    error => {

                        /*
                           Service-worker failure must NOT
                           prevent the application itself from
                           running.
                        */

                        console.error(
                            "Service worker registration failed:",
                            error
                        );
                    }
                );
        }
    );
}

/* ============================================================
   START APPLICATION
   ============================================================ */

async function startApp() {

    try {

        /*
           Inject lesson-specific responsive styles.
        */

        injectLessonStyles();

        setLoading(
            true
        );

        /*
           Load ONLY app configuration.
        */

        await loadConfig();

        setLoading(
            false
        );

        /*
           Build 365-day grid.

           syllabus.json is NOT touched.
        */

        renderDayGrid();

        /*
           Determine today's released day.

           Example:

           30 Aug 2026 06:00
               -> Day 1

           31 Aug 2026 06:00
               -> Day 2
        */

        const releasedDay =
            getReleaseDay();

        if (
            releasedDay > 0
        ) {

            /*
               Load exactly:

               day-001.json
               day-002.json
               etc.
            */

            await openDay(
                releasedDay
            );
        }

        /*
           Keep the application synchronized
           across future 06:00 IST releases.
        */

        scheduleNextRelease();

    } catch (error) {

        console.error(
            "Vidhwaan NEET startup error:",
            error
        );

        setLoading(
            false
        );

        showError(
            error?.message ||
            "Unable to start Vidhwaan NEET."
        );
    }
}

/* ============================================================
   START
   ============================================================ */

startApp();

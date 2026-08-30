/* ============================================================
   VIDHWAAN NEET — PRODUCTION FRONTEND
   ============================================================

   FRONTEND RULE:
   - syllabus.json is NEVER used by the student app.
   - AI uses syllabus.json only during generation.
   - Students receive generated daily JSON files.

   RELEASE SCHEDULE:
   Day 1   = 2026-08-30 at 06:00 IST
   Day 2   = 2026-08-31 at 06:00 IST
   Day 3   = 2026-09-01 at 06:00 IST
   ...
   Day 365 = start date + 364 days at 06:00 IST

   DAILY CONTENT:
   ./data/day-001.json
   ./data/day-002.json
   ...
   ./data/day-365.json
   ============================================================ */

"use strict";

/* ============================================================
   CONFIG
   ============================================================ */

const CONFIG_URL = "./data/app-config.json";

const DEFAULT_START_DATE = "2026-08-30";
const DEFAULT_ACTIVATION_HOUR = 6;
const DEFAULT_TOTAL_DAYS = 365;

let config = null;
let currentDay = 0;
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
   RELEASE CALCULATION
   ============================================================

   IMPORTANT:

   Before 06:00 IST:
       today's lesson is NOT released.

   At/after 06:00 IST:
       today's lesson IS released.

   Example:

   2026-08-30 05:59 -> Day 0
   2026-08-30 06:00 -> Day 1

   2026-08-31 05:59 -> Day 1
   2026-08-31 06:00 -> Day 2
   ============================================================ */

function getReleaseDay() {
    const now = getISTParts();

    const startDate =
        config?.courseStartDate ||
        config?.releaseStartDate ||
        config?.programStartDateIST ||
        DEFAULT_START_DATE;

    const activationHour =
        Number(
            config?.dailyActivationHourIST ??
            config?.publishHour ??
            DEFAULT_ACTIVATION_HOUR
        );

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

    /*
      The first lesson and every subsequent lesson
      activate only at the configured hour.
    */
    if (now.hour < activationHour) {
        dayNumber -= 1;
    }

    const totalDays =
        Number(
            config?.totalDays ||
            DEFAULT_TOTAL_DAYS
        );

    return Math.min(
        Math.max(dayNumber, 0),
        totalDays
    );
}

/* ============================================================
   NEXT RELEASE
   ============================================================ */

function getNextReleaseText() {
    const now = getISTParts();

    const activationHour =
        Number(
            config?.dailyActivationHourIST ??
            config?.publishHour ??
            DEFAULT_ACTIVATION_HOUR
        );

    const released =
        getReleaseDay();

    const totalDays =
        Number(
            config?.totalDays ||
            DEFAULT_TOTAL_DAYS
        );

    if (released >= totalDays) {
        return "All 365 days released";
    }

    if (released === 0) {
        return "Day 1 unlocks at 6:00 AM IST";
    }

    if (now.hour < activationHour) {
        return `Day ${released + 1} unlocks at 6:00 AM IST`;
    }

    return `Day ${released} available`;
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
                    "Pragma": "no-cache"
                }
            }
        );

    if (!response.ok) {
        throw new Error(
            `HTTP ${response.status}: ${url}`
        );
    }

    return response.json();
}

/* ============================================================
   LOAD CONFIG ONLY
   ============================================================ */

async function loadConfig() {
    config =
        await fetchJSON(CONFIG_URL);

    if (!config || typeof config !== "object") {
        throw new Error(
            "Invalid app configuration."
        );
    }

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
}

/* ============================================================
   DAILY JSON PATH
   ============================================================ */

function getDayURL(dayNumber) {
    const filename =
        `day-${String(dayNumber).padStart(3, "0")}.json`;

    /*
      Generated lessons are stored directly in:
      public/data/day-001.json
      public/data/day-002.json
      etc.
    */

    return `./data/${filename}`;
}

/* ============================================================
   DAY FILE EXISTENCE / LOAD
   ============================================================ */

async function loadDay(dayNumber) {
    const totalDays =
        Number(
            config?.totalDays ||
            DEFAULT_TOTAL_DAYS
        );

    if (
        !Number.isInteger(dayNumber) ||
        dayNumber < 1 ||
        dayNumber > totalDays
    ) {
        throw new Error(
            `Invalid lesson day: ${dayNumber}`
        );
    }

    const url =
        getDayURL(dayNumber);

    return fetchJSON(url);
}

/* ============================================================
   ESCAPE HTML
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

function renderText(text) {
    if (
        text === null ||
        text === undefined
    ) {
        return "";
    }

    if (Array.isArray(text)) {
        return text
            .map(item => renderText(item))
            .join("<br>");
    }

    return escapeHTML(text)
        .replace(/\n/g, "<br>");
}

/* ============================================================
   ARRAY RENDERING
   ============================================================ */

function renderList(items) {
    if (!Array.isArray(items) || items.length === 0) {
        return "";
    }

    return `
        <ul class="neet-content-list">
            ${items.map(item => `
                <li>${renderText(item)}</li>
            `).join("")}
        </ul>
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

    const sections =
        Array.isArray(lesson.sections)
            ? lesson.sections
            : [];

    const mcqs =
        Array.isArray(lesson.mcqs)
            ? lesson.mcqs
            : [];

    const topicHTML =
        sections.map(
            (section, index) => {

                const subsections =
                    Array.isArray(
                        section.subsections
                    )
                        ? section.subsections
                        : [];

                return `
                    <article class="neet-topic-card">

                        <div class="neet-topic-number">
                            Topic ${index + 1}
                        </div>

                        <h3>
                            ${escapeHTML(
                                section.heading ||
                                section.topic ||
                                `Topic ${index + 1}`
                            )}
                        </h3>

                        ${
                            section.topic &&
                            section.heading &&
                            section.topic !== section.heading
                                ? `
                                    <div class="neet-topic-name">
                                        ${escapeHTML(section.topic)}
                                    </div>
                                  `
                                : ""
                        }

                        ${
                            section.content
                                ? `
                                    <div class="neet-topic-content">
                                        ${renderText(section.content)}
                                    </div>
                                  `
                                : ""
                        }

                        ${
                            subsections.length
                                ? `
                                    <div class="neet-subsections">
                                        ${subsections.map(
                                            subsection => `
                                                <section class="neet-subsection">
                                                    <h4>
                                                        ${escapeHTML(
                                                            subsection.heading ||
                                                            "Key Concept"
                                                        )}
                                                    </h4>

                                                    <div>
                                                        ${renderText(
                                                            subsection.content
                                                        )}
                                                    </div>
                                                </section>
                                            `
                                        ).join("")}
                                    </div>
                                  `
                                : ""
                        }

                        ${
                            Array.isArray(section.keyPoints) &&
                            section.keyPoints.length
                                ? `
                                    <div class="neet-keypoints">
                                        <strong>Key Points</strong>
                                        ${renderList(
                                            section.keyPoints
                                        )}
                                    </div>
                                  `
                                : ""
                        }

                        ${
                            Array.isArray(section.neetTips) &&
                            section.neetTips.length
                                ? `
                                    <div class="neet-tips">
                                        <strong>NEET Focus</strong>
                                        ${renderList(
                                            section.neetTips
                                        )}
                                    </div>
                                  `
                                : ""
                        }

                    </article>
                `;
            }
        ).join("");

    const mcqHTML =
        mcqs.map(
            (mcq, index) => {

                const options =
                    Array.isArray(mcq.options)
                        ? mcq.options
                        : [];

                return `
                    <article class="neet-mcq-card">

                        <div class="neet-mcq-number">
                            Question ${index + 1}
                        </div>

                        <h4>
                            ${renderText(
                                mcq.question
                            )}
                        </h4>

                        <div class="neet-options">
                            ${options.map(
                                (option, optionIndex) => {

                                    const letter =
                                        String.fromCharCode(
                                            65 + optionIndex
                                        );

                                    return `
                                        <div class="neet-option">
                                            <span class="neet-option-letter">
                                                ${letter}
                                            </span>

                                            <span>
                                                ${renderText(option)}
                                            </span>
                                        </div>
                                    `;
                                }
                            ).join("")}
                        </div>

                        ${
                            mcq.correctAnswer
                                ? `
                                    <div class="neet-answer">
                                        <strong>
                                            Answer:
                                        </strong>
                                        ${escapeHTML(
                                            mcq.correctAnswer
                                        )}
                                    </div>
                                  `
                                : ""
                        }

                        ${
                            mcq.explanation
                                ? `
                                    <div class="neet-explanation">
                                        <strong>
                                            Explanation:
                                        </strong>
                                        ${renderText(
                                            mcq.explanation
                                        )}
                                    </div>
                                  `
                                : ""
                        }

                    </article>
                `;
            }
        ).join("");

    dayGrid.innerHTML = `
        <div class="neet-lesson">

            <button
                type="button"
                class="neet-back-button"
                id="back-to-days"
            >
                ← Back to 365-Day Course
            </button>

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
                                        ? ` • ${escapeHTML(
                                            lesson.chapter
                                          )}`
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

            ${
                Array.isArray(lesson.neetFocus) &&
                lesson.neetFocus.length
                    ? `
                        <section class="neet-overview-card">
                            <h3>NEET Focus</h3>
                            ${renderList(
                                lesson.neetFocus
                            )}
                        </section>
                      `
                    : ""
            }

            ${
                Array.isArray(lesson.learningOutcome) &&
                lesson.learningOutcome.length
                    ? `
                        <section class="neet-overview-card">
                            <h3>What You Will Learn</h3>
                            ${renderList(
                                lesson.learningOutcome
                            )}
                        </section>
                      `
                    : ""
            }

            <section class="neet-section">
                <div class="neet-section-heading">
                    <span>01</span>
                    <h2>Complete Lesson</h2>
                </div>

                ${topicHTML}
            </section>

            <section class="neet-section">
                <div class="neet-section-heading">
                    <span>02</span>
                    <h2>NEET Practice MCQs</h2>
                </div>

                ${
                    mcqHTML ||
                    `
                        <div class="neet-empty">
                            No MCQs available for this lesson.
                        </div>
                    `
                }
            </section>

        </div>
    `;

    const backButton =
        document.getElementById(
            "back-to-days"
        );

    if (backButton) {
        backButton.addEventListener(
            "click",
            () => renderDayGrid()
        );
    }
}

/* ============================================================
   DYNAMIC LESSON STYLES
   ============================================================

   Kept inside app.js so no additional production files
   are required for the lesson renderer.
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
        .neet-lesson {
            width: 100%;
            max-width: 1000px;
            margin: 0 auto;
            padding: 8px 0 60px;
        }

        .neet-back-button {
            border: 0;
            background: transparent;
            cursor: pointer;
            font: inherit;
            font-weight: 700;
            margin: 0 0 18px;
            padding: 10px 0;
        }

        .neet-lesson-header {
            background: #ffffff;
            border: 1px solid #e6e9ee;
            border-radius: 20px;
            padding: 28px;
            margin-bottom: 20px;
            box-shadow: 0 8px 28px rgba(0,0,0,.05);
        }

        .neet-day-label {
            font-size: 13px;
            font-weight: 800;
            letter-spacing: .12em;
            margin-bottom: 8px;
        }

        .neet-lesson-header h2 {
            margin: 0;
            font-size: clamp(26px, 5vw, 42px);
            line-height: 1.15;
        }

        .neet-meta,
        .neet-date {
            margin-top: 10px;
            opacity: .72;
        }

        .neet-overview-card {
            background: #ffffff;
            border: 1px solid #e6e9ee;
            border-radius: 18px;
            padding: 22px;
            margin-bottom: 18px;
        }

        .neet-overview-card h3 {
            margin-top: 0;
        }

        .neet-section {
            margin-top: 34px;
        }

        .neet-section-heading {
            display: flex;
            align-items: center;
            gap: 12px;
            margin-bottom: 16px;
        }

        .neet-section-heading span {
            font-weight: 900;
            opacity: .55;
        }

        .neet-section-heading h2 {
            margin: 0;
        }

        .neet-topic-card,
        .neet-mcq-card {
            background: #ffffff;
            border: 1px solid #e6e9ee;
            border-radius: 18px;
            padding: 22px;
            margin-bottom: 16px;
            box-shadow: 0 6px 22px rgba(0,0,0,.04);
        }

        .neet-topic-number,
        .neet-mcq-number {
            font-size: 12px;
            font-weight: 800;
            letter-spacing: .08em;
            opacity: .55;
            margin-bottom: 8px;
        }

        .neet-topic-card h3 {
            margin: 0 0 10px;
            font-size: 22px;
        }

        .neet-topic-name {
            font-weight: 700;
            margin-bottom: 14px;
            opacity: .75;
        }

        .neet-topic-content {
            line-height: 1.75;
            font-size: 16px;
        }

        .neet-subsections {
            margin-top: 18px;
        }

        .neet-subsection {
            margin-top: 18px;
            padding-top: 18px;
            border-top: 1px solid #edf0f3;
        }

        .neet-subsection h4 {
            margin: 0 0 8px;
            font-size: 17px;
        }

        .neet-subsection div {
            line-height: 1.7;
        }

        .neet-keypoints,
        .neet-tips {
            margin-top: 18px;
            padding: 16px;
            border-radius: 14px;
            background: #f7f9fb;
        }

        .neet-tips {
            background: #fffaf0;
        }

        .neet-content-list {
            margin: 10px 0 0;
            padding-left: 22px;
        }

        .neet-content-list li {
            margin: 7px 0;
            line-height: 1.55;
        }

        .neet-mcq-card h4 {
            margin: 0 0 16px;
            font-size: 18px;
            line-height: 1.55;
        }

        .neet-options {
            display: grid;
            gap: 9px;
        }

        .neet-option {
            display: flex;
            gap: 10px;
            align-items: flex-start;
            padding: 12px;
            border: 1px solid #e5e8ec;
            border-radius: 12px;
            line-height: 1.45;
        }

        .neet-option-letter {
            font-weight: 900;
            min-width: 24px;
        }

        .neet-answer {
            margin-top: 16px;
            padding: 13px;
            border-radius: 12px;
            background: #f2f7f3;
            line-height: 1.5;
        }

        .neet-explanation {
            margin-top: 10px;
            padding: 13px;
            border-radius: 12px;
            background: #f7f8fa;
            line-height: 1.6;
        }

        .neet-empty {
            padding: 24px;
            text-align: center;
            opacity: .65;
        }

        @media (max-width: 600px) {
            .neet-lesson {
                padding-left: 0;
                padding-right: 0;
            }

            .neet-lesson-header,
            .neet-topic-card,
            .neet-mcq-card,
            .neet-overview-card {
                border-radius: 14px;
                padding: 17px;
            }

            .neet-topic-content {
                font-size: 15px;
            }
        }
    `;

    document.head.appendChild(style);
}

/* ============================================================
   DAY GRID
   ============================================================ */

function renderDayGrid() {
    const totalDays =
        Number(
            config?.totalDays ||
            DEFAULT_TOTAL_DAYS
        );

    const releasedDay =
        getReleaseDay();

    currentDay =
        releasedDay;

    if (!dayGrid) {
        return;
    }

    dayGrid.innerHTML = "";

    for (
        let day = 1;
        day <= totalDays;
        day++
    ) {
        const button =
            document.createElement("button");

        button.type = "button";
        button.className = "day-button";
        button.textContent = String(day);

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

            button.disabled = true;

            button.title =
                `Day ${day} is not released yet`;
        }

        dayGrid.appendChild(button);
    }

    updateStatus(releasedDay);
}

/* ============================================================
   OPEN DAILY LESSON
   ============================================================ */

async function openDay(dayNumber) {
    const releasedDay =
        getReleaseDay();

    if (
        dayNumber < 1 ||
        dayNumber > releasedDay
    ) {
        return;
    }

    setLoading(true);

    try {

        const lesson =
            await loadDay(dayNumber);

        /*
          Safety check:
          Never display the wrong JSON under a day number.
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

        renderLesson(lesson);

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
   STATUS
   ============================================================ */

function updateStatus(releasedDay) {

    const totalDays =
        Number(
            config?.totalDays ||
            DEFAULT_TOTAL_DAYS
        );

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
   LOADING
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
   ERROR
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
   AUTO REFRESH AT NEXT 6 AM IST
   ============================================================ */

function scheduleNextRelease() {

    const now =
        new Date();

    const ist =
        getISTParts();

    const next =
        new Date(now.getTime());

    /*
      Calculate milliseconds until the next
      06:00 IST boundary.

      First try today's 06:00.
      If already passed, use tomorrow.
    */

    const todayTarget =
        getNextISTBoundary(
            ist,
            DEFAULT_ACTIVATION_HOUR
        );

    let delay =
        todayTarget -
        now.getTime();

    if (delay <= 1000) {
        delay += 86400000;
    }

    /*
      Never allow an accidental huge or tiny timer.
    */
    delay =
        Math.max(
            delay,
            1000
        );

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

function getNextISTBoundary(
    ist,
    hour
) {
    /*
      Convert the current instant to a
      target ISO-like IST clock and then
      calculate using UTC representation.

      Asia/Kolkata is UTC+05:30.
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
   REFRESH RELEASE
   ============================================================ */

async function refreshRelease() {

    /*
      Config rarely changes, but reload it so that
      production configuration remains authoritative.
    */

    await loadConfig();

    const newReleasedDay =
        getReleaseDay();

    /*
      If the student is currently looking at the
      day grid, update it.

      If they are reading today's lesson, automatically
      return to the new released day at 06:00.
    */

    if (
        currentDay > 0 &&
        currentDay === newReleasedDay
    ) {
        await openDay(
            newReleasedDay
        );
        return;
    }

    renderDayGrid();

    /*
      Automatically open the newly released lesson
      after 06:00 when the app is left open.
    */

    if (
        newReleasedDay > 0 &&
        newReleasedDay !== currentDay
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

                setLoading(true);

                await loadConfig();

                setLoading(false);

                renderDayGrid();

                const released =
                    getReleaseDay();

                if (released > 0) {
                    await openDay(
                        released
                    );
                }

            } catch (error) {

                console.error(
                    error
                );

                setLoading(false);

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

            if (!deferredInstallPrompt) {
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

if ("serviceWorker" in navigator) {

    window.addEventListener(
        "load",
        () => {

            navigator.serviceWorker
                .register("./sw.js")
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

        injectLessonStyles();

        setLoading(true);

        await loadConfig();

        setLoading(false);

        /*
          Build the 365-day grid from the number
          in config — NOT from syllabus.json.
        */
        renderDayGrid();

        /*
          If a lesson has been released today,
          load that day's generated JSON immediately.
        */
        const releasedDay =
            getReleaseDay();

        if (releasedDay > 0) {

            await openDay(
                releasedDay
            );
        }

        /*
          Keep the app synchronized if it remains
          open across the daily 06:00 IST release.
        */
        scheduleNextRelease();

    } catch (error) {

        console.error(
            "Vidhwaan NEET startup error:",
            error
        );

        setLoading(false);

        showError(
            error?.message ||
            "Unable to start Vidhwaan NEET."
        );
    }
}

startApp();

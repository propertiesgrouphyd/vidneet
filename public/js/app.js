/* ============================================================
   VIDHWAAN NEET — PRODUCTION FRONTEND
   ============================================================

   FRONTEND:
   - syllabus.json is NEVER loaded by the student app.
   - Daily generated JSON is the only lesson source.

   RELEASE:
   Day 1   = 2026-08-30 06:00 IST
   Day 2   = 2026-08-31 06:00 IST
   Day 3   = 2026-09-01 06:00 IST
   ...
   Day 365 = start date + 364 days at 06:00 IST

   IMPORTANT UX:
   - App opens to the day grid.
   - App NEVER automatically opens a lesson.
   - Student must click a released day.
   - Released days remain available permanently.
   - At the next 06:00 IST, the new day becomes available.
   - If the app is already open, only the day grid/status is refreshed.
   - The student is NEVER forced into a lesson.

   DAILY FILES:
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

const dayGrid = document.getElementById("day-grid");
const loadingState = document.getElementById("loading-state");
const errorState = document.getElementById("error-state");
const errorMessage = document.getElementById("error-message");
const syllabusSummary = document.getElementById("syllabus-summary");
const todayBadgeText = document.getElementById("today-badge-text");
const releaseStatusText = document.getElementById("release-status-text");
const retryButton = document.getElementById("retry-button");
const installButton = document.getElementById("install-button");

/* ============================================================
   SAFE HTML
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
   IST CLOCK
   ============================================================ */

function getISTParts(date = new Date()) {
    const parts = new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Kolkata",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hourCycle: "h23"
    }).formatToParts(date);

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

function parseDateOnly(value) {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value));

    if (!match) {
        throw new Error(`Invalid course start date: ${value}`);
    }

    return new Date(
        Date.UTC(
            Number(match[1]),
            Number(match[2]) - 1,
            Number(match[3])
        )
    );
}

function differenceInDays(startDateString, currentDateString) {
    const start = parseDateOnly(startDateString);
    const current = parseDateOnly(currentDateString);

    return Math.floor(
        (current.getTime() - start.getTime()) / 86400000
    );
}

/* ============================================================
   RELEASE CALCULATION
   ============================================================

   30 Aug 2026:
     05:59 -> 0 days
     06:00 -> Day 1

   31 Aug 2026:
     05:59 -> Day 1
     06:00 -> Day 2

   Released days NEVER disappear.
   ============================================================ */

function getCourseStartDate() {
    return (
        config?.courseStartDate ||
        config?.releaseStartDate ||
        config?.programStartDateIST ||
        DEFAULT_START_DATE
    );
}

function getActivationHour() {
    return Number(
        config?.dailyActivationHourIST ??
        config?.publishHour ??
        DEFAULT_ACTIVATION_HOUR
    );
}

function getTotalDays() {
    return Number(
        config?.totalDays ||
        DEFAULT_TOTAL_DAYS
    );
}

function getReleaseDay() {
    const now = getISTParts();

    const startDate = getCourseStartDate();
    const activationHour = getActivationHour();
    const totalDays = getTotalDays();

    const today = getISTDateString();

    const calendarOffset = differenceInDays(
        startDate,
        today
    );

    if (calendarOffset < 0) {
        return 0;
    }

    let releasedDay = calendarOffset + 1;

    /*
       Before 06:00 IST, today's new lesson
       has not yet been released.
    */
    if (now.hour < activationHour) {
        releasedDay -= 1;
    }

    return Math.min(
        Math.max(releasedDay, 0),
        totalDays
    );
}

/* ============================================================
   NEXT RELEASE STATUS
   ============================================================ */

function getNextReleaseText() {
    const releasedDay = getReleaseDay();
    const totalDays = getTotalDays();

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
    const separator = url.includes("?") ? "&" : "?";

    const response = await fetch(
        `${url}${separator}v=${Date.now()}`,
        {
            method: "GET",
            cache: "no-store",
            headers: {
                "Cache-Control": "no-cache, no-store, must-revalidate",
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
   CONFIG
   ============================================================ */

async function loadConfig() {
    const loaded = await fetchJSON(CONFIG_URL);

    if (!loaded || typeof loaded !== "object") {
        throw new Error(
            "Invalid app configuration."
        );
    }

    config = loaded;

    config.totalDays = Number(
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
    return `./data/day-${String(dayNumber).padStart(3, "0")}.json`;
}

/* ============================================================
   LOAD ONE DAILY LESSON
   ============================================================ */

async function loadDay(dayNumber) {
    const releasedDay = getReleaseDay();

    if (
        !Number.isInteger(dayNumber) ||
        dayNumber < 1 ||
        dayNumber > releasedDay
    ) {
        throw new Error(
            `Day ${dayNumber} is not released yet.`
        );
    }

    const lesson = await fetchJSON(
        getDayURL(dayNumber)
    );

    if (
        !lesson ||
        typeof lesson !== "object"
    ) {
        throw new Error(
            `Invalid JSON for Day ${dayNumber}.`
        );
    }

    if (Number(lesson.day) !== Number(dayNumber)) {
        throw new Error(
            `Lesson mismatch: requested Day ${dayNumber}, received Day ${lesson.day}.`
        );
    }

    return lesson;
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
            .map(item => renderText(item))
            .join("<br>");
    }

    return escapeHTML(value)
        .replace(/\n/g, "<br>");
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
            ${items.map(item => `
                <li>${renderText(item)}</li>
            `).join("")}
        </ul>
    `;
}

/* ============================================================
   MCQ OPTION LETTER
   ============================================================ */

function optionLetter(index) {
    return String.fromCharCode(65 + index);
}

/* ============================================================
   MCQ RENDERER
   ============================================================

   IMPORTANT:
   Answer and explanation are hidden initially.

   Clicking an option:
     correct -> green
     wrong   -> red
     correct option -> green
     answer/explanation -> visible

   The question becomes locked after answering.
   ============================================================ */

function renderMCQ(mcq, index) {
    const options = Array.isArray(mcq?.options)
        ? mcq.options.slice(0, 4)
        : [];

    const question = mcq?.question || "";

    const correctAnswer = String(
        mcq?.correctAnswer ?? ""
    ).trim();

    const explanation = mcq?.explanation || "";

    if (
        !question ||
        options.length !== 4 ||
        !correctAnswer
    ) {
        return `
            <article class="neet-mcq-card neet-mcq-invalid">
                <div class="neet-mcq-number">
                    Question ${index + 1}
                </div>
                <p>Unable to display this question.</p>
            </article>
        `;
    }

    return `
        <article
            class="neet-mcq-card"
            data-mcq-index="${index}"
            data-correct-answer="${escapeHTML(correctAnswer)}"
        >
            <div class="neet-mcq-number">
                Question ${index + 1}
            </div>

            <div class="neet-mcq-question">
                ${renderText(question)}
            </div>

            <div class="neet-options" role="radiogroup">
                ${options.map((option, optionIndex) => {
                    const letter = optionLetter(optionIndex);

                    return `
                        <button
                            type="button"
                            class="neet-option"
                            data-option-letter="${letter}"
                            data-option-index="${optionIndex}"
                            aria-label="Option ${letter}"
                        >
                            <span class="neet-option-letter">
                                ${letter}
                            </span>

                            <span class="neet-option-text">
                                ${renderText(option)}
                            </span>

                            <span
                                class="neet-option-result"
                                aria-hidden="true"
                            ></span>
                        </button>
                    `;
                }).join("")}
            </div>

            <div
                class="neet-answer"
                hidden
            >
                <strong>Correct Answer:</strong>
                <span class="neet-answer-value">
                    ${escapeHTML(correctAnswer)}
                </span>
            </div>

            ${
                explanation
                    ? `
                        <div
                            class="neet-explanation"
                            hidden
                        >
                            <strong>Explanation</strong>
                            <div class="neet-explanation-text">
                                ${renderText(explanation)}
                            </div>
                        </div>
                    `
                    : ""
            }
        </article>
    `;
}

/* ============================================================
   ATTACH MCQ INTERACTIONS
   ============================================================ */

function attachMCQHandlers() {
    const cards = document.querySelectorAll(
        ".neet-mcq-card[data-mcq-index]"
    );

    cards.forEach(card => {
        const buttons = card.querySelectorAll(
            ".neet-option"
        );

        const answerBox = card.querySelector(
            ".neet-answer"
        );

        const explanationBox = card.querySelector(
            ".neet-explanation"
        );

        const correctAnswer = String(
            card.dataset.correctAnswer || ""
        ).trim().toUpperCase();

        buttons.forEach(button => {
            button.addEventListener(
                "click",
                () => {
                    /*
                       Prevent answering the same question
                       more than once.
                    */
                    if (
                        card.classList.contains(
                            "answered"
                        )
                    ) {
                        return;
                    }

                    card.classList.add(
                        "answered"
                    );

                    const selected = String(
                        button.dataset.optionLetter || ""
                    ).toUpperCase();

                    const isCorrect =
                        selected === correctAnswer;

                    button.classList.add(
                        isCorrect
                            ? "correct"
                            : "wrong"
                    );

                    button.setAttribute(
                        "aria-checked",
                        "true"
                    );

                    /*
                       If the student selected a wrong
                       answer, explicitly highlight the
                       correct option.
                    */
                    if (!isCorrect) {
                        buttons.forEach(
                            optionButton => {
                                const letter =
                                    String(
                                        optionButton.dataset.optionLetter || ""
                                    ).toUpperCase();

                                if (
                                    letter ===
                                    correctAnswer
                                ) {
                                    optionButton.classList.add(
                                        "correct"
                                    );

                                    optionButton
                                        .setAttribute(
                                            "aria-label",
                                            `Correct answer: Option ${letter}`
                                        );
                                }
                            }
                        );
                    }

                    /*
                       Lock every option after answering.
                    */
                    buttons.forEach(
                        optionButton => {
                            optionButton.disabled = true;
                        }
                    );

                    /*
                       Reveal answer and explanation
                       only after selection.
                    */
                    if (answerBox) {
                        answerBox.hidden = false;
                    }

                    if (explanationBox) {
                        explanationBox.hidden = false;
                    }

                    /*
                       Make the result immediately visible
                       without moving the student away from
                       the question.
                    */
                    card.classList.add(
                        isCorrect
                            ? "answer-correct"
                            : "answer-wrong"
                    );
                }
            );
        });
    });
}

/* ============================================================
   LESSON RENDERER
   ============================================================ */

function renderLesson(lesson) {
    const sections = Array.isArray(
        lesson.sections
    )
        ? lesson.sections
        : [];

    const mcqs = Array.isArray(
        lesson.mcqs
    )
        ? lesson.mcqs
        : [];

    const topicHTML = sections.map(
        (section, index) => {
            const subsections =
                Array.isArray(section?.subsections)
                    ? section.subsections
                    : [];

            return `
                <article class="neet-topic-card">

                    <div class="neet-topic-number">
                        Topic ${index + 1}
                    </div>

                    <h3>
                        ${escapeHTML(
                            section?.heading ||
                            section?.topic ||
                            `Topic ${index + 1}`
                        )}
                    </h3>

                    ${
                        section?.topic &&
                        section?.heading &&
                        section.topic !== section.heading
                            ? `
                                <div class="neet-topic-name">
                                    ${escapeHTML(section.topic)}
                                </div>
                              `
                            : ""
                    }

                    ${
                        section?.content
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
                                                        subsection?.heading ||
                                                        "Key Concept"
                                                    )}
                                                </h4>

                                                <div>
                                                    ${renderText(
                                                        subsection?.content
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
                        Array.isArray(
                            section?.keyPoints
                        ) &&
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
                        Array.isArray(
                            section?.neetTips
                        ) &&
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

    const mcqHTML = mcqs.map(
        (mcq, index) =>
            renderMCQ(mcq, index)
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
                    DAY ${escapeHTML(lesson.day)}
                </div>

                <h2>
                    ${escapeHTML(
                        lesson.title ||
                        `NEET Day ${lesson.day}`
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
                                    lesson.chapter
                                        ? `
                                            ${
                                                lesson.subject
                                                    ? " • "
                                                    : ""
                                            }
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

            ${
                Array.isArray(
                    lesson.neetFocus
                ) &&
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
                Array.isArray(
                    lesson.learningOutcome
                ) &&
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

                ${
                    topicHTML ||
                    `
                        <div class="neet-empty">
                            No lesson sections available.
                        </div>
                    `
                }

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

    attachMCQHandlers();

    const backButton =
        document.getElementById(
            "back-to-days"
        );

    if (backButton) {
        backButton.addEventListener(
            "click",
            () => {
                currentDay = 0;
                renderDayGrid();

                window.scrollTo({
                    top: 0,
                    behavior: "instant"
                });
            }
        );
    }
}

/* ============================================================
   DAY GRID
   ============================================================ */

function renderDayGrid() {
    if (!dayGrid) {
        return;
    }

    const totalDays = getTotalDays();
    const releasedDay = getReleaseDay();

    /*
       IMPORTANT:
       currentDay remains 0 while the grid is displayed.
       This prevents automatic lesson opening.
    */
    currentDay = 0;

    dayGrid.innerHTML = "";

    const fragment =
        document.createDocumentFragment();

    for (
        let day = 1;
        day <= totalDays;
        day++
    ) {
        const button =
            document.createElement("button");

        button.type = "button";
        button.className = "day-button";

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

            button.title =
                `Open Day ${day}`;
        } else {
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

        fragment.appendChild(button);
    }

    dayGrid.appendChild(fragment);

    updateStatus(releasedDay);
}

/* ============================================================
   OPEN DAY
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
            `Please try again.`
        );
    }
}

/* ============================================================
   STATUS
   ============================================================ */

function updateStatus(releasedDay) {
    const totalDays =
        getTotalDays();

    if (releaseStatusText) {
        releaseStatusText.textContent =
            getNextReleaseText();
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
                ? `${releasedDay} of ${totalDays} days available`
                : `Day 1 begins at 6:00 AM IST`;
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
   RELEASE REFRESH
   ============================================================

   If the app stays open across 06:00:
   - refresh day availability
   - DO NOT open the new lesson
   - DO NOT interrupt the student
   ============================================================ */

let releaseTimer = null;

function scheduleNextRelease() {
    if (releaseTimer) {
        clearTimeout(releaseTimer);
    }

    const now = new Date();

    const ist = getISTParts(now);

    /*
       Determine next 06:00 IST.

       Asia/Kolkata is UTC+05:30.
    */
    const targetUTC =
        Date.UTC(
            ist.year,
            ist.month - 1,
            ist.day,
            0,
            30,
            0,
            0
        );

    let target =
        targetUTC;

    /*
       targetUTC above represents 06:00 IST
       for the current IST date.
    */

    if (
        now.getTime() >= target
    ) {
        target += 86400000;
    }

    let delay =
        target - now.getTime();

    if (
        !Number.isFinite(delay) ||
        delay < 1000
    ) {
        delay = 1000;
    }

    /*
       Safety cap:
       never create a timer longer than 24h + 1h.
    */
    delay =
        Math.min(
            delay,
            90000000
        );

    releaseTimer =
        window.setTimeout(
            async () => {
                try {
                    await refreshRelease();
                } catch (error) {
                    console.error(
                        "Release refresh failed:",
                        error
                    );
                }

                scheduleNextRelease();
            },
            delay
        );
}

async function refreshRelease() {
    await loadConfig();

    /*
       IMPORTANT:
       If the student is reading a lesson,
       DO NOT replace it.

       If the student is on the grid,
       update the grid so the newly released
       day becomes clickable.
    */
    if (
        currentDay === 0
    ) {
        renderDayGrid();
    } else {
        /*
           Update only status data internally.
           Do not interrupt the lesson.
        */
        updateStatus(
            getReleaseDay()
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

                /*
                   Retry ALWAYS returns to the
                   day grid. It never auto-opens
                   the latest lesson.
                */
                renderDayGrid();

                window.scrollTo({
                    top: 0,
                    behavior: "instant"
                });

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

            try {
                await deferredInstallPrompt.userChoice;
            } catch (error) {
                console.error(
                    "Install prompt error:",
                    error
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
        setLoading(true);

        await loadConfig();

        /*
           CRITICAL:
           Do NOT call openDay() here.

           The application starts on the
           365-day course grid.
        */
        renderDayGrid();

        setLoading(false);

        /*
           Keep release availability synchronized
           while the app remains open.
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

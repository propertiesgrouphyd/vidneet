const CONFIG_URL = "./data/app-config.json";
const SYLLABUS_URL = "./data/syllabus.json";

const IST_OFFSET_MINUTES = 330;

// IMPORTANT:
// Set this to the actual calendar date on which Day 1 starts.
// Format: YYYY-MM-DD
//
// For the current build we use today's IST date if no explicit
// value is supplied by app-config.json.
const DEFAULT_START_DATE = "2026-08-29";

let syllabus = null;
let config = null;
let deferredInstallPrompt = null;


/* ============================================================
   DOM
   ============================================================ */

const dayGrid = document.getElementById("day-grid");
const loadingState = document.getElementById("loading-state");
const errorState = document.getElementById("error-state");
const errorMessage = document.getElementById("error-message");

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
   IST DATE / TIME
   ============================================================ */

function getISTNow() {
    const now = new Date();

    const utcMillis =
        now.getTime() +
        now.getTimezoneOffset() * 60 * 1000;

    return new Date(
        utcMillis +
        IST_OFFSET_MINUTES * 60 * 1000
    );
}


function formatDateUTC(date) {
    return [
        date.getUTCFullYear(),
        String(date.getUTCMonth() + 1).padStart(2, "0"),
        String(date.getUTCDate()).padStart(2, "0")
    ].join("-");
}


function getISTDateString() {
    return formatDateUTC(getISTNow());
}


function parseDateOnly(dateString) {
    const [year, month, day] =
        dateString.split("-").map(Number);

    return new Date(
        Date.UTC(year, month - 1, day)
    );
}


function differenceInCalendarDays(
    startDateString,
    currentDateString
) {
    const start =
        parseDateOnly(startDateString);

    const current =
        parseDateOnly(currentDateString);

    return Math.floor(
        (current.getTime() - start.getTime()) /
        (24 * 60 * 60 * 1000)
    );
}


/* ============================================================
   RELEASE LOGIC
   ============================================================

   Day N:
       01:00 AM -> JSON may be generated
       06:00 AM -> Day N becomes visible/available

   This frontend NEVER treats the existence of JSON alone
   as proof that the day has been released.
   ============================================================ */

function getReleaseDay() {

    const now = getISTNow();

    const todayString = formatDateUTC(now);

    const configuredStart =
        config?.releaseStartDate ||
        DEFAULT_START_DATE;

    const dayOffset =
        differenceInCalendarDays(
            configuredStart,
            todayString
        );

    const scheduledDay =
        dayOffset + 1;

    const hour = now.getUTCHours();

    // getISTNow() is represented using UTC fields after
    // applying the +05:30 offset.
    const isAfterSixAM =
        hour >= 6;

    if (!isAfterSixAM) {
        return Math.max(0, scheduledDay - 1);
    }

    return scheduledDay;
}


function getReleaseMessage(releasedDay) {

    const now = getISTNow();

    const hour = now.getUTCHours();

    if (hour < 6) {
        return "Next lesson unlocks at 6:00 AM IST";
    }

    if (releasedDay <= 0) {
        return "Day 1 begins at 6:00 AM IST";
    }

    if (releasedDay >= 365) {
        return "All 365 days released";
    }

    return `Day ${releasedDay} available`;
}


/* ============================================================
   SYLLABUS LOADING
   ============================================================ */

async function fetchJSON(url) {

    const response = await fetch(
        `${url}?t=${Date.now()}`,
        {
            method: "GET",
            cache: "no-store",
            headers: {
                "Cache-Control": "no-cache"
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


async function loadApp() {

    setLoading(true);

    try {

        // Network-first / live fetch.
        // We deliberately do not use cached lesson data.
        const [loadedConfig, loadedSyllabus] =
            await Promise.all([
                fetchJSON(CONFIG_URL),
                fetchJSON(SYLLABUS_URL)
            ]);

        config = loadedConfig || {};
        syllabus = loadedSyllabus;

        validateSyllabus();

        render();

        setLoading(false);

    } catch (error) {

        console.error(
            "Vidhwaan NEET loading error:",
            error
        );

        setLoading(false);

        errorState.classList.remove("hidden");

        errorMessage.textContent =
            error?.message ||
            "Unable to load the syllabus.";
    }
}


/* ============================================================
   VALIDATION
   ============================================================ */

function validateSyllabus() {

    if (!syllabus) {
        throw new Error(
            "Syllabus data is empty."
        );
    }

    const days =
        Array.isArray(syllabus)
            ? syllabus
            : syllabus.days;

    if (!Array.isArray(days)) {
        throw new Error(
            "syllabus.json must contain a days array."
        );
    }

    if (days.length !== 365) {
        throw new Error(
            `Expected 365 syllabus days, found ${days.length}.`
        );
    }
}


/* ============================================================
   RENDER
   ============================================================ */

function getDays() {
    return Array.isArray(syllabus)
        ? syllabus
        : syllabus.days;
}


function getDayNumber(day) {

    if (typeof day === "number") {
        return day;
    }

    return Number(day.day);
}


function render() {

    const days = getDays();

    const releasedDay =
        Math.min(
            Math.max(getReleaseDay(), 0),
            365
        );

    const releaseMessage =
        getReleaseMessage(releasedDay);

    releaseStatusText.textContent =
        releaseMessage;

    todayBadgeText.textContent =
        releasedDay > 0
            ? `Day ${releasedDay} released`
            : "Day 1 locked";

    syllabusSummary.textContent =
        releasedDay > 0
            ? `Day ${releasedDay} of 365 released • 0 completed`
            : "Day 1 of 365 • Begins at 6:00 AM IST";

    dayGrid.innerHTML = "";

    for (const day of days) {

        const dayNumber =
            getDayNumber(day);

        const button =
            document.createElement("button");

        button.type = "button";

        button.className = "day-button";

        button.textContent =
            String(dayNumber);

        button.setAttribute(
            "aria-label",
            `Day ${dayNumber}`
        );

        if (dayNumber <= releasedDay) {

            button.classList.add(
                "available"
            );

            if (dayNumber === releasedDay) {
                button.classList.add("today");

                button.setAttribute(
                    "aria-current",
                    "date"
                );
            }

            button.addEventListener(
                "click",
                () => openDay(dayNumber)
            );

        } else {

            button.classList.add(
                "locked"
            );

            button.disabled = true;

            button.title =
                `Day ${dayNumber} is not released yet`;
        }

        dayGrid.appendChild(button);
    }
}


/* ============================================================
   DAY NAVIGATION
   ============================================================ */

function openDay(dayNumber) {

    const releasedDay =
        Math.min(
            Math.max(getReleaseDay(), 0),
            365
        );

    if (dayNumber > releasedDay) {
        return;
    }

    // Lesson route will be implemented in the next phase.
    // Keeping the route deterministic now makes the final
    // architecture simple.
    window.location.href =
        `./day.html?day=${dayNumber}`;
}


/* ============================================================
   LOADING / RETRY
   ============================================================ */

function setLoading(isLoading) {

    if (isLoading) {

        loadingState.style.display =
            "flex";

        errorState.classList.add(
            "hidden"
        );

        dayGrid.innerHTML = "";

    } else {

        loadingState.style.display =
            "none";
    }
}


retryButton.addEventListener(
    "click",
    () => loadApp()
);


/* ============================================================
   PWA INSTALL
   ============================================================ */

window.addEventListener(
    "beforeinstallprompt",
    (event) => {

        event.preventDefault();

        deferredInstallPrompt =
            event;

        installButton.classList.remove(
            "hidden"
        );
    }
);


installButton.addEventListener(
    "click",
    async () => {

        if (!deferredInstallPrompt) {
            return;
        }

        deferredInstallPrompt.prompt();

        await deferredInstallPrompt.userChoice;

        deferredInstallPrompt = null;

        installButton.classList.add(
            "hidden"
        );
    }
);


window.addEventListener(
    "appinstalled",
    () => {

        deferredInstallPrompt = null;

        installButton.classList.add(
            "hidden"
        );
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
                .then((registration) => {

                    console.log(
                        "Vidhwaan NEET service worker registered:",
                        registration.scope
                    );

                })
                .catch((error) => {

                    console.error(
                        "Service worker registration failed:",
                        error
                    );

                });
        }
    );
}


/* ============================================================
   START
   ============================================================ */

loadApp();

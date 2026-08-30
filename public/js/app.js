/* ============================================================
   VIDHWAAN NEET — PRODUCTION FRONTEND
   ------------------------------------------------------------
   Responsibilities:
   - Determine released course days from IST
   - Show course day grid on startup
   - Never automatically open a lesson
   - Load only day-NNN.json when a student clicks a day
   - Render structured lesson content
   - Render interactive NEET MCQs
   - Correct answer -> green
   - Wrong answer -> red + correct answer
   - Show explanation after answering
   - English-only frontend
   - No syllabus.json dependency
   ============================================================ */

(() => {
  "use strict";

  /* ----------------------------------------------------------
     CONFIGURATION
     ---------------------------------------------------------- */

  const COURSE_START_DATE = "2026-08-30";
  const ACTIVATION_HOUR_IST = 6;
  const TOTAL_DAYS = 365;

  const DATA_PATH = "./data/day-";

  /* ----------------------------------------------------------
     DOM REFERENCES
     ---------------------------------------------------------- */

  const $ = (selector) => document.querySelector(selector);

  const homeView = $("#home-view");
  const lessonView = $("#lesson-view");
  const dayGrid = $("#day-grid");
  const lessonContent = $("#lesson-content");
  const loadingState = $("#loading-state");
  const errorState = $("#error-state");
  const errorMessage = $("#error-message");
  const retryButton = $("#retry-button");
  const backButton = $("#back-button");
  const installButton = $("#install-button");

  /* ----------------------------------------------------------
     STATE
     ---------------------------------------------------------- */

  let releasedDays = 0;
  let currentDay = null;
  let currentLesson = null;

  let deferredInstallPrompt = null;

  /* ----------------------------------------------------------
     SAFE HTML
     ---------------------------------------------------------- */

  function escapeHtml(value) {
    if (value === null || value === undefined) {
      return "";
    }

    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function text(value) {
    return escapeHtml(value);
  }

  /* ----------------------------------------------------------
     ARRAY HELPERS
     ---------------------------------------------------------- */

  function asArray(value) {
    return Array.isArray(value) ? value : [];
  }

  function hasValue(value) {
    return value !== null &&
      value !== undefined &&
      String(value).trim() !== "";
  }

  /* ----------------------------------------------------------
     IST DATE / COURSE LOGIC
     ---------------------------------------------------------- */

  function getISTNow() {
    const now = new Date();

    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Kolkata",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23"
    }).formatToParts(now);

    const values = {};

    for (const part of parts) {
      if (part.type !== "literal") {
        values[part.type] = part.value;
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

  function utcDateFromISTDate(year, month, day) {
    return new Date(
      Date.UTC(year, month - 1, day)
    );
  }

  function getReleasedDay() {
    const ist = getISTNow();

    const todayUTC = utcDateFromISTDate(
      ist.year,
      ist.month,
      ist.day
    );

    const startParts = COURSE_START_DATE
      .split("-")
      .map(Number);

    const startUTC = utcDateFromISTDate(
      startParts[0],
      startParts[1],
      startParts[2]
    );

    let difference =
      Math.floor(
        (todayUTC.getTime() - startUTC.getTime()) /
        86400000
      );

    if (difference < 0) {
      return 0;
    }

    let dayNumber = difference + 1;

    /*
      Day becomes active at 06:00 IST.

      Example:
      30 Aug before 06:00 -> 0
      30 Aug at/after 06:00 -> Day 1

      31 Aug at/after 06:00 -> Day 2
    */
    if (ist.hour < ACTIVATION_HOUR_IST) {
      dayNumber -= 1;
    }

    return Math.max(
      0,
      Math.min(TOTAL_DAYS, dayNumber)
    );
  }

  function formatDayNumber(day) {
    return String(day).padStart(3, "0");
  }

  function getCourseDate(day) {
    const parts = COURSE_START_DATE
      .split("-")
      .map(Number);

    const start = utcDateFromISTDate(
      parts[0],
      parts[1],
      parts[2]
    );

    start.setUTCDate(
      start.getUTCDate() + day - 1
    );

    return start.toISOString().slice(0, 10);
  }

  function formatDisplayDate(dateString) {
    if (!dateString) {
      return "";
    }

    const date = new Date(`${dateString}T00:00:00Z`);

    if (Number.isNaN(date.getTime())) {
      return text(dateString);
    }

    return new Intl.DateTimeFormat("en-IN", {
      timeZone: "Asia/Kolkata",
      day: "numeric",
      month: "short",
      year: "numeric"
    }).format(date);
  }

  /* ----------------------------------------------------------
     APPLICATION VISIBILITY
     ---------------------------------------------------------- */

  function showHome() {
    if (homeView) {
      homeView.hidden = false;
    }

    if (lessonView) {
      lessonView.hidden = true;
    }

    if (loadingState) {
      loadingState.hidden = true;
    }

    if (errorState) {
      errorState.hidden = true;
    }

    window.scrollTo({
      top: 0,
      behavior: "smooth"
    });
  }

  function showLesson() {
    if (homeView) {
      homeView.hidden = true;
    }

    if (lessonView) {
      lessonView.hidden = false;
    }

    if (loadingState) {
      loadingState.hidden = true;
    }

    if (errorState) {
      errorState.hidden = true;
    }

    window.scrollTo({
      top: 0,
      behavior: "smooth"
    });
  }

  function showLoading() {
    if (homeView) {
      homeView.hidden = true;
    }

    if (lessonView) {
      lessonView.hidden = true;
    }

    if (errorState) {
      errorState.hidden = true;
    }

    if (loadingState) {
      loadingState.hidden = false;
    }
  }

  function showError(message) {
    if (homeView) {
      homeView.hidden = true;
    }

    if (lessonView) {
      lessonView.hidden = true;
    }

    if (loadingState) {
      loadingState.hidden = true;
    }

    if (errorState) {
      errorState.hidden = false;
    }

    if (errorMessage) {
      errorMessage.textContent = message;
    }
  }

  /* ----------------------------------------------------------
     DAY GRID
     ---------------------------------------------------------- */

  function renderDayGrid() {
    if (!dayGrid) {
      return;
    }

    releasedDays = getReleasedDay();

    let html = "";

    for (let day = 1; day <= TOTAL_DAYS; day++) {
      const available = day <= releasedDays;
      const isToday = day === releasedDays && releasedDays > 0;

      const date = getCourseDate(day);

      html += `
        <button
          type="button"
          class="day-card ${available ? "day-card--available" : "day-card--locked"} ${isToday ? "day-card--current" : ""}"
          data-day="${day}"
          ${available ? "" : "disabled"}
          aria-label="${available ? `Open Day ${day}` : `Day ${day} locked`}"
        >
          <span class="day-card__number">
            ${day}
          </span>

          <span class="day-card__body">
            <span class="day-card__title">
              Day ${day}
            </span>

            <span class="day-card__date">
              ${formatDisplayDate(date)}
            </span>
          </span>

          <span class="day-card__status">
            ${
              available
                ? (isToday ? "TODAY" : "OPEN")
                : "LOCKED"
            }
          </span>
        </button>
      `;
    }

    dayGrid.innerHTML = html;

    const summary = $("#syllabus-summary");

    if (summary) {
      if (releasedDays === 0) {
        summary.textContent =
          "Your first lesson will be available at 6:00 AM IST.";
      } else {
        summary.textContent =
          `${releasedDays} of ${TOTAL_DAYS} days available`;
      }
    }

    dayGrid
      .querySelectorAll("[data-day]")
      .forEach((button) => {
        button.addEventListener("click", () => {
          const day = Number(button.dataset.day);

          if (
            Number.isInteger(day) &&
            day >= 1 &&
            day <= releasedDays
          ) {
            loadLesson(day);
          }
        });
      });
  }

  /* ----------------------------------------------------------
     DATA LOADING
     ---------------------------------------------------------- */

  async function fetchLesson(day) {
    const filename =
      `${DATA_PATH}${formatDayNumber(day)}.json`;

    const response = await fetch(
      filename,
      {
        method: "GET",
        cache: "no-cache",
        headers: {
          "Accept": "application/json"
        }
      }
    );

    if (!response.ok) {
      throw new Error(
        `Unable to load Day ${day} content.`
      );
    }

    const data = await response.json();

    if (!data || typeof data !== "object") {
      throw new Error(
        `Day ${day} returned invalid lesson data.`
      );
    }

    if (Number(data.day) !== day) {
      throw new Error(
        `Day ${day} content has incorrect day metadata.`
      );
    }

    return data;
  }

  /* ----------------------------------------------------------
     LESSON RENDERING
     ---------------------------------------------------------- */

  function renderLesson(lesson) {
    if (!lessonContent) {
      return;
    }

    currentLesson = lesson;

    const sections = asArray(lesson.sections);

    const neetFocus = asArray(lesson.neetFocus);
    const learningOutcome = asArray(
      lesson.learningOutcome
    );

    const mcqs = asArray(lesson.mcqs);

    let html = "";

    /* ---------- LESSON HEADER ---------- */

    html += `
      <article class="lesson">

        <header class="lesson-header">

          <div class="lesson-header__day">
            DAY ${text(lesson.day)}
          </div>

          <h1 class="lesson-title">
            ${text(lesson.title || `Day ${lesson.day}`)}
          </h1>

          ${
            hasValue(lesson.subject) ||
            hasValue(lesson.unit) ||
            hasValue(lesson.chapter)
              ? `
                <div class="lesson-meta">
                  ${
                    hasValue(lesson.subject)
                      ? `<span>${text(lesson.subject)}</span>`
                      : ""
                  }

                  ${
                    hasValue(lesson.unit)
                      ? `<span>${text(lesson.unit)}</span>`
                      : ""
                  }

                  ${
                    hasValue(lesson.chapter)
                      ? `<span>${text(lesson.chapter)}</span>`
                      : ""
                  }
                </div>
              `
              : ""
          }

          ${
            hasValue(lesson.introduction)
              ? `
                <div class="lesson-introduction">
                  ${text(lesson.introduction)}
                </div>
              `
              : ""
          }

        </header>
    `;

    /* ---------- LEARNING OUTCOMES ---------- */

    if (learningOutcome.length > 0) {
      html += `
        <section class="lesson-panel lesson-outcomes">
          <div class="section-label">
            LEARNING OUTCOMES
          </div>

          <h2>
            What You Will Learn
          </h2>

          <ul class="content-list">
            ${learningOutcome
              .map(
                (item) =>
                  `<li>${text(item)}</li>`
              )
              .join("")}
          </ul>
        </section>
      `;
    }

    /* ---------- NEET FOCUS ---------- */

    if (neetFocus.length > 0) {
      html += `
        <section class="lesson-panel neet-focus">
          <div class="section-label">
            NEET FOCUS
          </div>

          <h2>
            High-Value Exam Points
          </h2>

          <ul class="content-list">
            ${neetFocus
              .map(
                (item) =>
                  `<li>${text(item)}</li>`
              )
              .join("")}
          </ul>
        </section>
      `;
    }

    /* ---------- SECTIONS ---------- */

    html += `
      <section class="concepts-section">

        <div class="section-heading">
          <div class="section-label">
            CONCEPTS
          </div>

          <h2>
            Learn the Complete Topic
          </h2>

          <p>
            Read each concept carefully before attempting the questions.
          </p>
        </div>
    `;

    if (sections.length === 0) {
      html += `
        <div class="empty-state">
          Lesson concepts are not available.
        </div>
      `;
    } else {
      sections.forEach(
        (section, sectionIndex) => {
          html += renderSection(
            section,
            sectionIndex
          );
        }
      );
    }

    html += `
      </section>
    `;

    /* ---------- MCQS ---------- */

    html += `
      <section class="mcq-section">

        <div class="section-heading">
          <div class="section-label">
            PRACTICE
          </div>

          <h2>
            NEET Practice Questions
          </h2>

          <p>
            Select the best answer. Your result and explanation will appear immediately.
          </p>
        </div>

        <div class="mcq-list">
    `;

    if (mcqs.length === 0) {
      html += `
        <div class="empty-state">
          Practice questions are not available for this lesson.
        </div>
      `;
    } else {
      mcqs.forEach(
        (question, index) => {
          html += renderMcq(
            question,
            index
          );
        }
      );
    }

    html += `
        </div>
      </section>
    `;

    /* ---------- FOOTER NAVIGATION ---------- */

    html += renderLessonNavigation(
      lesson.day
    );

    html += `
      </article>
    `;

    lessonContent.innerHTML = html;

    attachMcqHandlers();
    attachLessonNavigation();
  }

  function renderSection(section, index) {
    const heading =
      section.heading ||
      section.topic ||
      `Concept ${index + 1}`;

    const subsections =
      asArray(section.subsections);

    const keyPoints =
      asArray(section.keyPoints);

    const neetTips =
      asArray(section.neetTips);

    let html = `
      <article class="concept-card">

        <div class="concept-card__number">
          ${String(index + 1).padStart(2, "0")}
        </div>

        <div class="concept-card__content">

          ${
            hasValue(section.topic)
              ? `
                <div class="concept-topic">
                  ${text(section.topic)}
                </div>
              `
              : ""
          }

          <h3 class="concept-heading">
            ${text(heading)}
          </h3>

          ${
            hasValue(section.content)
              ? `
                <div class="concept-content">
                  ${renderParagraphs(section.content)}
                </div>
              `
              : ""
          }
    `;

    if (subsections.length > 0) {
      html += `
        <div class="subsections">
      `;

      subsections.forEach(
        (subsection) => {
          html += `
            <div class="subsection">

              ${
                hasValue(subsection.heading)
                  ? `
                    <h4>
                      ${text(subsection.heading)}
                    </h4>
                  `
                  : ""
              }

              ${
                hasValue(subsection.content)
                  ? `
                    <div class="subsection-content">
                      ${renderParagraphs(subsection.content)}
                    </div>
                  `
                  : ""
              }

            </div>
          `;
        }
      );

      html += `
        </div>
      `;
    }

    if (keyPoints.length > 0) {
      html += `
        <div class="key-points">

          <h4>
            Key Points
          </h4>

          <ul>
            ${keyPoints
              .map(
                (item) =>
                  `<li>${text(item)}</li>`
              )
              .join("")}
          </ul>

        </div>
      `;
    }

    if (neetTips.length > 0) {
      html += `
        <div class="neet-tips">

          <h4>
            NEET Tips
          </h4>

          <ul>
            ${neetTips
              .map(
                (item) =>
                  `<li>${text(item)}</li>`
              )
              .join("")}
          </ul>

        </div>
      `;
    }

    html += `
        </div>
      </article>
    `;

    return html;
  }

  function renderParagraphs(value) {
    const raw = String(value);

    const paragraphs = raw
      .split(/\n{2,}/)
      .map((item) => item.trim())
      .filter(Boolean);

    if (paragraphs.length === 0) {
      return "";
    }

    return paragraphs
      .map(
        (paragraph) =>
          `<p>${text(paragraph)}</p>`
      )
      .join("");
  }

  /* ----------------------------------------------------------
     MCQ RENDERING
     ---------------------------------------------------------- */

  function renderMcq(question, index) {
    const options =
      asArray(question.options);

    const answer =
      normalizeAnswer(
        question.correctAnswer,
        options
      );

    const questionId =
      `mcq-${index + 1}`;

    return `
      <article
        class="mcq-card"
        data-mcq-index="${index}"
        data-correct-answer="${text(answer)}"
      >

        <div class="mcq-number">
          QUESTION ${index + 1}
        </div>

        <h3 class="mcq-question">
          ${text(question.question || "")}
        </h3>

        <div class="mcq-options">

          ${options
            .map(
              (option, optionIndex) => {
                const letter =
                  String.fromCharCode(
                    65 + optionIndex
                  );

                return `
                  <button
                    type="button"
                    class="mcq-option"
                    data-option="${letter}"
                    data-value="${text(option)}"
                    aria-label="Option ${letter}"
                  >

                    <span class="mcq-option__letter">
                      ${letter}
                    </span>

                    <span class="mcq-option__text">
                      ${text(option)}
                    </span>

                    <span
                      class="mcq-option__indicator"
                      aria-hidden="true"
                    ></span>

                  </button>
                `;
              }
            )
            .join("")}

        </div>

        <div
          class="mcq-result"
          hidden
          id="${questionId}-result"
        >
          <div class="mcq-result__status"></div>

          ${
            hasValue(question.explanation)
              ? `
                <div class="mcq-explanation">
                  <strong>Explanation</strong>
                  <p>
                    ${text(question.explanation)}
                  </p>
                </div>
              `
              : ""
          }
        </div>

      </article>
    `;
  }

  function normalizeAnswer(answer, options) {
    if (!hasValue(answer)) {
      return "";
    }

    const value = String(answer).trim();

    if (
      /^[A-D]$/i.test(value)
    ) {
      return value.toUpperCase();
    }

    const index =
      options.findIndex(
        (option) =>
          String(option).trim().toLowerCase() ===
          value.toLowerCase()
      );

    if (index >= 0) {
      return String.fromCharCode(
        65 + index
      );
    }

    return value.toUpperCase();
  }

  function attachMcqHandlers() {
    const cards =
      document.querySelectorAll(
        ".mcq-card"
      );

    cards.forEach((card) => {
      const options =
        card.querySelectorAll(
          ".mcq-option"
        );

      const correct =
        String(
          card.dataset.correctAnswer || ""
        ).toUpperCase();

      const result =
        card.querySelector(
          ".mcq-result"
        );

      const status =
        card.querySelector(
          ".mcq-result__status"
        );

      let answered = false;

      options.forEach((option) => {
        option.addEventListener(
          "click",
          () => {
            if (answered) {
              return;
            }

            answered = true;

            const selected =
              String(
                option.dataset.option || ""
              ).toUpperCase();

            options.forEach(
              (item) => {
                item.disabled = true;
              }
            );

            const correctOption =
              card.querySelector(
                `[data-option="${CSS.escape(correct)}"]`
              );

            if (selected === correct) {
              option.classList.add(
                "is-correct"
              );

              if (status) {
                status.textContent =
                  "✓ Correct answer";
                status.classList.add(
                  "is-correct"
                );
              }
            } else {
              option.classList.add(
                "is-wrong"
              );

              if (correctOption) {
                correctOption.classList.add(
                  "is-correct"
                );
              }

              if (status) {
                status.textContent =
                  `✗ Incorrect. Correct answer: ${correct}`;
                status.classList.add(
                  "is-wrong"
                );
              }
            }

            if (result) {
              result.hidden = false;
              result.classList.add(
                "is-visible"
              );
            }
          }
        );
      });
    });
  }

  /* ----------------------------------------------------------
     LESSON NAVIGATION
     ---------------------------------------------------------- */

  function renderLessonNavigation(day) {
    const previous =
      day > 1 ? day - 1 : null;

    const next =
      day < releasedDays
        ? day + 1
        : null;

    return `
      <nav
        class="lesson-navigation"
        aria-label="Lesson navigation"
      >

        ${
          previous
            ? `
              <button
                type="button"
                class="lesson-nav-button"
                data-nav-day="${previous}"
              >
                <span>←</span>
                <span>
                  Day ${previous}
                </span>
              </button>
            `
            : `
              <button
                type="button"
                class="lesson-nav-button"
                disabled
              >
                <span>←</span>
                <span>First Day</span>
              </button>
            `
        }

        <button
          type="button"
          class="lesson-nav-button lesson-nav-button--home"
          data-nav-home="true"
        >
          All Days
        </button>

        ${
          next
            ? `
              <button
                type="button"
                class="lesson-nav-button"
                data-nav-day="${next}"
              >
                <span>
                  Day ${next}
                </span>
                <span>→</span>
              </button>
            `
            : `
              <button
                type="button"
                class="lesson-nav-button"
                disabled
              >
                <span>Next Day</span>
                <span>→</span>
              </button>
            `
        }

      </nav>
    `;
  }

  function attachLessonNavigation() {
    document
      .querySelectorAll(
        "[data-nav-day]"
      )
      .forEach((button) => {
        button.addEventListener(
          "click",
          () => {
            const day =
              Number(
                button.dataset.navDay
              );

            if (
              Number.isInteger(day) &&
              day >= 1 &&
              day <= releasedDays
            ) {
              loadLesson(day);
            }
          }
        );
      });

    document
      .querySelectorAll(
        "[data-nav-home]"
      )
      .forEach((button) => {
        button.addEventListener(
          "click",
          showHome
        );
      });
  }

  /* ----------------------------------------------------------
     LOAD LESSON
     ---------------------------------------------------------- */

  async function loadLesson(day) {
    if (
      !Number.isInteger(day) ||
      day < 1 ||
      day > TOTAL_DAYS
    ) {
      return;
    }

    /*
      Safety check:
      A future day can never be opened before
      its 06:00 IST activation time.
    */
    releasedDays = getReleasedDay();

    if (day > releasedDays) {
      return;
    }

    currentDay = day;

    showLoading();

    try {
      const lesson =
        await fetchLesson(day);

      renderLesson(lesson);
      showLesson();
    } catch (error) {
      console.error(
        "Vidhwaan NEET lesson loading error:",
        error
      );

      showError(
        error?.message ||
        `Unable to load Day ${day}.`
      );
    }
  }

  /* ----------------------------------------------------------
     RETRY
     ---------------------------------------------------------- */

  if (retryButton) {
    retryButton.addEventListener(
      "click",
      () => {
        if (currentDay) {
          loadLesson(currentDay);
        } else {
          showHome();
          renderDayGrid();
        }
      }
    );
  }

  /* ----------------------------------------------------------
     BACK BUTTON
     ---------------------------------------------------------- */

  if (backButton) {
    backButton.addEventListener(
      "click",
      showHome
    );
  }

  /* ----------------------------------------------------------
     PWA INSTALL
     ---------------------------------------------------------- */

  window.addEventListener(
    "beforeinstallprompt",
    (event) => {
      event.preventDefault();

      deferredInstallPrompt = event;

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
          console.warn(
            "PWA install prompt error:",
            error
          );
        }

        deferredInstallPrompt = null;

        installButton.classList.add(
          "hidden"
        );
      }
    );
  }

  window.addEventListener(
    "appinstalled",
    () => {
      deferredInstallPrompt = null;

      if (installButton) {
        installButton.classList.add(
          "hidden"
        );
      }
    }
  );

  /* ----------------------------------------------------------
     SERVICE WORKER
     ---------------------------------------------------------- */

  if (
    "serviceWorker" in navigator
  ) {
    window.addEventListener(
      "load",
      () => {
        navigator.serviceWorker
          .register("./sw.js")
          .catch((error) => {
            console.warn(
              "Service worker registration failed:",
              error
            );
          });
      }
    );
  }

  /* ----------------------------------------------------------
     MIDNIGHT / 06:00 REFRESH
     ---------------------------------------------------------- */

  function scheduleCourseRefresh() {
    /*
      Re-render periodically so a student who leaves the
      application open through 06:00 IST gets the next day.
    */
    setInterval(
      () => {
        const newReleasedDays =
          getReleasedDay();

        if (
          newReleasedDays !== releasedDays &&
          !currentLesson
        ) {
          renderDayGrid();
        }
      },
      60 * 1000
    );
  }

  /* ----------------------------------------------------------
     INITIALIZE
     ---------------------------------------------------------- */

  function init() {
    /*
      Critical:
      NEVER automatically call loadLesson().
      Startup always shows the day-selection screen.
    */

    currentDay = null;
    currentLesson = null;

    showHome();
    renderDayGrid();
    scheduleCourseRefresh();

    console.log(
      "VIDHWAAN NEET frontend initialized."
    );

    console.log(
      `Released days: ${getReleasedDay()} / ${TOTAL_DAYS}`
    );
  }

  if (
    document.readyState === "loading"
  ) {
    document.addEventListener(
      "DOMContentLoaded",
      init,
      { once: true }
    );
  } else {
    init();
  }

})();

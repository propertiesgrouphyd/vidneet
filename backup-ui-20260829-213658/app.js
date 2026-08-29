const CONFIG_URL = "data/app-config.json";
const SYLLABUS_URL = "data/syllabus.json";

const state = {
  config: null,
  syllabus: null,
  currentDay: 1,
  completedDays: new Set()
};

const el = {
  home: document.getElementById("homeScreen"),
  lesson: document.getElementById("lessonScreen"),
  grid: document.getElementById("daysGrid"),
  progress: document.getElementById("dayProgressText"),
  today: document.getElementById("todayLabel"),
  lessonContainer: document.getElementById("lessonContainer"),
  back: document.getElementById("backButton")
};


/* ==========================================================
   IST DATE
   ========================================================== */

function getISTDate() {

  const parts =
    new Intl.DateTimeFormat(
      "en-CA",
      {
        timeZone: "Asia/Kolkata",
        year: "numeric",
        month: "2-digit",
        day: "2-digit"
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
    day: Number(result.day)
  };
}


/* ==========================================================
   CURRICULUM DAY
   ========================================================== */

function calculateDay(startDate) {

  const today = getISTDate();

  const [year, month, day] =
    startDate.split("-").map(Number);

  const startUTC =
    Date.UTC(
      year,
      month - 1,
      day
    );

  const todayUTC =
    Date.UTC(
      today.year,
      today.month - 1,
      today.day
    );

  const difference =
    Math.floor(
      (todayUTC - startUTC) / 86400000
    );

  return difference + 1;
}


/*
 * Important:
 *
 * Day activation is date based.
 *
 * 29 Aug 2026 = Day 1
 * 30 Aug 2026 = Day 2
 * 31 Aug 2026 = Day 3
 * ...
 *
 * The GitHub Actions workflow will generate the day's
 * JSON at 1 AM IST and the frontend becomes eligible
 * for that day from 6 AM IST.
 */

function getReleasedDay() {

  const calculated =
    calculateDay(
      state.config.programStartDateIST
    );

  return Math.max(
    1,
    Math.min(
      calculated,
      state.config.totalDays
    )
  );
}


/* ==========================================================
   LOCAL PROGRESS
   ========================================================== */

function loadProgress() {

  try {

    const raw =
      localStorage.getItem(
        "vidhwaan-neet-completed-days"
      );

    if (!raw) return;

    const values =
      JSON.parse(raw);

    if (!Array.isArray(values)) return;

    state.completedDays =
      new Set(
        values
          .map(Number)
          .filter(
            day =>
              Number.isInteger(day) &&
              day >= 1 &&
              day <= 365
          )
      );

  } catch {

    state.completedDays =
      new Set();

  }
}


function saveProgress() {

  localStorage.setItem(
    "vidhwaan-neet-completed-days",
    JSON.stringify(
      [...state.completedDays]
        .sort((a,b) => a-b)
    )
  );
}


/* ==========================================================
   DAY UNLOCK LOGIC
   ========================================================== */

function getAvailableDay(releasedDay) {

  let day = 1;

  while (
    day <= releasedDay &&
    state.completedDays.has(day)
  ) {

    day++;

  }

  return Math.min(
    day,
    releasedDay
  );
}


/* ==========================================================
   DAY GRID
   ========================================================== */

function renderDays() {

  el.grid.innerHTML = "";

  const releasedDay =
    getReleasedDay();

  state.currentDay =
    releasedDay;

  const availableDay =
    getAvailableDay(
      releasedDay
    );

  el.today.textContent =
    `Day ${releasedDay} available`;

  el.progress.textContent =
    `Day ${releasedDay} of 365 released • ` +
    `${state.completedDays.size} completed`;

  for (
    let day = 1;
    day <= state.config.totalDays;
    day++
  ) {

    const button =
      document.createElement("button");

    button.type = "button";
    button.className = "day-button";

    button.textContent = day;

    const completed =
      state.completedDays.has(day);

    const released =
      day <= releasedDay;

    const available =
      released &&
      (
        completed ||
        day === availableDay
      );

    if (completed) {

      button.classList.add(
        "completed"
      );

      button.title =
        `Day ${day} completed`;

    } else if (
      day === availableDay
    ) {

      button.classList.add(
        "available"
      );

      if (day === releasedDay) {

        button.classList.add(
          "today"
        );

      }

      button.title =
        `Open Day ${day}`;

    } else {

      button.classList.add(
        "locked"
      );

      button.disabled = true;

      if (!released) {

        button.title =
          "This day will unlock according to the daily schedule";

      } else {

        button.title =
          "Complete the previous available day first";

      }

    }

    if (available) {

      button.addEventListener(
        "click",
        () => openDay(day)
      );

    }

    el.grid.appendChild(button);
  }
}


/* ==========================================================
   DAY CONTENT
   ========================================================== */

async function openDay(day) {

  const releasedDay =
    getReleasedDay();

  const availableDay =
    getAvailableDay(
      releasedDay
    );

  if (
    day > releasedDay ||
    (
      !state.completedDays.has(day) &&
      day !== availableDay
    )
  ) {

    return;

  }

  el.home.classList.add(
    "hidden"
  );

  el.lesson.classList.remove(
    "hidden"
  );

  window.scrollTo({
    top: 0,
    behavior: "smooth"
  });

  el.lessonContainer.innerHTML = `
    <div class="lesson-header">
      <div class="lesson-day">
        DAY ${day}
      </div>

      <h1 class="lesson-title">
        Loading lesson...
      </h1>

      <p class="lesson-meta">
        Fetching today's live content.
      </p>
    </div>
  `;

  const file =
    `data/days/day-${String(day).padStart(3,"0")}.json`;

  try {

    const response =
      await fetch(
        `${file}?live=${Date.now()}`,
        {
          cache: "no-store"
        }
      );

    if (!response.ok) {

      throw new Error(
        `HTTP ${response.status}`
      );

    }

    const content =
      await response.json();

    renderLesson(
      content
    );

  } catch (error) {

    console.error(error);

    el.lessonContainer.innerHTML = `
      <div class="lesson-header">

        <div class="lesson-day">
          DAY ${day}
        </div>

        <h1 class="lesson-title">
          Today's lesson is being prepared
        </h1>

        <p class="lesson-meta">
          The daily content file is not available yet.
          Please check again after the scheduled generation.
        </p>

      </div>
    `;

  }
}


/* ==========================================================
   LESSON RENDERING
   ========================================================== */

function renderLesson(content) {

  window.__VIDHWAAN_CONTENT__ =
    content;

  let html = `
    <section class="lesson-header">

      <div class="lesson-day">
        DAY ${escapeHTML(content.day)}
      </div>

      <h1 class="lesson-title">
        ${escapeHTML(
          content.title ||
          "Today's NEET Lesson"
        )}
      </h1>

      <div class="lesson-meta">
        ${escapeHTML(
          content.chapter || ""
        )}
      </div>

    </section>
  `;

  const subjects =
    Array.isArray(content.subjects)
      ? content.subjects
      : [];

  let topicNumber = 0;

  for (const subject of subjects) {

    html += `
      <section>

        <div class="section-heading">

          <div>
            <h2>
              ${escapeHTML(
                subject.subject || ""
              )}
            </h2>
          </div>

        </div>
    `;

    const topics =
      Array.isArray(subject.topics)
        ? subject.topics
        : [];

    for (const topic of topics) {

      topicNumber++;

      html += `
        <article class="topic-card">

          <div class="topic-number">
            Topic ${topicNumber}
          </div>

          <h3>
            ${escapeHTML(
              topic.title || ""
            )}
          </h3>

          <div class="topic-content">
      `;

      if (topic.introduction) {

        html += `
          <h4>
            Simple Meaning
          </h4>

          <p>
            ${formatText(
              topic.introduction
            )}
          </p>
        `;

      }

      if (topic.explanation) {

        html += `
          <h4>
            Explanation
          </h4>

          <p>
            ${formatText(
              topic.explanation
            )}
          </p>
        `;

      }

      if (
        Array.isArray(topic.key_points) &&
        topic.key_points.length
      ) {

        html += `
          <h4>
            Key Points
          </h4>

          <ul class="key-points">

            ${topic.key_points
              .map(
                point =>
                  `<li>${formatText(point)}</li>`
              )
              .join("")}

          </ul>
        `;

      }

      if (topic.example) {

        html += `
          <h4>
            Example
          </h4>

          <p>
            ${formatText(
              topic.example
            )}
          </p>
        `;

      }

      if (topic.neet_focus) {

        html += `
          <h4>
            NEET Focus
          </h4>

          <p>
            ${formatText(
              topic.neet_focus
            )}
          </p>
        `;

      }

      if (topic.remember) {

        html += `
          <div class="remember-box">

            <strong>
              Remember
            </strong>

            <br>

            ${formatText(
              topic.remember
            )}

          </div>
        `;

      }

      html += `
          </div>
        </article>
      `;

    }

    html += `
      </section>
    `;

  }

  html +=
    renderMCQs(
      content.practice
    );

  html += `
    <button
      id="completeDayButton"
      class="complete-button"
      type="button"
    >
      ✓ Complete Day ${escapeHTML(content.day)}
    </button>
  `;

  el.lessonContainer.innerHTML =
    html;

  attachMCQHandlers();

  document
    .getElementById(
      "completeDayButton"
    )
    ?.addEventListener(
      "click",
      () => {

        const day =
          Number(content.day);

        if (
          Number.isInteger(day) &&
          day >= 1 &&
          day <= 365
        ) {

          state.completedDays.add(
            day
          );

          saveProgress();

          renderDays();

          el.lesson.classList.add(
            "hidden"
          );

          el.home.classList.remove(
            "hidden"
          );

          window.scrollTo({
            top: 0,
            behavior: "smooth"
          });

        }

      }
    );
}


/* ==========================================================
   MCQ
   ========================================================== */

function renderMCQs(practice) {

  if (
    !practice ||
    !Array.isArray(
      practice.questions
    ) ||
    !practice.questions.length
  ) {

    return "";

  }

  return `
    <section class="mcq-section">

      <h2>
        Practice MCQs
      </h2>

      <p class="lesson-meta">
        Practice these questions in
        NEET examination style.
      </p>

      <div id="mcqContainer">

        ${practice.questions
          .map(
            (question,index) => `

            <article
              class="mcq-card"
              data-question="${index}"
              data-answer="${Number(
                question.correct_answer
              )}"
            >

              <div class="mcq-question">
                ${index + 1}.
                ${formatText(
                  question.question
                )}
              </div>

              <div class="mcq-options">

                ${
                  Array.isArray(
                    question.options
                  )
                  ? question.options
                      .map(
                        (option,optionIndex) => `
                          <button
                            type="button"
                            class="mcq-option"
                            data-option="${optionIndex}"
                          >
                            ${String.fromCharCode(
                              65 + optionIndex
                            )}.
                            ${formatText(
                              option
                            )}
                          </button>
                        `
                      )
                      .join("")
                  : ""
                }

              </div>

              <div
                class="mcq-feedback hidden"
                data-feedback
              ></div>

            </article>

          `
          )
          .join("")}

      </div>

      <div
        id="scoreBox"
        class="score-box hidden"
      ></div>

    </section>
  `;
}


function attachMCQHandlers() {

  const cards =
    document.querySelectorAll(
      ".mcq-card"
    );

  let answered = 0;
  let score = 0;

  cards.forEach(card => {

    const correctAnswer =
      Number(
        card.dataset.answer
      );

    const options =
      card.querySelectorAll(
        ".mcq-option"
      );

    const feedback =
      card.querySelector(
        "[data-feedback]"
      );

    options.forEach(option => {

      option.addEventListener(
        "click",
        () => {

          if (
            !feedback.classList.contains(
              "hidden"
            )
          ) {

            return;

          }

          const selected =
            Number(
              option.dataset.option
            );

          options.forEach(
            button => {

              button.disabled =
                true;

              const index =
                Number(
                  button.dataset.option
                );

              if (
                index === correctAnswer
              ) {

                button.classList.add(
                  "correct"
                );

              }

            }
          );

          answered++;

          const questionIndex =
            Number(
              card.dataset.question
            );

          const explanation =
            window
              .__VIDHWAAN_CONTENT__
              ?.practice
              ?.questions
              ?.[questionIndex]
              ?.explanation ||
            "Review this concept again.";

          if (
            selected ===
            correctAnswer
          ) {

            score++;

            feedback.className =
              "mcq-feedback correct";

            feedback.innerHTML = `
              <strong>🟢 Correct!</strong>
              <br><br>
              ${formatText(
                explanation
              )}
            `;

          } else {

            option.classList.add(
              "wrong"
            );

            feedback.className =
              "mcq-feedback wrong";

            feedback.innerHTML = `
              <strong>🔴 Incorrect</strong>

              <br><br>

              Correct answer:
              <strong>
                ${String.fromCharCode(
                  65 + correctAnswer
                )}
              </strong>

              <br><br>

              ${formatText(
                explanation
              )}
            `;

          }

          if (
            answered ===
            cards.length
          ) {

            const scoreBox =
              document.getElementById(
                "scoreBox"
              );

            scoreBox.classList.remove(
              "hidden"
            );

            scoreBox.innerHTML =
              `Practice Complete — Score: ${score}/${cards.length}`;

          }

        }
      );

    });

  });

}


/* ==========================================================
   HELPERS
   ========================================================== */

function escapeHTML(value) {

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


function formatText(value) {

  return escapeHTML(value)
    .replace(
      /\n/g,
      "<br>"
    );
}


/* ==========================================================
   BACK
   ========================================================== */

el.back.addEventListener(
  "click",
  () => {

    el.lesson.classList.add(
      "hidden"
    );

    el.home.classList.remove(
      "hidden"
    );

    window.scrollTo({
      top: 0,
      behavior: "smooth"
    });

  }
);


/* ==========================================================
   PWA
   ========================================================== */

if (
  "serviceWorker" in navigator
) {

  window.addEventListener(
    "load",
    () => {

      navigator
        .serviceWorker
        .register(
          "./sw.js",
          {
            updateViaCache: "none"
          }
        )
        .catch(
          error =>
            console.error(
              "Service worker registration failed:",
              error
            )
        );

    }
  );

}


/* ==========================================================
   INITIALIZATION
   ========================================================== */

async function init() {

  try {

    const [
      configResponse,
      syllabusResponse
    ] =
      await Promise.all([

        fetch(
          `${CONFIG_URL}?live=${Date.now()}`,
          {
            cache: "no-store"
          }
        ),

        fetch(
          `${SYLLABUS_URL}?live=${Date.now()}`,
          {
            cache: "no-store"
          }
        )

      ]);

    if (
      !configResponse.ok ||
      !syllabusResponse.ok
    ) {

      throw new Error(
        "Unable to load application data"
      );

    }

    state.config =
      await configResponse.json();

    state.syllabus =
      await syllabusResponse.json();

    if (
      !Array.isArray(
        state.syllabus.days
      ) ||
      state.syllabus.days.length !== 365
    ) {

      throw new Error(
        "Invalid 365-day syllabus"
      );

    }

    loadProgress();

    renderDays();

  } catch (error) {

    console.error(
      "Vidhwaan NEET initialization error:",
      error
    );

    el.today.textContent =
      "Unable to load";

    el.progress.textContent =
      "Please refresh the application.";

  }

}


init();

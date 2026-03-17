import { STARTER_DECK } from "./deck.js";

const STORAGE_KEY = "hanzi-sprint-v1";
const DEFAULT_DAILY_LIMIT = 10;
const MIN_DAILY_LIMIT = 1;
const MAX_DAILY_LIMIT = 20;
const LEARNING_OFFSETS = {
  again: 1,
  hard: 3,
  good: 5
};

const dom = {};
const ui = {
  revealed: false,
  currentCardId: null
};

let state = loadState();

init();

function init() {
  bindDom();
  upgradeState();
  ensureSession();
  bindEvents();
  render();
  registerServiceWorker();
}

function bindDom() {
  dom.newCountValue = document.getElementById("newCountValue");
  dom.newCountNote = document.getElementById("newCountNote");
  dom.queueCountValue = document.getElementById("queueCountValue");
  dom.streakValue = document.getElementById("streakValue");
  dom.streakNote = document.getElementById("streakNote");
  dom.masteredValue = document.getElementById("masteredValue");
  dom.masteredNote = document.getElementById("masteredNote");
  dom.sessionSummary = document.getElementById("sessionSummary");
  dom.studyCard = document.getElementById("studyCard");
  dom.emptyState = document.getElementById("emptyState");
  dom.emptyStateText = document.getElementById("emptyStateText");
  dom.cardStage = document.getElementById("cardStage");
  dom.cardCategory = document.getElementById("cardCategory");
  dom.cardPrompt = document.getElementById("cardPrompt");
  dom.cardHanzi = document.getElementById("cardHanzi");
  dom.cardPinyinFront = document.getElementById("cardPinyinFront");
  dom.cardAnswer = document.getElementById("cardAnswer");
  dom.cardPinyinBack = document.getElementById("cardPinyinBack");
  dom.cardMeaning = document.getElementById("cardMeaning");
  dom.cardHint = document.getElementById("cardHint");
  dom.revealButton = document.getElementById("revealButton");
  dom.gradeButtons = document.getElementById("gradeButtons");
  dom.todayWordList = document.getElementById("todayWordList");
  dom.settingsForm = document.getElementById("settingsForm");
  dom.dailyLimitInput = document.getElementById("dailyLimitInput");
  dom.showPinyinInput = document.getElementById("showPinyinInput");
  dom.resetProgressButton = document.getElementById("resetProgressButton");
  dom.importInput = document.getElementById("importInput");
  dom.importButton = document.getElementById("importButton");
  dom.importStatus = document.getElementById("importStatus");
}

function bindEvents() {
  dom.revealButton.addEventListener("click", () => {
    ui.revealed = true;
    renderStudyCard();
  });

  document.querySelectorAll("[data-grade]").forEach((button) => {
    button.addEventListener("click", () => gradeCurrentCard(button.dataset.grade));
  });

  dom.settingsForm.addEventListener("submit", (event) => {
    event.preventDefault();
    handleSettingsSave();
  });

  dom.importButton.addEventListener("click", handleImport);
  dom.resetProgressButton.addEventListener("click", handleResetProgress);
}

function handleSettingsSave() {
  state.settings.dailyNewLimit = clamp(
    Number.parseInt(dom.dailyLimitInput.value, 10) || DEFAULT_DAILY_LIMIT,
    MIN_DAILY_LIMIT,
    MAX_DAILY_LIMIT
  );
  state.settings.showPinyinOnFront = dom.showPinyinInput.checked;
  ensureSession();
  saveState();
  setStatus(`설정을 저장했습니다. 오늘 새 카드 수는 ${state.session.todaysNewIds.length}개입니다.`);
  render();
}

function handleImport() {
  const raw = dom.importInput.value.trim();
  if (!raw) {
    setStatus("추가할 단어를 먼저 입력하세요.");
    return;
  }

  const lines = raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const timestamp = Date.now();
  const importedCards = [];
  let invalidCount = 0;

  lines.forEach((line, index) => {
    const parts = line.split("|").map((part) => part.trim());
    if (parts.length < 3 || !parts[0] || !parts[1] || !parts[2]) {
      invalidCount += 1;
      return;
    }

    importedCards.push({
      id: `custom-${timestamp}-${index}`,
      hanzi: parts[0],
      pinyin: parts[1],
      meaning: parts[2],
      category: parts[3] || "사용자"
    });
  });

  if (!importedCards.length) {
    setStatus("형식이 맞는 단어가 없습니다. `한자|병음|뜻` 형식인지 확인하세요.");
    return;
  }

  state.customCards.push(...importedCards);
  dom.importInput.value = "";
  ensureSession();
  saveState();

  const invalidSuffix = invalidCount ? `, ${invalidCount}개 줄은 건너뛰었습니다.` : ".";
  setStatus(`${importedCards.length}개 단어를 추가했습니다${invalidSuffix}`);
  render();
}

function handleResetProgress() {
  const confirmed = window.confirm(
    "학습 진행도만 초기화하고, 추가한 단어와 설정은 유지할까요?"
  );

  if (!confirmed) {
    return;
  }

  const preservedCustomCards = [...state.customCards];
  const preservedSettings = { ...state.settings };
  state = createDefaultState();
  state.customCards = preservedCustomCards;
  state.settings = preservedSettings;
  ensureSession();
  saveState();
  setStatus("진행도를 초기화했습니다.");
  render();
}

function gradeCurrentCard(grade) {
  const currentId = state.session.queue.shift();
  if (!currentId) {
    return;
  }

  const progress = getOrCreateProgress(currentId);
  const result = applyGrade(progress, grade);

  state.stats.totalReviews += 1;
  state.session.studiedToday += 1;
  markStudyActivity();

  removeFromArray(state.session.completedIds, currentId);
  removeAllOccurrences(state.session.queue, currentId);

  if (result.repeatToday) {
    insertIntoQueue(currentId, result.offset);
  } else {
    addUnique(state.session.completedIds, currentId);
  }

  ensureSession();
  saveState();
  render();
}

function applyGrade(progress, grade) {
  progress.reviews += 1;
  progress.lastReviewed = state.session.date;
  progress.lastGrade = grade;

  if (progress.phase === "review") {
    return applyReviewGrade(progress, grade);
  }

  if (progress.phase === "learning") {
    return applyLearningGrade(progress, grade);
  }

  return applyNewGrade(progress, grade);
}

function applyNewGrade(progress, grade) {
  progress.phase = "learning";
  progress.dueDate = state.session.date;

  if (grade === "again") {
    progress.learningPasses = 0;
    return { repeatToday: true, offset: LEARNING_OFFSETS.again };
  }

  if (grade === "hard") {
    progress.learningPasses = 0;
    return { repeatToday: true, offset: LEARNING_OFFSETS.hard };
  }

  if (grade === "good") {
    progress.learningPasses = 1;
    return { repeatToday: true, offset: LEARNING_OFFSETS.good };
  }

  graduateToReview(progress, 3);
  return { repeatToday: false, offset: 0 };
}

function applyLearningGrade(progress, grade) {
  progress.dueDate = state.session.date;

  if (grade === "again") {
    progress.learningPasses = 0;
    return { repeatToday: true, offset: LEARNING_OFFSETS.again };
  }

  if (grade === "hard") {
    return { repeatToday: true, offset: LEARNING_OFFSETS.hard };
  }

  if (grade === "good") {
    progress.learningPasses += 1;
    if (progress.learningPasses >= 2) {
      graduateToReview(progress, 1);
      return { repeatToday: false, offset: 0 };
    }

    return { repeatToday: true, offset: 4 };
  }

  graduateToReview(progress, 4);
  return { repeatToday: false, offset: 0 };
}

function applyReviewGrade(progress, grade) {
  if (grade === "again") {
    progress.lapses += 1;
    progress.ease = roundTo(Math.max(1.3, progress.ease - 0.2), 2);
    progress.phase = "learning";
    progress.learningPasses = 0;
    progress.intervalDays = 0;
    progress.dueDate = state.session.date;
    return { repeatToday: true, offset: LEARNING_OFFSETS.again };
  }

  if (grade === "hard") {
    progress.intervalDays = Math.max(1, Math.round(Math.max(1, progress.intervalDays) * 1.2));
    progress.dueDate = addDays(state.session.date, progress.intervalDays);
    return { repeatToday: false, offset: 0 };
  }

  if (grade === "easy") {
    progress.ease = roundTo(Math.min(3.1, progress.ease + 0.15), 2);
    progress.intervalDays = Math.max(
      2,
      Math.round(Math.max(1, progress.intervalDays) * (progress.ease + 0.25))
    );
    progress.dueDate = addDays(state.session.date, progress.intervalDays);
    return { repeatToday: false, offset: 0 };
  }

  progress.intervalDays = Math.max(
    1,
    Math.round(Math.max(1, progress.intervalDays) * Math.max(1.4, progress.ease))
  );
  progress.dueDate = addDays(state.session.date, progress.intervalDays);
  return { repeatToday: false, offset: 0 };
}

function graduateToReview(progress, intervalDays) {
  progress.phase = "review";
  progress.learningPasses = 0;
  progress.intervalDays = intervalDays;
  progress.dueDate = addDays(state.session.date, intervalDays);
}

function ensureSession() {
  const today = getTodayKey();

  if (!state.session || state.session.date !== today) {
    state.session = {
      date: today,
      todaysNewIds: [],
      queue: [],
      completedIds: [],
      studiedToday: 0
    };
  }

  state.session.todaysNewIds = unique(
    state.session.todaysNewIds.filter((id) => Boolean(findCard(id)))
  );
  state.session.queue = unique(state.session.queue.filter((id) => Boolean(findCard(id))));
  state.session.completedIds = unique(
    state.session.completedIds.filter((id) => Boolean(findCard(id)))
  );

  topUpTodaysNewIds();
  seedTodayQueue();
}

function topUpTodaysNewIds() {
  const limit = clamp(
    state.settings.dailyNewLimit || DEFAULT_DAILY_LIMIT,
    MIN_DAILY_LIMIT,
    MAX_DAILY_LIMIT
  );
  const currentIds = [...state.session.todaysNewIds];
  const seen = new Set(currentIds);

  for (const card of getDeck()) {
    if (currentIds.length >= limit) {
      break;
    }

    if (!state.progress[card.id] && !seen.has(card.id)) {
      currentIds.push(card.id);
      seen.add(card.id);
    }
  }

  state.session.todaysNewIds = currentIds;
}

function seedTodayQueue() {
  const queued = new Set(state.session.queue);
  const completed = new Set(state.session.completedIds);

  getDueCardIds().forEach((id) => {
    if (!queued.has(id) && !completed.has(id)) {
      state.session.queue.push(id);
      queued.add(id);
    }
  });

  state.session.todaysNewIds.forEach((id) => {
    if (!state.progress[id] && !queued.has(id) && !completed.has(id)) {
      state.session.queue.push(id);
      queued.add(id);
    }
  });
}

function getDueCardIds() {
  return getDeck()
    .filter((card) => {
      const progress = state.progress[card.id];
      if (!progress) {
        return false;
      }

      if (progress.phase === "learning") {
        return true;
      }

      return progress.phase === "review" && (!progress.dueDate || progress.dueDate <= state.session.date);
    })
    .sort((left, right) => compareProgress(left.id, right.id))
    .map((card) => card.id);
}

function compareProgress(leftId, rightId) {
  const left = state.progress[leftId];
  const right = state.progress[rightId];

  if (left.phase !== right.phase) {
    return left.phase === "learning" ? -1 : 1;
  }

  return (left.dueDate || state.session.date).localeCompare(right.dueDate || state.session.date);
}

function render() {
  renderStats();
  renderSettings();
  renderStudyCard();
  renderTodayWords();
}

function renderStats() {
  const assignedNew = state.session.todaysNewIds.length;
  const completedNew = state.session.todaysNewIds.filter((id) => state.session.completedIds.includes(id)).length;
  const remainingNew = Math.max(assignedNew - completedNew, 0);
  const masteredCount = Object.values(state.progress).filter((progress) => progress.phase === "review").length;

  dom.newCountValue.textContent = `${completedNew} / ${assignedNew}`;
  dom.newCountNote.textContent = assignedNew ? `${remainingNew}개 남음` : "새 카드가 없습니다";
  dom.queueCountValue.textContent = String(state.session.queue.length);
  dom.streakValue.textContent = `${state.stats.streak}일`;
  dom.streakNote.textContent =
    state.stats.lastStudyDate === state.session.date
      ? "오늘 이미 학습했습니다"
      : "오늘 한 번이라도 학습하면 유지";
  dom.masteredValue.textContent = String(masteredCount);
  dom.masteredNote.textContent = `전체 ${getDeck().length}장 중 복습 단계 카드`;
  dom.sessionSummary.textContent = `남은 카드 ${state.session.queue.length}장 · 누적 복습 ${state.stats.totalReviews}회`;
}

function renderSettings() {
  dom.dailyLimitInput.value = String(state.settings.dailyNewLimit);
  dom.showPinyinInput.checked = Boolean(state.settings.showPinyinOnFront);
}

function renderStudyCard() {
  const currentCard = getCurrentCard();

  if (!currentCard) {
    ui.currentCardId = null;
    ui.revealed = false;
    dom.studyCard.hidden = true;
    dom.emptyState.hidden = false;
    dom.emptyStateText.textContent = getEmptyMessage();
    return;
  }

  dom.studyCard.hidden = false;
  dom.emptyState.hidden = true;

  if (ui.currentCardId !== currentCard.id) {
    ui.currentCardId = currentCard.id;
    ui.revealed = false;
  }

  dom.cardStage.textContent = getStageLabel(currentCard.id);
  dom.cardCategory.textContent = currentCard.category || "사용자";
  dom.cardPrompt.textContent = ui.revealed
    ? "이제 기억난 정도를 선택하세요. 선택에 따라 다음 카드 간격이 달라집니다."
    : "먼저 뜻을 떠올려보고, 준비되면 답을 확인하세요.";
  dom.cardHanzi.textContent = currentCard.hanzi;
  dom.cardPinyinFront.textContent = state.settings.showPinyinOnFront ? currentCard.pinyin : "";
  dom.cardPinyinBack.textContent = currentCard.pinyin;
  dom.cardMeaning.textContent = currentCard.meaning;
  dom.cardHint.textContent = buildHint(currentCard);
  dom.cardAnswer.hidden = !ui.revealed;
  dom.revealButton.hidden = ui.revealed;
  dom.gradeButtons.hidden = !ui.revealed;
}

function renderTodayWords() {
  dom.todayWordList.innerHTML = "";

  if (!state.session.todaysNewIds.length) {
    const emptyItem = document.createElement("li");
    emptyItem.className = "word-item";
    emptyItem.textContent = "오늘 배정된 새 카드가 없습니다.";
    dom.todayWordList.appendChild(emptyItem);
    return;
  }

  state.session.todaysNewIds.forEach((id, index) => {
    const card = findCard(id);
    if (!card) {
      return;
    }

    const item = document.createElement("li");
    item.className = "word-item";

    const number = document.createElement("span");
    number.className = "word-index";
    number.textContent = String(index + 1);

    const main = document.createElement("div");
    main.className = "word-main";

    const title = document.createElement("strong");
    title.textContent = card.hanzi;

    const sub = document.createElement("span");
    sub.textContent = `${card.pinyin} · ${card.meaning}`;

    main.append(title, sub);

    const status = document.createElement("span");
    const statusName = getTodayStatus(id);
    status.className = `word-status ${statusName.className}`;
    status.textContent = statusName.label;

    item.append(number, main, status);
    dom.todayWordList.appendChild(item);
  });
}

function getTodayStatus(id) {
  if (state.session.completedIds.includes(id)) {
    return { label: "완료", className: "status-done" };
  }

  if (state.session.queue.includes(id) || state.progress[id]?.phase === "learning") {
    return { label: "진행중", className: "status-active" };
  }

  return { label: "대기", className: "status-ready" };
}

function getStageLabel(id) {
  const progress = state.progress[id];

  if (!progress || progress.phase === "new") {
    return "새 카드";
  }

  if (progress.phase === "learning") {
    return "학습중";
  }

  return "복습 카드";
}

function buildHint(card) {
  const progress = state.progress[card.id];

  if (!progress || progress.phase === "new") {
    return `${card.category || "기초"} 단어입니다. 오늘 두 번 정도 맞히면 복습 카드로 넘어갑니다.`;
  }

  if (progress.phase === "learning") {
    return `${card.category || "기초"} 단어입니다. 오늘 한 번 더 맞히면 내일 복습으로 넘어갈 수 있습니다.`;
  }

  return `${card.category || "기초"} 단어입니다. 현재 간격은 ${progress.intervalDays}일이고, 이번 선택으로 다음 간격이 다시 계산됩니다.`;
}

function getEmptyMessage() {
  const untouchedCount = getDeck().filter((card) => !state.progress[card.id]).length;

  if (!untouchedCount) {
    return "스타터 덱을 모두 배웠습니다. 오른쪽에서 새 단어를 추가해 덱을 계속 늘리세요.";
  }

  return "내일 새 카드가 자동 배정됩니다. 지금은 복습 대기 카드도 모두 비었습니다.";
}

function getCurrentCard() {
  return findCard(state.session.queue[0]);
}

function getDeck() {
  return [...STARTER_DECK, ...state.customCards];
}

function findCard(id) {
  return getDeck().find((card) => card.id === id) || null;
}

function getOrCreateProgress(id) {
  if (!state.progress[id]) {
    state.progress[id] = {
      phase: "new",
      ease: 2.5,
      intervalDays: 0,
      learningPasses: 0,
      dueDate: null,
      lapses: 0,
      reviews: 0,
      lastReviewed: "",
      lastGrade: ""
    };
  }

  return state.progress[id];
}

function markStudyActivity() {
  const today = state.session.date;

  if (state.stats.lastStudyDate === today) {
    return;
  }

  if (state.stats.lastStudyDate && addDays(state.stats.lastStudyDate, 1) === today) {
    state.stats.streak += 1;
  } else {
    state.stats.streak = 1;
  }

  state.stats.lastStudyDate = today;
}

function setStatus(message) {
  dom.importStatus.textContent = message;
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return createDefaultState();
    }

    return { ...createDefaultState(), ...JSON.parse(raw) };
  } catch {
    return createDefaultState();
  }
}

function upgradeState() {
  state.version = 1;
  state.settings = {
    dailyNewLimit: DEFAULT_DAILY_LIMIT,
    showPinyinOnFront: false,
    ...(state.settings || {})
  };
  state.customCards = Array.isArray(state.customCards) ? state.customCards : [];
  state.progress = state.progress && typeof state.progress === "object" ? state.progress : {};
  state.stats = {
    streak: 0,
    lastStudyDate: "",
    totalReviews: 0,
    ...(state.stats || {})
  };
  state.session = {
    date: "",
    todaysNewIds: [],
    queue: [],
    completedIds: [],
    studiedToday: 0,
    ...(state.session || {})
  };
  state.settings.dailyNewLimit = clamp(
    state.settings.dailyNewLimit,
    MIN_DAILY_LIMIT,
    MAX_DAILY_LIMIT
  );
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function createDefaultState() {
  return {
    version: 1,
    settings: {
      dailyNewLimit: DEFAULT_DAILY_LIMIT,
      showPinyinOnFront: false
    },
    customCards: [],
    progress: {},
    stats: {
      streak: 0,
      lastStudyDate: "",
      totalReviews: 0
    },
    session: {
      date: "",
      todaysNewIds: [],
      queue: [],
      completedIds: [],
      studiedToday: 0
    }
  };
}

function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) {
    return;
  }

  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch(() => {});
  });
}

function insertIntoQueue(id, offset) {
  const position = Math.min(offset, state.session.queue.length);
  state.session.queue.splice(position, 0, id);
}

function addUnique(list, value) {
  if (!list.includes(value)) {
    list.push(value);
  }
}

function removeFromArray(list, value) {
  const index = list.indexOf(value);
  if (index >= 0) {
    list.splice(index, 1);
  }
}

function removeAllOccurrences(list, value) {
  let index = list.indexOf(value);
  while (index >= 0) {
    list.splice(index, 1);
    index = list.indexOf(value);
  }
}

function unique(values) {
  return [...new Set(values)];
}

function clamp(value, min, max) {
  return Math.min(Math.max(Number(value) || min, min), max);
}

function roundTo(value, digits) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function getTodayKey() {
  const date = new Date();
  return formatDate(date);
}

function addDays(dateKey, days) {
  const date = new Date(`${dateKey}T12:00:00`);
  date.setDate(date.getDate() + days);
  return formatDate(date);
}

function formatDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

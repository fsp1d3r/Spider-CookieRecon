const STORAGE_KEY = "studyStopwatchState";
const clock = document.getElementById("clock");
const status = document.getElementById("status");
const toggle = document.getElementById("toggle");
const reset = document.getElementById("reset");

function readState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
    return {
      elapsed: Number.isFinite(saved.elapsed) ? saved.elapsed : 0,
      startedAt: Number.isFinite(saved.startedAt) ? saved.startedAt : null,
    };
  } catch {
    return { elapsed: 0, startedAt: null };
  }
}

let state = readState();

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function formatTime(milliseconds) {
  const totalSeconds = Math.floor(milliseconds / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return [hours, minutes, seconds].map((part) => String(part).padStart(2, "0")).join(":");
}

function render() {
  const running = state.startedAt !== null;
  const elapsed = state.elapsed + (running ? Date.now() - state.startedAt : 0);
  clock.textContent = formatTime(elapsed);
  toggle.textContent = running ? "Pause" : state.elapsed ? "Resume" : "Start";
  toggle.classList.toggle("running", running);
  status.textContent = running ? "Study session in progress" : state.elapsed ? "Session paused" : "Ready when you are";
}

toggle.addEventListener("click", () => {
  if (state.startedAt === null) {
    state.startedAt = Date.now();
  } else {
    state.elapsed += Date.now() - state.startedAt;
    state.startedAt = null;
  }
  saveState();
  render();
});

reset.addEventListener("click", () => {
  state = { elapsed: 0, startedAt: null };
  saveState();
  render();
});

render();
setInterval(render, 250);
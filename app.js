const tg = window.Telegram?.WebApp;

const modeSelection = document.getElementById("modeSelection");
const gameSection = document.getElementById("gameSection");
const soloModeButton = document.getElementById("soloModeButton");

const targetColor = document.getElementById("targetColor");
const stageLabel = document.getElementById("stageLabel");
const timer = document.getElementById("timer");
const controls = document.getElementById("controls");
const hueSlider = document.getElementById("hueSlider");
const lightnessSlider = document.getElementById("lightnessSlider");
const guessPreview = document.getElementById("guessPreview");
const submitButton = document.getElementById("submitButton");
const result = document.getElementById("result");
const scoreText = document.getElementById("scoreText");
const resultText = document.getElementById("resultText");
const againButton = document.getElementById("againButton");

let targetHue = 0;
let targetLightness = 54;
let countdownId = null;
let lastResult = null;

function colorFromHsl(hue, lightness) {
  return `hsl(${hue}, 82%, ${lightness}%)`;
}

function circularHueDiff(a, b) {
  const diff = Math.abs(a - b);
  return Math.min(diff, 360 - diff);
}

function randomLightness() {
  return Math.floor(Math.random() * 81);
}

function updateGuessPreview() {
  document.documentElement.style.setProperty("--guess-hue", hueSlider.value);
  document.documentElement.style.setProperty(
    "--guess-lightness",
    `${lightnessSlider.value}%`,
  );

  guessPreview.style.background = colorFromHsl(
    Number(hueSlider.value),
    Number(lightnessSlider.value),
  );
}

function resetSliders() {
  hueSlider.value = hueSlider.min;
  lightnessSlider.value = lightnessSlider.min;
  updateGuessPreview();
}

function showModeSelection() {
    modeSelection.hidden = false;
    gameSection.hidden = true;
}

function showGame() {
    modeSelection.hidden = true;
    gameSection.hidden = false;
}

function startSoloGame() {
    showGame();
    startRound();
}

function startRound() {
  clearInterval(countdownId);
  lastResult = null;

  targetHue = Math.floor(Math.random() * 361);
  targetLightness = randomLightness();

  resetSliders();

  timer.textContent = "3";
  controls.hidden = true;
  result.hidden = true;
  targetColor.classList.remove("hidden-color");
  targetColor.style.background = colorFromHsl(targetHue, targetLightness);
  stageLabel.textContent = "Смотри внимательно";

  let secondsLeft = 3;
  countdownId = setInterval(() => {
    secondsLeft -= 1;
    timer.textContent = String(secondsLeft);

    if (secondsLeft === 0) {
      clearInterval(countdownId);
      hideTargetColor();
    }
  }, 1000);
}

function hideTargetColor() {
  resetSliders();
  targetColor.style.background = "";
  targetColor.classList.add("hidden-color");
  stageLabel.textContent = "Теперь угадай оттенок и яркость";
  timer.textContent = "?";
  controls.hidden = false;
}

function submitGuess() {
  const guessHue = Number(hueSlider.value);
  const guessLightness = Number(lightnessSlider.value);
  const hueDiff = circularHueDiff(targetHue, guessHue);
  const lightnessDiff = Math.abs(targetLightness - guessLightness);
  const hueScore = Math.max(0, 100 - (hueDiff / 180) * 100);
  const lightnessScore = Math.max(0, 100 - (lightnessDiff / 80) * 100);
  const score = Math.round(hueScore * 0.7 + lightnessScore * 0.3);

  controls.hidden = true;
  result.hidden = false;
  targetColor.classList.remove("hidden-color");
  targetColor.style.background = `linear-gradient(90deg, ${colorFromHsl(targetHue, targetLightness)} 0 50%, ${colorFromHsl(guessHue, guessLightness)} 50% 100%)`;
  stageLabel.textContent = "Слева правильный, справа твой";
  scoreText.textContent = `${score}%`;
  resultText.textContent = `Разница: ${Math.round(hueDiff)}° по оттенку и ${lightnessDiff}% по яркости.`;

  lastResult = {
    targetHue,
    targetLightness,
    guessHue,
    guessLightness,
    score,
    hueDiff: Math.round(hueDiff),
    lightnessDiff,
  };

  // В обычном режиме результат только в приложении
}

hueSlider.addEventListener("input", updateGuessPreview);
lightnessSlider.addEventListener("input", updateGuessPreview);
submitButton.addEventListener("click", submitGuess);
againButton.addEventListener("click", startRound);

soloModeButton.addEventListener("click", startSoloGame);

if (tg) {
  tg.ready();
  tg.expand();
}

// Показываем экран выбора режима
showModeSelection();

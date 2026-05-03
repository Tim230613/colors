const tg = window.Telegram?.WebApp;

const modeSelection = document.getElementById("modeSelection");
const gameSection = document.getElementById("gameSection");
const soloModeButton = document.getElementById("soloModeButton");
const multiplayerModeButton = document.getElementById("multiplayerModeButton");

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

// Многопользовательский режим
let isMultiplayer = false;
let roomId = null;
let apiUrl = null;
let playerId = null;
let pollingId = null;

// Получаем параметры из URL
const urlParams = new URLSearchParams(window.location.search);
roomId = urlParams.get('room');
apiUrl = urlParams.get('api');

console.log('URL params:', { roomId, apiUrl, fullUrl: window.location.href });
console.log('Telegram WebApp available:', !!tg);

// Многопользовательский режим только если есть параметры И открыт в Telegram
if (roomId && apiUrl && tg) {
    isMultiplayer = true;
    playerId = Math.random().toString(36).substr(2, 9);
    console.log('Multiplayer mode enabled:', { roomId, apiUrl, playerId });
} else {
    isMultiplayer = false;
    console.log('Single player mode');
}

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

// API функции для многопользовательского режима
async function joinRoom() {
    try {
        const response = await fetch(`${apiUrl}/api/join`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ room_id: roomId, player_id: playerId })
        });
        return await response.json();
    } catch (error) {
        console.error('Error joining room:', error);
        return { error: 'Failed to connect' };
    }
}

async function getRoomStatus() {
    try {
        const response = await fetch(`${apiUrl}/api/room/${roomId}`);
        return await response.json();
    } catch (error) {
        console.error('Error getting room status:', error);
        return null;
    }
}

async function submitResultToAPI(result) {
    try {
        const response = await fetch(`${apiUrl}/api/result`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ room_id: roomId, player_id: playerId, result })
        });
        return await response.json();
    } catch (error) {
        console.error('Error submitting result:', error);
        return { error: 'Failed to submit' };
    }
}

function startMultiplayerGame() {
    // Показываем ожидание
    stageLabel.textContent = "Ожидание соперника...";
    timer.textContent = "...";
    controls.hidden = true;
    result.hidden = true;
    targetColor.classList.add("hidden-color");

    // Подключаемся к комнате
    joinRoom().then(data => {
        if (data.error) {
            stageLabel.textContent = "Ошибка подключения";
            return;
        }

        // Начинаем опрос статуса комнаты
        pollingId = setInterval(checkRoomStatus, 1000);
    });
}

async function checkRoomStatus() {
    const room = await getRoomStatus();
    if (!room) return;

    if (room.status === 'ready' && room.target_color) {
        // Комната готова - начинаем игру с общим цветом
        clearInterval(pollingId);
        targetHue = room.target_color.hue;
        targetLightness = room.target_color.lightness;
        startRound();
    }
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
    isMultiplayer = false;
    showGame();
    startRound();
}

function startMultiplayerGameFromUI() {
    // Если открыто в Telegram, отправляем запрос боту для создания комнаты
    if (tg) {
        tg.sendData("multiplayer");
    } else {
        alert("Многопользовательский режим доступен только в Telegram");
    }
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

  // В многопользовательском режиме отправляем результат в API
  if (isMultiplayer) {
    submitResultToAPI(lastResult);
    // Проверяем результаты соперника
    setTimeout(checkOpponentResult, 2000);
  }
  // В обычном режиме результат только в приложении, не отправляем в бота
}

async function checkOpponentResult() {
    const room = await getRoomStatus();
    if (!room) return;

    const results = room.results;
    const opponentId = Object.keys(results).find(id => id !== playerId);

    if (opponentId && results[opponentId]) {
        const opponentResult = results[opponentId];
        const myResult = results[playerId];

        if (myResult.score > opponentResult.score) {
            resultText.textContent = `Ты победил! ${myResult.score}% vs ${opponentResult.score}%`;
        } else if (myResult.score < opponentResult.score) {
            resultText.textContent = `Соперник победил! ${opponentResult.score}% vs ${myResult.score}%`;
        } else {
            resultText.textContent = `Ничья! ${myResult.score}%`;
        }
    } else {
        // Соперник еще не закончил
        resultText.textContent = "Ожидание результата соперника...";
        setTimeout(checkOpponentResult, 2000);
    }
}

hueSlider.addEventListener("input", updateGuessPreview);
lightnessSlider.addEventListener("input", updateGuessPreview);
submitButton.addEventListener("click", submitGuess);
againButton.addEventListener("click", startRound);

soloModeButton.addEventListener("click", startSoloGame);
multiplayerModeButton.addEventListener("click", startMultiplayerGameFromUI);

if (tg) {
  tg.ready();
  tg.expand();
}

// Запускаем нужный режим игры
console.log('Starting app. isMultiplayer:', isMultiplayer, 'roomId:', roomId, 'tg:', !!tg);

if (isMultiplayer) {
    // Если уже есть параметры комнаты - запускаем многопользовательскую игру
    console.log('Starting multiplayer game');
    showGame();
    startMultiplayerGame();
} else if (roomId && !tg) {
    // Если есть параметры комнаты но не открыт в Telegram
    console.log('Room params but no Telegram');
    targetColor.classList.add("hidden-color");
    stageLabel.textContent = "Открой эту ссылку через Telegram бота!";
    timer.textContent = "❌";
    controls.hidden = true;
    result.hidden = true;
} else {
    // Показываем экран выбора режима
    console.log('Showing mode selection');
    showModeSelection();
}

// Fallback: если через 1 секунду ничего не показалось, запускаем обычную игру
setTimeout(() => {
    if (modeSelection.hidden && gameSection.hidden) {
        console.log('Fallback: nothing shown, starting solo game');
        startSoloGame();
    }
}, 1000);

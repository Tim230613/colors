const tg = window.Telegram?.WebApp;

const modeSelection = document.getElementById("modeSelection");
const gameSection = document.getElementById("gameSection");
const soloModeButton = document.getElementById("soloModeButton");
const multiplayerModeButton = document.getElementById("multiplayerModeButton");
const inviteScreen = document.getElementById("inviteScreen");
const inviteLink = document.getElementById("inviteLink");
const waitingText = document.getElementById("waitingText");
const copyButton = document.getElementById("copyButton");

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

// Многопользовательский режим через бота
let isMultiplayer = false;
let roomId = null;
let apiUrl = null;
let playerId = null;
let pollingId = null;

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
    inviteScreen.hidden = true;
    gameSection.hidden = true;
}

function showInviteScreen(url) {
    modeSelection.hidden = true;
    inviteScreen.hidden = false;
    gameSection.hidden = true;

    inviteLink.value = url;
    waitingText.textContent = "Ожидание второго игрока...";

    // Начинаем опрос статуса комнаты
    pollingId = setInterval(checkRoomStatus, 1000);
}

function showGame() {
    modeSelection.hidden = true;
    inviteScreen.hidden = true;
    gameSection.hidden = false;
}

function startSoloGame() {
    isMultiplayer = false;
    showGame();
    startRound();
}

async function startMultiplayerGameFromUI() {
    // Временно отключено - API сервер на Railway не работает
    alert('Многопользовательский режим временно недоступен. Используйте одиночный режим.');
}

function joinRoomApi(roomId, playerId) {
    return fetch(`${apiUrl}/api/join`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ room_id: roomId, player_id: playerId })
    }).then(response => response.json());
}

function getRoomStatus() {
    return fetch(`${apiUrl}/api/room/${roomId}`)
        .then(response => response.json())
        .catch(error => {
            console.error('Ошибка получения статуса комнаты:', error);
            return null;
        });
}

function submitResultToAPI(result) {
    fetch(`${apiUrl}/api/result`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ room_id: roomId, player_id: playerId, result: result })
    }).catch(error => {
        console.error('Ошибка отправки результата:', error);
    });
}

function checkRoomStatus() {
    getRoomStatus().then(room => {
        if (!room) {
            clearInterval(pollingId);
            alert('Ошибка соединения с сервером');
            showModeSelection();
            return;
        }

        if (room.status === 'ready' && room.target_color) {
            clearInterval(pollingId);
            targetHue = room.target_color.hue;
            targetLightness = room.target_color.lightness;
            showGame();
            startRound();
        }
    });
}

function startRound() {
  clearInterval(countdownId);
  lastResult = null;

  // В многопользовательском режиме цвет уже задан через WebSocket
  if (!isMultiplayer) {
    targetHue = Math.floor(Math.random() * 361);
    targetLightness = randomLightness();
  }

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

  // В многопользовательском режиме отправляем результат через API
  if (isMultiplayer) {
    submitResultToAPI(lastResult);
    setTimeout(checkOpponentResult, 1000);
  }
}

function checkOpponentResult() {
    getRoomStatus().then(room => {
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
            resultText.textContent = "Ожидание результата соперника...";
            setTimeout(checkOpponentResult, 1000);
        }
    });
}

hueSlider.addEventListener("input", updateGuessPreview);
lightnessSlider.addEventListener("input", updateGuessPreview);
submitButton.addEventListener("click", submitGuess);
againButton.addEventListener("click", () => {
    if (isMultiplayer) {
        resultText.textContent = "Ожидание соперника...";
        againButton.disabled = true;
        // Отправляем готовность к следующему раунду через HTTP API
        fetch(`${apiUrl}/api/ready-next`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ room_id: roomId, player_id: playerId })
        });
        setTimeout(checkNewRound, 1000);
    } else {
        startRound();
    }
});

function checkNewRound() {
    getRoomStatus().then(room => {
        if (!room) return;

        if (room.target_color) {
            const newColor = room.target_color;
            if (newColor.hue !== targetHue || newColor.lightness !== targetLightness) {
                targetHue = newColor.hue;
                targetLightness = newColor.lightness;
                againButton.disabled = false;
                startRound();
            } else {
                setTimeout(checkNewRound, 1000);
            }
        } else {
            setTimeout(checkNewRound, 1000);
        }
    });
}

soloModeButton.addEventListener("click", startSoloGame);
multiplayerModeButton.addEventListener("click", startMultiplayerGameFromUI);
copyButton.addEventListener("click", () => {
    inviteLink.select();
    document.execCommand('copy');
    copyButton.textContent = "Скопировано!";
    setTimeout(() => {
        copyButton.textContent = "Копировать";
    }, 2000);
});

if (tg) {
  tg.ready();
  tg.expand();
}

// Запускаем нужный режим игры
const urlParams = new URLSearchParams(window.location.search);
roomId = urlParams.get('room');

if (roomId) {
    // Временно отключено - API сервер на Railway не работает
    alert('Многопользовательский режим временно недоступен. Используйте одиночный режим.');
    showModeSelection();
} else {
    // Показываем экран выбора режима
    showModeSelection();
}

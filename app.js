const tg = window.Telegram?.WebApp;

const modeSelection = document.getElementById("modeSelection");
const inviteScreen = document.getElementById("inviteScreen");
const gameSection = document.getElementById("gameSection");
const soloModeButton = document.getElementById("soloModeButton");
const multiplayerModeButton = document.getElementById("multiplayerModeButton");
const inviteLink = document.getElementById("inviteLink");
const copyButton = document.getElementById("copyButton");
const waitingText = document.getElementById("waitingText");

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
console.log('Environment:', {
    isLocal: window.location.hostname === '127.0.0.1' || window.location.hostname === 'localhost',
    hostname: window.location.hostname,
    protocol: window.location.protocol
});

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
async function joinRoomApi(room_id, player_id) {
    try {
        const effectiveApiUrl = apiUrl || window.location.origin;
        console.log('Joining room at:', `${effectiveApiUrl}/api/join`);
        const response = await fetch(`${effectiveApiUrl}/api/join`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ room_id, player_id })
        });
        return await response.json();
    } catch (error) {
        console.error('Error joining room:', error);
        return { error: 'Failed to connect' };
    }
}

async function getRoomStatus() {
    try {
        const effectiveApiUrl = apiUrl || window.location.origin;
        const response = await fetch(`${effectiveApiUrl}/api/room/${roomId}`);
        return await response.json();
    } catch (error) {
        console.error('Error getting room status:', error);
        return null;
    }
}

async function submitResultToAPI(result) {
    try {
        const effectiveApiUrl = apiUrl || window.location.origin;
        const response = await fetch(`${effectiveApiUrl}/api/result`, {
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

async function readyForNextRound() {
    try {
        const effectiveApiUrl = apiUrl || window.location.origin;
        const response = await fetch(`${effectiveApiUrl}/api/ready-next`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ room_id: roomId, player_id: playerId })
        });
        return await response.json();
    } catch (error) {
        console.error('Error ready for next round:', error);
        return { error: 'Failed to ready' };
    }
}



async function checkRoomStatus() {
    const room = await getRoomStatus();
    if (!room) return;

    if (room.status === 'ready' && room.target_color) {
        // Комната готова - начинаем игру с общим цветом
        clearInterval(pollingId);
        targetHue = room.target_color.hue;
        targetLightness = room.target_color.lightness;
        showGame();
        startRound();
    } else if (room.status === 'waiting') {
        // Обновляем текст ожидания
        const playerCount = room.players ? room.players.length : 0;
        waitingText.textContent = `Ожидание второго игрока... (${playerCount}/2)`;
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
    inviteScreen.hidden = true;
    gameSection.hidden = true;
}

function showInviteScreen(url) {
    modeSelection.hidden = true;
    inviteScreen.hidden = false;
    gameSection.hidden = true;

    // Если URL не передан, формируем его сами
    if (!url) {
        url = `${window.location.origin}${window.location.pathname}?room=${roomId}&api=${encodeURIComponent(apiUrl || window.location.origin)}`;
    }

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
    console.log('startMultiplayerGameFromUI called. apiUrl:', apiUrl, 'playerId:', playerId);

    // Если API URL не указан, используем тот же хост, что и у мини-аппа
    let effectiveApiUrl = apiUrl;
    if (!apiUrl) {
        // Формируем API URL на основе текущего хоста
        const protocol = window.location.protocol;
        const hostname = window.location.hostname;
        const port = window.location.port ? `:${window.location.port}` : '';
        effectiveApiUrl = `${protocol}//${hostname}${port}`;
        console.log('Using fallback API URL:', effectiveApiUrl);
    }

    // Создаем комнату через API
    try {
        console.log('Attempting to create room at:', `${effectiveApiUrl}/api/create-room`);
        const response = await fetch(`${effectiveApiUrl}/api/create-room`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ player_id: playerId })
        });

        console.log('Response status:', response.status);

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();
        console.log('Room created:', data);

        if (data.error) {
            alert("Ошибка создания комнаты: " + data.error);
            return;
        }

        roomId = data.room_id;
        isMultiplayer = true;
        apiUrl = effectiveApiUrl; // Сохраняем эффективный URL

        // Показываем экран приглашения
        showInviteScreen(data.invite_url);
    } catch (error) {
        console.error('Error creating room:', error);
        alert("Ошибка соединения с сервером: " + error.message + "\nAPI URL: " + effectiveApiUrl);
    }
}

function startRound() {
  clearInterval(countdownId);
  lastResult = null;

  // В многопользовательском режиме цвет уже задан через API
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

  // В многопользовательском режиме отправляем результат в API и показываем сравнение
  if (isMultiplayer) {
    submitResultToAPI(lastResult);
    // Показываем результат сравнения
    setTimeout(checkOpponentResult, 1000);
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
        setTimeout(checkOpponentResult, 1000);
    }
}

async function startNextRoundMultiplayer() {
    resultText.textContent = "Ожидание соперника...";
    againButton.disabled = true;

    await readyForNextRound();

    // Опрашиваем статус комнаты пока не появится новый цвет
    pollingId = setInterval(async () => {
        const room = await getRoomStatus();
        if (room && room.target_color) {
            // Проверяем, изменился ли цвет (новый раунд)
            const newColor = room.target_color;
            if (newColor.hue !== targetHue || newColor.lightness !== targetLightness) {
                clearInterval(pollingId);
                targetHue = newColor.hue;
                targetLightness = newColor.lightness;
                againButton.disabled = false;
                startRound();
            }
        }
    }, 500);
}

hueSlider.addEventListener("input", updateGuessPreview);
lightnessSlider.addEventListener("input", updateGuessPreview);
submitButton.addEventListener("click", submitGuess);
againButton.addEventListener("click", () => {
    if (isMultiplayer) {
        startNextRoundMultiplayer();
    } else {
        startRound();
    }
});

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
console.log('Starting app. isMultiplayer:', isMultiplayer, 'roomId:', roomId, 'tg:', !!tg);

if (isMultiplayer && roomId) {
    // Если уже есть параметры комнаты - присоединяемся и проверяем статус
    console.log('Joining existing room');

    // Используем fallback для API URL если нужно
    let effectiveApiUrl = apiUrl;
    if (!apiUrl) {
        const protocol = window.location.protocol;
        const hostname = window.location.hostname;
        const port = window.location.port ? `:${window.location.port}` : '';
        effectiveApiUrl = `${protocol}//${hostname}${port}`;
        apiUrl = effectiveApiUrl;
        console.log('Using fallback API URL for existing room:', effectiveApiUrl);
    }

    joinRoomApi(roomId, playerId).then(data => {
        if (data.error) {
            console.error('Error joining room:', data.error);
            showModeSelection();
            return;
        }

        getRoomStatus().then(room => {
            if (room && room.status === 'ready' && room.target_color) {
                // Комната готова - начинаем игру
                targetHue = room.target_color.hue;
                targetLightness = room.target_color.lightness;
                showGame();
                startRound();
            } else {
                // Комната в ожидании - показываем экран приглашения
                const inviteUrl = `${window.location.origin}${window.location.pathname}?room=${roomId}&api=${encodeURIComponent(apiUrl)}`;
                showInviteScreen(inviteUrl);
            }
        });
    });
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
    if (modeSelection.hidden && gameSection.hidden && inviteScreen.hidden) {
        console.log('Fallback: nothing shown, starting solo game');
        startSoloGame();
    }
}, 1000);

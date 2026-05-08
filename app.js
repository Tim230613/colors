const tg = window.Telegram?.WebApp;

console.log('App initializing...');

const modeSelection = document.getElementById("modeSelection");
const gameSection = document.getElementById("gameSection");
const soloModeButton = document.getElementById("soloModeButton");
const multiplayerModeButton = document.getElementById("multiplayerModeButton");
const inviteScreen = document.getElementById("inviteScreen");
const inviteLink = document.getElementById("inviteLink");
const waitingText = document.getElementById("waitingText");
const copyButton = document.getElementById("copyButton");

console.log('Elements found:', {
  modeSelection: !!modeSelection,
  gameSection: !!gameSection,
  soloModeButton: !!soloModeButton,
  multiplayerModeButton: !!multiplayerModeButton
});

// Кнопка мультиплеера доступна и в Telegram, и в веб-версии

const targetColor = document.getElementById("targetColor");
const stageLabel = document.getElementById("stageLabel");
const timer = document.getElementById("timer");
const controls = document.getElementById("controls");
const gameTitle = document.getElementById("gameTitle");
const roundInfo = document.getElementById("roundInfo");
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

// Мультираунды
let currentRound = 1;
const maxRounds = 5;
let matchScores = []; // { round, score }

// Многопользовательский режим через бота
let isMultiplayer = false;
let roomId = null;
let apiUrl = null;
let playerId = null;
let pollingId = null;
let socket = null;

function connectSocket() {
    if (!apiUrl || socket) return;
    try {
        const url = new URL(apiUrl);
        socket = io(url.origin, { path: '/socket.io/', transports: ['websocket', 'polling'] });
        socket.on('connect', () => {
            console.log('Socket connected');
            if (roomId && playerId) {
                socket.emit('join_room_socket', { room_id: roomId, player_id: playerId });
            }
        });
        socket.on('room_update', (room) => {
            console.log('Socket room_update:', room);
            handleRoomUpdate(room);
        });
        socket.on('disconnect', () => {
            console.log('Socket disconnected');
        });
    } catch (e) {
        console.error('Socket connect error:', e);
    }
}

function handleRoomUpdate(room) {
    // Приглашение: если комната готова — запускаем игру
    if (inviteScreen && !inviteScreen.hidden && room.status === 'ready' && room.target_color) {
        clearInterval(pollingId);
        targetHue = room.target_color.hue;
        targetLightness = room.target_color.lightness;
        currentRound = room.round || 1;
        showGame();
        startRound();
        return;
    }
    // Игра: если есть результаты соперника
    if (gameSection && !gameSection.hidden && room.results) {
        const results = room.results || {};
        if (results[playerId]) {
            // Мой результат уже отправлен, показываем/обновляем
            checkOpponentResultFromRoom(room);
        }
    }
    // Новый раунд
    if (gameSection && !gameSection.hidden && room.target_color) {
        const newColor = room.target_color;
        if (newColor.hue !== targetHue || newColor.lightness !== targetLightness) {
            targetHue = newColor.hue;
            targetLightness = newColor.lightness;
            currentRound = room.round || currentRound + 1;
            againButton.disabled = false;
            startRound();
        }
    }
    // Матч окончен
    if (room.match_ended) {
        againButton.disabled = false;
    }
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
    console.log('showModeSelection called');
    modeSelection.hidden = false;
    inviteScreen.hidden = true;
    gameSection.hidden = true;
    console.log('modeSelection.hidden:', modeSelection.hidden);
}

function showInviteScreen(url) {
    modeSelection.hidden = true;
    inviteScreen.hidden = false;
    gameSection.hidden = true;
    connectSocket();

    // В Telegram скрываем ссылку, показываем сообщение о боте
    if (tg) {
        document.getElementById('inviteText').textContent = "Перейди к боту и нажми кнопку 'Играть с другом'";
        document.getElementById('linkContainer').style.display = 'none';
        document.getElementById('copyButton').style.display = 'none';
        document.getElementById('telegramButton').style.display = 'block';
    } else {
        document.getElementById('inviteText').textContent = "Отправь эту ссылку другу:";
        document.getElementById('linkContainer').style.display = 'flex';
        document.getElementById('copyButton').style.display = 'block';
        document.getElementById('telegramButton').style.display = 'none';
        inviteLink.value = url;
    }

    waitingText.textContent = "Ожидание второго игрока...";

    // Начинаем опрос статуса комнаты
    pollingId = setInterval(checkRoomStatus, 1000);
}

function showGame() {
    modeSelection.hidden = true;
    inviteScreen.hidden = true;
    gameSection.hidden = false;
}

function resetMatch() {
    currentRound = 1;
    matchScores = [];
    if (roundInfo) roundInfo.textContent = `Раунд ${currentRound}/${maxRounds}`;
}

function startSoloGame() {
    isMultiplayer = false;
    resetMatch();
    showGame();
    startRound();
}

async function startMultiplayerGameFromUI() {
    console.log('startMultiplayerGameFromUI called, isTelegram:', !!tg);

    // В Telegram отправляем запрос боту на создание комнаты.
    // sendData() сам закрывает WebApp — tg.close() не нужен и может мешать.
    if (tg) {
        try {
            const payload = JSON.stringify({action: 'create_multiplayer_room'});
            console.log('Отправка данных боту:', payload);
            tg.sendData(payload);
            console.log('Данные отправлены');
        } catch (err) {
            console.error('Ошибка sendData:', err);
            alert('Не удалось отправить данные боту. Попробуй еще раз.');
        }
        return;
    }

    // Для веб версии создаем комнату напрямую
    apiUrl = 'https://colors-production-4484.up.railway.app';
    playerId = Math.random().toString(36).substr(2, 9);
    resetMatch();
    console.log('Создание комнаты (веб версия), player ID:', playerId);

    try {
        const response = await fetch(`${apiUrl}/api/create-room`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ player_id: playerId })
        });

        const data = await response.json();
        console.log('Ответ сервера:', data);

        if (data.success) {
            roomId = data.room_id;
            const inviteUrl = data.invite_url;
            console.log('Комната создана:', roomId, 'Ссылка:', inviteUrl);
            showInviteScreen(inviteUrl);
        } else {
            alert('Ошибка создания комнаты: ' + (data.error || 'Неизвестная ошибка'));
        }
    } catch (error) {
        console.error('Ошибка создания комнаты:', error);
        alert('Ошибка соединения с сервером. Проверьте интернет-соединение.');
    }
}

function joinRoomApi(roomId, playerId) {
    return fetch(`${apiUrl}/api/join`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ room_id: roomId, player_id: playerId })
    }).then(response => {
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        return response.json();
    });
}

function getRoomStatus() {
    return fetch(`${apiUrl}/api/room/${roomId}`)
        .then(response => {
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            return response.json();
        })
        .catch(error => {
            console.error('Ошибка получения статуса комнаты:', error);
            return null;
        });
}

function submitResultToAPI(result) {
    const payload = { room_id: roomId, player_id: playerId, result: result, round: currentRound };
    if (socket && socket.connected) {
        socket.emit('submit_result_socket', payload);
    } else {
        fetch(`${apiUrl}/api/result`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        }).catch(error => {
            console.error('Ошибка отправки результата:', error);
        });
    }
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
        } else if (room.status === 'waiting') {
            // В Telegram показываем сообщение об использовании бота
            if (tg) {
                waitingText.textContent = "Перешли сообщение бота другу через кнопку ниже";
            } else {
                // Обновляем текст в зависимости от количества игроков
                const playerCount = room.players ? room.players.length : 0;
                if (playerCount === 1) {
                    waitingText.textContent = "Ожидание второго игрока...";
                } else if (playerCount === 2) {
                    waitingText.textContent = "Второй игрок присоединился! Генерация цвета...";
                }
            }
        }
    });
}

function startRound() {
  clearInterval(countdownId);
  lastResult = null;

  console.log('startRound вызван, isMultiplayer:', isMultiplayer);
  console.log('targetHue до генерации:', targetHue, 'targetLightness:', targetLightness);

  // В многопользовательском режиме цвет уже задан через сервер
  if (!isMultiplayer) {
    targetHue = Math.floor(Math.random() * 361);
    targetLightness = randomLightness();
    console.log('Сгенерирован локальный цвет:', targetHue, targetLightness);
  } else {
    console.log('Используем цвет с сервера:', targetHue, targetLightness);
  }

  resetSliders();

  if (gameTitle) gameTitle.textContent = "Запомни цвет";
  if (roundInfo) roundInfo.textContent = `Раунд ${currentRound}/${maxRounds}`;
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
  if (gameTitle) gameTitle.textContent = "Восстанови цвет";
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

  matchScores.push({ round: currentRound, score });

  // В многопользовательском режиме отправляем результат через API
  if (isMultiplayer) {
    submitResultToAPI(lastResult);
    setTimeout(checkOpponentResult, 1000);
    return; // multiplayer handles its own flow
  }

  // Если последний раунд — показываем итоговый результат
  if (currentRound >= maxRounds) {
    const avgScore = Math.round(matchScores.reduce((a, b) => a + b.score, 0) / matchScores.length);
    let bestRound = matchScores.reduce((a, b) => a.score > b.score ? a : b);
    resultText.textContent += `\n🏁 Матч окончен! Средний результат: ${avgScore}% (лучший: ${bestRound.score}% в раунде ${bestRound.round})`;
  }
}

function renderOpponentResult(room) {
    const results = room.results || {};
    const opponentId = Object.keys(results).find(id => id !== playerId);
    if (!opponentId || !results[opponentId]) return false;
    const opponentResult = results[opponentId];
    const myResult = results[playerId];
    if (!myResult || !opponentResult) return false;

    const roomRound = room.round || 1;
    const roomMax = room.max_rounds || 3;
    let roundLabel = roomRound >= roomMax ? '🏁 Финальный раунд!' : `Раунд ${roomRound}/${roomMax}`;
    if (myResult.score > opponentResult.score) {
        resultText.textContent = `🎉 ${roundLabel}\nТы победил! ${myResult.score}% vs ${opponentResult.score}%`;
    } else if (myResult.score < opponentResult.score) {
        resultText.textContent = `😔 ${roundLabel}\nСоперник победил! ${opponentResult.score}% vs ${myResult.score}%`;
    } else {
        resultText.textContent = `🤝 ${roundLabel}\nНичья! ${myResult.score}%`;
    }
    if (room.match_ended) {
        const myTotal = Object.values(room.scores[playerId] || {}).reduce((a,b)=>a+b,0);
        const oppTotal = opponentId ? Object.values(room.scores[opponentId] || {}).reduce((a,b)=>a+b,0) : 0;
        const myAvg = Math.round(myTotal / roomMax);
        const oppAvg = Math.round(oppTotal / roomMax);
        resultText.textContent += `\n🏁 Матч окончен! Средний: ${myAvg}% vs ${oppAvg}%`;
    }
    return true;
}

function checkOpponentResultFromRoom(room) {
    if (renderOpponentResult(room)) return;
    // Если соперник еще не отправил — остаемся на polling/fallback
}

function checkOpponentResult() {
    getRoomStatus().then(room => {
        if (!room) {
            console.error('Комната не найдена');
            return;
        }
        if (renderOpponentResult(room)) return;
        resultText.textContent = "Ожидание результата соперника...";
        setTimeout(checkOpponentResult, 1000);
    });
}

hueSlider.addEventListener("input", updateGuessPreview);
lightnessSlider.addEventListener("input", updateGuessPreview);
submitButton.addEventListener("click", submitGuess);

function nextRoundHandler() {
    if (isMultiplayer) {
        resultText.textContent = "Ожидание соперника...";
        againButton.disabled = true;
        // Отправляем готовность к следующему раунду
        const payload = { room_id: roomId, player_id: playerId };
        if (socket && socket.connected) {
            socket.emit('ready_next_socket', payload);
        } else {
            fetch(`${apiUrl}/api/ready-next`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
        }
        setTimeout(checkNewRound, 1000);
        return;
    }
    // Соло: переходим к следующему раунду или сбрасываем матч
    if (currentRound >= maxRounds) {
        resetMatch();
    } else {
        currentRound++;
    }
    startRound();
}

againButton.addEventListener("click", nextRoundHandler);

function checkNewRound() {
    getRoomStatus().then(room => {
        if (!room) return;

        if (room.match_ended) {
            againButton.disabled = false;
            return;
        }

        if (room.target_color) {
            const newColor = room.target_color;
            if (newColor.hue !== targetHue || newColor.lightness !== targetLightness) {
                targetHue = newColor.hue;
                targetLightness = newColor.lightness;
                currentRound = room.round || currentRound + 1;
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
multiplayerModeButton.addEventListener("click", () => {
    console.log('Multiplayer button clicked');
    startMultiplayerGameFromUI();
});
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
apiUrl = urlParams.get('api') || 'https://colors-production-4484.up.railway.app';

// Гарантируем протокол у API URL
if (apiUrl && !apiUrl.startsWith('http://') && !apiUrl.startsWith('https://')) {
    apiUrl = 'https://' + apiUrl;
}
console.log('API URL после нормализации:', apiUrl);

// В Telegram WebApp параметры могут быть в initDataUnsafe.start_param
// (например, при открытии через t.me/bot?startapp=ROOM_ID или из URL)
if (tg && tg.initDataUnsafe && tg.initDataUnsafe.start_param) {
    const startParam = tg.initDataUnsafe.start_param;
    console.log('Получен start_param:', startParam);
    try {
        const parsed = JSON.parse(startParam);
        if (parsed.room) roomId = parsed.room;
        if (parsed.api) apiUrl = parsed.api;
        console.log('Параметры из Telegram start_param (JSON):', parsed);
    } catch (e) {
        // Если не JSON — используем как room_id (строка)
        roomId = startParam;
        console.log('Используем start_param как room_id:', roomId);
    }
}

console.log('Финальные параметры:', { roomId, apiUrl, isTelegram: !!tg });

try {
    if (roomId) {
    console.log('Есть roomId, пробуем присоединиться к комнате:', roomId);
    // Если есть параметры комнаты - многопользовательский режим
    playerId = Math.random().toString(36).substr(2, 9);
    isMultiplayer = true;
    resetMatch();
    console.log('Загрузка с параметрами комнаты. Room ID:', roomId, 'Player ID:', playerId, 'API URL:', apiUrl);

    joinRoomApi(roomId, playerId).then(data => {
        console.log('Присоединение к комнате:', data);
        if (data.error) {
            showModeSelection();
            return;
        }
        connectSocket();
        getRoomStatus().then(room => {
            console.log('Статус комнаты после присоединения:', room);
            if (room && room.status === 'ready' && room.target_color) {
                targetHue = room.target_color.hue;
                targetLightness = room.target_color.lightness;
                currentRound = room.round || 1;
                console.log('Цель получена с сервера:', targetHue, targetLightness, 'round:', currentRound);
                showGame();
                startRound();
            } else {
                const inviteUrl = `${window.location.origin}${window.location.pathname}?room=${roomId}&api=${encodeURIComponent(apiUrl)}`;
                console.log('Комната не готова, показываем экран приглашения');
                showInviteScreen(inviteUrl);
            }
        }).catch(error => {
            console.error('Ошибка получения статуса комнаты:', error);
            alert('Ошибка соединения с сервером. Попробуй обновить страницу.\n' + error.message);
            showModeSelection();
        });
    }).catch(error => {
        console.error('Ошибка присоединения к комнате:', error);
        alert('Не удалось войти в комнату. Возможно, она устарела или сервер недоступен.\n' + error.message);
        showModeSelection();
    });
} else {
    // Показываем экран выбора режима
    console.log('No roomId, showing mode selection');
    try {
        showModeSelection();
    } catch (error) {
        console.error('Error in showModeSelection:', error);
    }
}
} catch (error) {
    console.error('Error in initialization:', error);
}

import json
import logging
import os
import random
import string
import threading
import time
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

from flask import Flask, jsonify, request
from flask_cors import CORS
from telegram import KeyboardButton, ReplyKeyboardMarkup, Update, WebAppInfo
from telegram.ext import (
    Application,
    CommandHandler,
    ContextTypes,
    MessageHandler,
    filters,
)


logging.basicConfig(
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
    level=logging.INFO,
)


def load_env_file(path=".env"):
    if not os.path.exists(path):
        return

    with open(path, encoding="utf-8") as file:
        for line in file:
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue

            name, value = line.split("=", 1)
            os.environ.setdefault(name.strip(), value.strip().strip('"'))


load_env_file()

TOKEN = os.environ.get("BOT_TOKEN")
WEB_APP_URL = os.environ.get("WEB_APP_URL")
API_URL = os.environ.get("API_URL", "http://127.0.0.1:5000")
# Автоматическая версия на основе времени запуска
WEB_APP_VERSION = os.environ.get("WEB_APP_VERSION", str(int(time.time())))

# Хранилище комнат в памяти
rooms = {}

# Flask приложение для HTTP API
app = Flask(__name__)
CORS(app)  # Разрешаем CORS запросы


@app.route('/api/room/<room_id>', methods=['GET'])
def get_room_info(room_id):
    """Получить информацию о комнате"""
    room = get_room(room_id)
    if room:
        return jsonify(room)
    return jsonify({'error': 'Room not found'}), 404


@app.route('/api/join', methods=['POST'])
def join_room_api():
    """Присоединиться к комнате"""
    data = request.json
    room_id = data.get('room_id')
    player_id = data.get('player_id')

    if not room_id or not player_id:
        return jsonify({'error': 'Missing room_id or player_id'}), 400

    success = join_room(room_id, player_id)
    if success:
        return jsonify({'success': True})
    return jsonify({'error': 'Failed to join room'}), 400


@app.route('/api/result', methods=['POST'])
def submit_result_api():
    """Отправить результат"""
    data = request.json
    room_id = data.get('room_id')
    player_id = data.get('player_id')
    result = data.get('result')

    if not all([room_id, player_id, result]):
        return jsonify({'error': 'Missing data'}), 400

    submit_result(room_id, player_id, result)
    return jsonify({'success': True})


@app.route('/api/create-room', methods=['POST'])
def create_room_api():
    """Создать новую комнату"""
    data = request.json
    player_id = data.get('player_id')

    if not player_id:
        return jsonify({'error': 'Missing player_id'}), 400

    room_id = create_room()
    join_room(room_id, player_id)

    # Формируем URL для приглашения
    invite_url = f"{WEB_APP_URL}?room={room_id}&api={API_URL}"

    return jsonify({
        'success': True,
        'room_id': room_id,
        'invite_url': invite_url
    })


@app.route('/api/ready-next', methods=['POST'])
def ready_next_round_api():
    """Игрок готов к следующему раунду"""
    data = request.json
    room_id = data.get('room_id')
    player_id = data.get('player_id')

    if not all([room_id, player_id]):
        return jsonify({'error': 'Missing data'}), 400

    if room_id not in rooms:
        return jsonify({'error': 'Room not found'}), 404

    room = rooms[room_id]
    if 'ready_next' not in room:
        room['ready_next'] = []

    if player_id not in room['ready_next']:
        room['ready_next'].append(player_id)

    # Если оба игрока готовы - генерируем новый цвет
    if len(room['ready_next']) == 2:
        room['target_color'] = {
            'hue': random.randint(0, 360),
            'lightness': random.randint(0, 80)
        }
        room['ready_next'] = []
        room['results'] = {}  # Очищаем результаты для нового раунда

    return jsonify({'success': True})


def run_flask():
    """Запустить Flask сервер в отдельном потоке"""
    # На Railway используем порт из переменной окружения
    port = int(os.environ.get('PORT', 5000))
    app.run(host='0.0.0.0', port=port, debug=False)


def generate_room_id():
    """Генерирует уникальный ID комнаты"""
    return ''.join(random.choices(string.ascii_lowercase + string.digits, k=6))


def create_room():
    """Создает новую комнату"""
    room_id = generate_room_id()
    rooms[room_id] = {
        'players': [],
        'status': 'waiting',
        'target_color': None,
        'results': {}
    }
    return room_id


def join_room(room_id, player_id):
    """Присоединяет игрока к комнате"""
    if room_id not in rooms:
        return False

    room = rooms[room_id]
    if player_id not in room['players'] and len(room['players']) < 2:
        room['players'].append(player_id)

        # Если два игрока - начинаем игру
        if len(room['players']) == 2:
            room['status'] = 'ready'
            # Генерируем общий цвет для обоих
            room['target_color'] = {
                'hue': random.randint(0, 360),
                'lightness': random.randint(0, 80)
            }

        return True
    return False


def get_room(room_id):
    """Получает информацию о комнате"""
    return rooms.get(room_id)


def submit_result(room_id, player_id, result):
    """Сохраняет результат игрока"""
    if room_id in rooms:
        rooms[room_id]['results'][player_id] = result


def require_env(name, value):
    if not value:
        raise RuntimeError(f"Set the {name} environment variable.")


def versioned_url(url):
    parts = urlsplit(url)
    path = parts.path

    if path and "." not in path.rsplit("/", 1)[-1] and not path.endswith("/"):
        path = f"{path}/"

    query = dict(parse_qsl(parts.query))
    query["tg_build"] = WEB_APP_VERSION
    query["tg_t"] = str(int(time.time()))

    return urlunsplit(
        (parts.scheme, parts.netloc, path, urlencode(query), parts.fragment)
    )


async def start(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    solo_url = f"{versioned_url(WEB_APP_URL)}&api={API_URL}"
    logging.info(f"Solo URL: {solo_url}")

    solo_button = KeyboardButton(
        "Играть",
        web_app=WebAppInfo(url=solo_url),
    )

    keyboard = ReplyKeyboardMarkup([[solo_button]], resize_keyboard=True)

    await update.message.reply_text(
        "Готов сыграть? Нажми кнопку для запуска игры:",
        reply_markup=keyboard,
    )


async def web_app_data(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    try:
        data = json.loads(update.message.web_app_data.data)
    except json.JSONDecodeError:
        await update.message.reply_text("Не смог прочитать данные.")
        return

    # Обработка действия создания комнаты
    action = data.get("action")
    if action == "create_multiplayer_room":
        # Генерируем player ID
        player_id = ''.join(random.choices(string.ascii_lowercase + string.digits, k=9))

        # Создаем комнату
        room_id = create_room()
        join_room(room_id, player_id)

        # Формируем параметры для Telegram WebApp
        start_param = json.dumps({"room": room_id, "api": API_URL})

        # Формируем URL для приглашения (для веб версии)
        web_invite_url = f"{WEB_APP_URL}?room={room_id}&api={API_URL}"

        await update.message.reply_text(
            f"Комната создана!\n\n"
            f"Перешли это сообщение другу:",
            reply_markup=ReplyKeyboardMarkup([[
                KeyboardButton("Играть с другом", web_app=WebAppInfo(url=WEB_APP_URL, start_param=start_param))
            ]], resize_keyboard=True)
        )
        return

    # Обработка результатов игры
    score = data.get("score", 0)
    hue_diff = data.get("hueDiff", 0)
    lightness_diff = data.get("lightnessDiff", 0)

    await update.message.reply_text(
        "Результат:\n"
        f"{score}% точности\n"
        f"Оттенок: ошибка {hue_diff}°\n"
        f"Яркость: ошибка {lightness_diff}%"
    )


def main() -> None:
    require_env("BOT_TOKEN", TOKEN)
    require_env("WEB_APP_URL", WEB_APP_URL)

    # Запускаем Flask сервер в отдельном потоке
    flask_thread = threading.Thread(target=run_flask, daemon=True)
    flask_thread.start()

    # Запускаем Telegram бота
    app = Application.builder().token(TOKEN).build()
    app.add_handler(CommandHandler("start", start))
    app.add_handler(MessageHandler(filters.StatusUpdate.WEB_APP_DATA, web_app_data))
    app.run_polling(allowed_updates=Update.ALL_TYPES)


if __name__ == "__main__":
    main()

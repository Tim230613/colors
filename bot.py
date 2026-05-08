import asyncio
import json
import logging
import os
import random
import string
import time
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

from aiohttp import web
import socketio
from telegram import KeyboardButton, ReplyKeyboardMarkup, Update, WebAppInfo
from telegram.ext import (
    Application,
    CommandHandler,
    ContextTypes,
    MessageHandler,
    filters,
)

# Redis (опционально)
try:
    import redis.asyncio as aioredis
    HAS_REDIS = True
except ImportError:
    HAS_REDIS = False

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

# API URL: явно указанный, Railway domain, или fallback
_api_url = os.environ.get("API_URL") or os.environ.get("RAILWAY_PUBLIC_DOMAIN") or "https://colors-production-4484.up.railway.app"
if _api_url and not _api_url.startswith(("http://", "https://")):
    _api_url = f"https://{_api_url}"
API_URL = _api_url

WEB_APP_VERSION = os.environ.get("WEB_APP_VERSION", str(int(time.time())))

REDIS_URL = os.environ.get("REDIS_URL")

# Хранилище комнат
rooms = {}
redis_client = None


async def get_redis():
    global redis_client
    if not HAS_REDIS or not REDIS_URL:
        return None
    if redis_client is None:
        try:
            redis_client = aioredis.from_url(REDIS_URL, decode_responses=True)
            await redis_client.ping()
            logging.info("Redis connected")
        except Exception as e:
            logging.error(f"Redis connection failed: {e}")
            redis_client = None
    return redis_client


def _room_key(room_id):
    return f"room:{room_id}"


async def save_room(room_id, room_data):
    r = await get_redis()
    if r:
        await r.set(_room_key(room_id), json.dumps(room_data), ex=3600)
    else:
        rooms[room_id] = room_data


async def load_room(room_id):
    r = await get_redis()
    if r:
        data = await r.get(_room_key(room_id))
        if data:
            return json.loads(data)
        return None
    return rooms.get(room_id)


async def delete_room(room_id):
    r = await get_redis()
    if r:
        await r.delete(_room_key(room_id))
    else:
        rooms.pop(room_id, None)


def generate_room_id():
    return "".join(random.choices(string.ascii_lowercase + string.digits, k=6))


async def create_room():
    room_id = generate_room_id()
    room = {
        "players": [],
        "status": "waiting",
        "target_color": None,
        "results": {},
        "round": 1,
        "max_rounds": 5,
        "scores": {},
        "match_ended": False,
        "ready_next": [],
    }
    await save_room(room_id, room)
    return room_id


async def join_room(room_id, player_id):
    room = await load_room(room_id)
    if not room:
        return False
    if player_id not in room["players"] and len(room["players"]) < 2:
        room["players"].append(player_id)
        if len(room["players"]) == 2:
            room["status"] = "ready"
            room["target_color"] = {
                "hue": random.randint(0, 360),
                "lightness": random.randint(0, 80),
            }
        await save_room(room_id, room)
        return True
    return False


async def submit_result(room_id, player_id, result):
    room = await load_room(room_id)
    if not room:
        return
    room["results"][player_id] = result
    if player_id not in room["scores"]:
        room["scores"][player_id] = {}
    room["scores"][player_id][str(room["round"])] = result.get("score", 0)
    await save_room(room_id, room)


async def ready_next(room_id, player_id):
    room = await load_room(room_id)
    if not room:
        return None
    if room.get("match_ended"):
        return room
    if player_id not in room["ready_next"]:
        room["ready_next"].append(player_id)
    if len(room["ready_next"]) == 2:
        room["round"] += 1
        if room["round"] > room["max_rounds"]:
            room["match_ended"] = True
        else:
            room["target_color"] = {
                "hue": random.randint(0, 360),
                "lightness": random.randint(0, 80),
            }
        room["ready_next"] = []
        room["results"] = {}
    await save_room(room_id, room)
    return room


# Socket.IO сервер
sio = socketio.AsyncServer(cors_allowed_origins="*", async_mode="aiohttp")
app = web.Application()
sio.attach(app)


@sio.event
async def connect(sid, environ):
    logging.info(f"Socket connected: {sid}")


@sio.event
async def disconnect(sid):
    logging.info(f"Socket disconnected: {sid}")


@sio.event
async def join_room_socket(sid, data):
    room_id = data.get("room_id")
    player_id = data.get("player_id")
    if not room_id or not player_id:
        await sio.emit("error", {"message": "Missing data"}, room=sid)
        return
    success = await join_room(room_id, player_id)
    sio.enter_room(sid, room_id)
    await sio.emit("joined", {"success": success, "room_id": room_id}, room=sid)
    room = await load_room(room_id)
    if room:
        await sio.emit("room_update", room, room=room_id)


@sio.event
async def submit_result_socket(sid, data):
    room_id = data.get("room_id")
    player_id = data.get("player_id")
    result = data.get("result")
    rnd = data.get("round", 1)
    if not all([room_id, player_id, result]):
        return
    await submit_result(room_id, player_id, result)
    room = await load_room(room_id)
    if room:
        await sio.emit("room_update", room, room=room_id)


@sio.event
async def ready_next_socket(sid, data):
    room_id = data.get("room_id")
    player_id = data.get("player_id")
    if not all([room_id, player_id]):
        return
    room = await ready_next(room_id, player_id)
    if room:
        await sio.emit("room_update", room, room=room_id)


# HTTP API (fallback для клиентов без WebSocket)
async def get_room_http(request):
    room_id = request.match_info["room_id"]
    room = await load_room(room_id)
    if room:
        return web.json_response(room)
    return web.json_response({"error": "Room not found"}, status=404)


async def join_room_http(request):
    data = await request.json()
    room_id = data.get("room_id")
    player_id = data.get("player_id")
    if not room_id or not player_id:
        return web.json_response({"error": "Missing data"}, status=400)
    success = await join_room(room_id, player_id)
    room = await load_room(room_id)
    if room:
        await sio.emit("room_update", room, room=room_id)
    if success:
        return web.json_response({"success": True})
    return web.json_response({"error": "Failed to join"}, status=400)


async def create_room_http(request):
    data = await request.json()
    player_id = data.get("player_id")
    if not player_id:
        return web.json_response({"error": "Missing player_id"}, status=400)
    room_id = await create_room()
    await join_room(room_id, player_id)
    invite_url = f"{WEB_APP_URL}?room={room_id}&api={API_URL}"
    return web.json_response({
        "success": True,
        "room_id": room_id,
        "invite_url": invite_url,
    })


async def submit_result_http(request):
    data = await request.json()
    room_id = data.get("room_id")
    player_id = data.get("player_id")
    result = data.get("result")
    if not all([room_id, player_id, result]):
        return web.json_response({"error": "Missing data"}, status=400)
    await submit_result(room_id, player_id, result)
    room = await load_room(room_id)
    if room:
        await sio.emit("room_update", room, room=room_id)
    return web.json_response({"success": True})


async def ready_next_http(request):
    data = await request.json()
    room_id = data.get("room_id")
    player_id = data.get("player_id")
    if not all([room_id, player_id]):
        return web.json_response({"error": "Missing data"}, status=400)
    room = await ready_next(room_id, player_id)
    if room:
        await sio.emit("room_update", room, room=room_id)
    return web.json_response({
        "success": True,
        "round": room["round"],
        "match_ended": room.get("match_ended", False),
    })


async def health_check(request):
    return web.json_response({"status": "healthy"})


app.router.add_get("/api/room/{room_id}", get_room_http)
app.router.add_post("/api/join", join_room_http)
app.router.add_post("/api/create-room", create_room_http)
app.router.add_post("/api/result", submit_result_http)
app.router.add_post("/api/ready-next", ready_next_http)
app.router.add_get("/health", health_check)


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
    args = context.args
    if args and len(args) > 0:
        room_id = args[0]
        invite_url = f"{versioned_url(WEB_APP_URL)}&room={room_id}&api={API_URL}"
        logging.info(f"Invite URL for room {room_id}: {invite_url}")
        button = KeyboardButton(
            "Присоединиться к игре",
            web_app=WebAppInfo(url=invite_url),
        )
        keyboard = ReplyKeyboardMarkup([[button]], resize_keyboard=True)
        await update.message.reply_text(
            "🎮 Тебя пригласили в Color Memory!\n\n"
            "Нажми кнопку ниже, чтобы присоединиться к игре:",
            reply_markup=keyboard,
        )
        return

    solo_url = f"{versioned_url(WEB_APP_URL)}&api={API_URL}"
    logging.info(f"Solo URL: {solo_url}")
    solo_button = KeyboardButton(
        "Играть",
        web_app=WebAppInfo(url=solo_url),
    )
    keyboard = ReplyKeyboardMarkup([[solo_button]], resize_keyboard=True)
    await update.message.reply_text(
        "🎮 Color Memory\n\n"
        "Готов сыграть? Нажми кнопку для запуска игры:",
        reply_markup=keyboard,
    )


async def web_app_data(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    logging.info(f"Received web_app_data: {update.message.web_app_data.data}")
    try:
        data = json.loads(update.message.web_app_data.data)
        logging.info(f"Parsed data: {data}")
    except json.JSONDecodeError as e:
        logging.error(f"JSON decode error: {e}")
        await update.message.reply_text("Не смог прочитать данные.")
        return

    action = data.get("action")
    logging.info(f"Action: {action}")
    if action == "create_multiplayer_room":
        logging.info("Creating multiplayer room...")
        room_id = await create_room()
        logging.info(f"Room ID: {room_id}")

        try:
            bot_username = context.bot.username
        except Exception:
            bot_username = None

        web_invite_url = f"{WEB_APP_URL}?room={room_id}&api={API_URL}"
        logging.info(f"Web invite URL: {web_invite_url}")

        text = (
            f"🎮 Комната создана!\n\n"
            f"🔗 Ссылка для друга (веб):\n{web_invite_url}\n\n"
        )
        if bot_username:
            tg_link = f"https://t.me/{bot_username}?start={room_id}"
            text += f"📱 Ссылка для Telegram:\n{tg_link}\n\n"
        text += "Отправь ссылку другу, чтобы играть вместе!"

        try:
            await update.message.reply_text(text)
            logging.info("Reply sent successfully")
        except Exception as e:
            logging.error(f"Error sending reply: {e}")
        return

    if "score" in data:
        score = data.get("score", 0)
        hue_diff = data.get("hueDiff", 0)
        lightness_diff = data.get("lightnessDiff", 0)
        await update.message.reply_text(
            "Результат:\n"
            f"{score}% точности\n"
            f"Оттенок: ошибка {hue_diff}°\n"
            f"Яркость: ошибка {lightness_diff}%"
        )
        return

    logging.warning(f"Неизвестное действие от WebApp: {data}")
    await update.message.reply_text(
        "🎮 Получил данные, но не понял команду.\n"
        "Попробуй начать заново через /start"
    )


async def main():
    require_env("BOT_TOKEN", TOKEN)
    require_env("WEB_APP_URL", WEB_APP_URL)

    # Telegram бот
    application = Application.builder().token(TOKEN).build()
    application.add_handler(CommandHandler("start", start))
    application.add_handler(MessageHandler(filters.StatusUpdate.WEB_APP_DATA, web_app_data))

    await application.initialize()
    await application.start()
    await application.updater.start_polling(allowed_updates=Update.ALL_TYPES)

    # HTTP/WebSocket сервер
    port = int(os.environ.get("PORT", 5000))
    runner = web.AppRunner(app)
    await runner.setup()
    site = web.TCPSite(runner, "0.0.0.0", port)
    await site.start()
    logging.info(f"Server started on port {port}")

    # Keep running
    while True:
        await asyncio.sleep(3600)


if __name__ == "__main__":
    asyncio.run(main())

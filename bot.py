import json
import logging
import os
import time
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

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
# Автоматическая версия на основе времени запуска
WEB_APP_VERSION = os.environ.get("WEB_APP_VERSION", str(int(time.time())))


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
    button = KeyboardButton(
        "Играть",
        web_app=WebAppInfo(url=versioned_url(WEB_APP_URL)),
    )
    keyboard = ReplyKeyboardMarkup([[button]], resize_keyboard=True)

    await update.message.reply_text(
        "Готов сыграть? Запускай мини-игру кнопкой ниже.",
        reply_markup=keyboard,
    )


async def web_app_data(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    try:
        data = json.loads(update.message.web_app_data.data)
    except json.JSONDecodeError:
        await update.message.reply_text("Не смог прочитать результат игры.")
        return

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

    app = Application.builder().token(TOKEN).build()
    app.add_handler(CommandHandler("start", start))
    app.add_handler(MessageHandler(filters.StatusUpdate.WEB_APP_DATA, web_app_data))
    app.run_polling(allowed_updates=Update.ALL_TYPES)


if __name__ == "__main__":
    main()

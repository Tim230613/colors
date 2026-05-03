# Color Mini App

Telegram Mini App с игрой на память цвета: игрок запоминает оттенок и яркость, затем пытается восстановить цвет двумя бегунками.

## Локальная проверка сайта

```powershell
python -m http.server 8000 --bind 127.0.0.1
```

Открой в браузере:

```text
http://127.0.0.1:8000/
```

## Запуск бота

1. Опубликуй `index.html`, `styles.css` и `app.js` на HTTPS-хостинге, например GitHub Pages, Vercel, Netlify или Cloudflare Pages.
2. В BotFather укажи домен мини-аппа: `My Bots -> Bot Settings -> Domain`.
3. Создай файл `.env` рядом с `bot.py`:

```text
BOT_TOKEN=your_bot_token
WEB_APP_URL=https://your-name.github.io/color-mini-app/
```

4. Запусти бота:

```powershell
python bot.py
```

После команды `/start` бот покажет кнопку `Играть`. 

Версия мини-аппа обновляется автоматически при каждом запуске бота.

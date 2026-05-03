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

## Многопользовательский режим

Для работы мультиплеера нужно задеплоить API сервер.

### Деплой на Render.com (рекомендуется)

1. Перейдите на https://render.com/
2. Войдите через GitHub
3. Нажмите "New +" → "Web Service"
4. Подключите репозиторий `Tim230613/colors`
5. Render автоматически найдет `render.yaml` и настроит всё
6. Нажмите "Create Web Service"
7. Подождите 2-3 минуты пока деплой завершится
8. Скопируйте URL вида `https://colors-api.onrender.com`
9. Замените в `app.js` строку `apiUrl = 'https://colors.up.railway.app'` на ваш URL
10. Запушьте изменения в GitHub

### Деплой на Railway

1. Перейдите на https://railway.app/
2. Создайте проект из GitHub репозитория `Tim230613/colors`
3. Добавьте переменную окружения: `WEB_APP_URL=https://tim230613.github.io/colors/`
4. Запустите деплой

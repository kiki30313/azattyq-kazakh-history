# АЗАТТЫҚ — Тарихтың ізімен

Интерактивный сайт об истории национально-освободительных восстаний в Казахстане (1783–1916), созданный на React, TypeScript и Vite. Раздел «AI тарихшы — виртуалды оқытушы» использует отдельную серверную функцию Vercel и OpenAI Responses API. Ключ OpenAI никогда не передаётся в frontend.

## Локальный запуск сайта и API

Требуются Node.js 20+ и npm.

```sh
npm ci
npm install --global vercel
```

Скопируйте `.env.example` в `.env.local` и задайте настройки:

```env
OPENAI_API_KEY=ваш-серверный-ключ
OPENAI_MODEL=gpt-4.1-mini
ALLOWED_ORIGINS=http://localhost:3000,http://localhost:5173
VITE_API_BASE_URL=
```

Для локальной работы и frontend, и API запустите Vercel Dev:

```sh
npx vercel dev
```

Откройте адрес, который выведет Vercel CLI (обычно `http://localhost:3000`). Обычный `npm run dev` запускает только Vite frontend и не предоставляет `/api/chat`.

Проверки frontend:

```sh
npm run build
npm run lint
```

## Переменные окружения

| Переменная | Где задавать | Назначение |
| --- | --- | --- |
| `OPENAI_API_KEY` | Только Vercel Environment Variables / локальный `.env.local` | Секрет OpenAI API. Никогда не добавлять в GitHub, frontend или переменную `VITE_*`. |
| `OPENAI_MODEL` | Vercel / локальный `.env.local` | Имя модели, доступной вашему OpenAI API аккаунту, например `gpt-4.1-mini`. |
| `ALLOWED_ORIGINS` | Vercel / локальный `.env.local` | Разрешённые origin через запятую, без путей: `https://username.github.io`. |
| `VITE_API_BASE_URL` | GitHub Actions Repository Variable либо локальная frontend-сборка | Публичный URL backend, например `https://your-project.vercel.app`; это не секрет. Пустое значение использует текущий origin и подходит для Vercel Dev. |

Настройте точный `ALLOWED_ORIGINS` для GitHub Pages в Vercel. Для URL вида `https://username.github.io/project/` origin — `https://username.github.io` (без `/project/`). CORS не является аутентификацией и сам по себе не защищает endpoint от прямых запросов.

## Публикация backend на Vercel

1. Импортируйте этот GitHub-репозиторий в Vercel. Конфигурация в `vercel.json` собирает frontend и публикует функцию `api/chat.ts`.
2. В **Project → Settings → Environment Variables** добавьте `OPENAI_API_KEY`, `OPENAI_MODEL`, `ALLOWED_ORIGINS` для Production (и Preview, если нужно).
3. `OPENAI_API_KEY` получите в панели OpenAI API. Для API-использования может требоваться отдельная настройка биллинга. Не вставляйте ключ в браузер.
4. Разверните проект и проверьте `https://ваш-проект.vercel.app/api/chat` — GET должен вернуть `405`, это подтверждает наличие функции.

Функция проверяет HTTP-метод, origin, размер тела и сообщений, ограничивает историю 20 сообщениями, число символов на сообщение, время и длину ответа. Есть best-effort лимит 12 запросов на 10 минут на экземпляр функции. Память serverless-функции не общая между экземплярами, поэтому для надёжного production rate limiting добавьте общий Redis/KV лимитер; это не заменяется CORS. Установите также лимиты расходов/оповещения в OpenAI Platform.

## Публикация frontend на GitHub Pages

1. В GitHub откройте **Settings → Secrets and variables → Actions → Variables** и создайте `VITE_API_BASE_URL` со значением URL Vercel backend, например `https://your-project.vercel.app`.
2. В **Settings → Pages → Build and deployment** выберите **GitHub Actions**. Workflow `.github/workflows/deploy-pages.yml` собирает и публикует `dist` при push в `main`.
3. Не передавайте `OPENAI_API_KEY` в GitHub Actions. После деплоя GitHub Pages origin должен совпадать с одним из значений `ALLOWED_ORIGINS` на Vercel. После изменения frontend variable пересоберите Pages.

Vite использует относительный `base: './'`, подходящий для проекта GitHub Pages. Frontend build не требует OpenAI SDK key — он обращается к публичному URL API.

## API

`POST /api/chat`

```json
{
  "messages": [
    { "role": "user", "content": "Кенесары көтерілісінің себептері қандай?" }
  ]
}
```

Успешный ответ содержит только текст ответа:

```json
{ "answer": "..." }
```

## Исторические изображения

`src/assets/steppe-hero.svg` — оригинальная художественная реконструкция, созданная для сайта. Это не архивная фотография и не точный портрет исторических лиц. Портретная галерея использует явно подписанные условные силуэты.

# АЗАТТЫҚ — Тарихтың ізімен

Интерактивный сайт об истории национально-освободительных восстаний в Казахстане (1783–1916), созданный на React, TypeScript и Vite. Раздел «AI тарихшы — виртуалды оқытушы» использует отдельную серверную функцию Vercel и официальный Google Gen AI SDK для Gemini API. Ключ Gemini хранится только на сервере и никогда не передаётся в frontend.

## Локальный запуск сайта и API

Требуются Node.js 20+ и npm.

```sh
npm ci
npm install --global vercel
```

Скопируйте `.env.example` в `.env.local` и задайте настройки:

```env
GEMINI_API_KEY=ваш-серверный-ключ
GEMINI_MODEL=gemini-3.1-flash-lite
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
| `GEMINI_API_KEY` | Только Vercel Environment Variables / локальный `.env.local` | Секрет Gemini API. Никогда не добавлять в GitHub, frontend или переменную `VITE_*`. Создаётся в [Google AI Studio](https://aistudio.google.com/apikey). |
| `GEMINI_MODEL` | Vercel / локальный `.env.local` | Имя модели Gemini. Рекомендуемое значение: `gemini-3.1-flash-lite`. Если не задано, backend использует это значение по умолчанию. |
| `ALLOWED_ORIGINS` | Vercel / локальный `.env.local` | Разрешённые origin через запятую, без путей: `https://username.github.io`. |
| `VITE_API_BASE_URL` | GitHub Actions Repository Variable либо локальная frontend-сборка | Публичный URL backend, например `https://your-project.vercel.app`; это не секрет. Пустое значение использует текущий origin и подходит для Vercel Dev. |

Настройте точный `ALLOWED_ORIGINS` для GitHub Pages в Vercel. Для URL вида `https://username.github.io/project/` origin — `https://username.github.io` (без `/project/`). CORS не является аутентификацией и сам по себе не защищает endpoint от прямых запросов.

## Публикация backend на Vercel

1. Импортируйте этот GitHub-репозиторий в Vercel с корневой директорией `./`. Конфигурация в `vercel.json` собирает frontend и публикует функцию `api/chat.ts`.
2. В **Project → Settings → Environment Variables** добавьте `GEMINI_API_KEY`, `GEMINI_MODEL` и `ALLOWED_ORIGINS` для **Production** и **Preview** (или только нужных сред).
3. Создайте ключ в [Google AI Studio](https://aistudio.google.com/apikey) и добавьте его в Vercel как `GEMINI_API_KEY`. Не вставляйте его в браузер, GitHub Actions или `VITE_*` переменную.
4. Рекомендуемая модель — `gemini-3.1-flash-lite`: Google указывает текстовую генерацию, а текущая таблица тарифов показывает Free Tier. Казахстан указан в списке доступных регионов Gemini API. Бесплатная квота и лимиты зависят от конкретного проекта/аккаунта — проверьте их в [AI Studio Rate Limits](https://aistudio.google.com/rate-limit); наличие региона само по себе бесплатную квоту не гарантирует. Google указывает, что данные Free Tier могут использоваться для улучшения продуктов; не отправляйте в чат персональные или конфиденциальные сведения.
5. Сохраните существующие `OPENAI_API_KEY` и `OPENAI_MODEL` в Vercel, пока не проверите Gemini после развертывания. Новый код их не использует. После успешного теста их можно удалить вручную.
6. Разверните проект и проверьте `https://ваш-проект.vercel.app/api/chat` — GET должен вернуть `405`, это подтверждает наличие функции.

Функция проверяет HTTP-метод, origin, размер тела и сообщений, ограничивает историю 20 сообщениями, число символов на сообщение, время запроса и длину ответа. Есть best-effort лимит 12 запросов на 10 минут на экземпляр функции. Память serverless-функции не общая между экземплярами, поэтому для надёжного production rate limiting добавьте общий Redis/KV лимитер; это не заменяется CORS. Проверяйте расход и квоты проекта в Google AI Studio.

## Публикация frontend на GitHub Pages

1. В GitHub откройте **Settings → Secrets and variables → Actions → Variables** и создайте `VITE_API_BASE_URL` со значением URL Vercel backend, например `https://your-project.vercel.app`.
2. В **Settings → Pages → Build and deployment** выберите **GitHub Actions**. Workflow `.github/workflows/deploy-pages.yml` собирает и публикует `dist` при push в `main`.
3. Не передавайте `OPENAI_API_KEY` в GitHub Actions. После деплоя GitHub Pages origin должен совпадать с одним из значений `ALLOWED_ORIGINS` на Vercel. После изменения frontend variable пересоберите Pages.

Vite использует относительный `base: './'`, подходящий для проекта GitHub Pages. Frontend build не требует Gemini API key — он обращается к публичному URL API.

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

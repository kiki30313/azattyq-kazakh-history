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
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=your-supabase-publishable-key
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

## Аккаунты, тестовые баллы и администрирование Supabase

### 1. Создание проекта и применение схемы

1. Создайте проект в [Supabase Dashboard](https://supabase.com/dashboard).
2. Откройте **SQL Editor → New query**, скопируйте содержимое [`supabase/schema.sql`](./supabase/schema.sql) и выполните один раз. Миграция создаёт профиль со студенческой ролью при регистрации, тест и вопросы, таблицы попыток и журнал балльных корректировок, RLS и защищённые RPC-функции.
3. В **Authentication → Providers → Email** включите Email provider и подтверждение адреса. Настройте SMTP, если нужны надёжные production-письма.
4. В **Authentication → URL Configuration** задайте Site URL `https://azattyq-kazakh-history.vercel.app` и добавьте разрешённые Redirect URLs для production и локальной разработки, включая `https://azattyq-kazakh-history.vercel.app/**` и `http://localhost:5173/**`. Если используется GitHub Pages, также добавьте точный URL страницы и путь проекта.

### 2. Переменные окружения

В **Vercel → Project → Settings → Environment Variables** добавьте публичные настройки для **Production**, а также **Preview**, если тестируете preview-деплои:

| Переменная | Значение |
| --- | --- |
| `VITE_SUPABASE_URL` | Project URL из **Supabase → Project Settings → API** |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Publishable key из того же раздела (старый anon key также публичный, но предпочтителен publishable key) |

Те же два значения добавьте в **GitHub → Settings → Secrets and variables → Actions → Variables** с такими же именами, чтобы GitHub Pages workflow мог собрать frontend. Эти значения рассчитаны на клиентское использование; безопасность данных обеспечивается RLS. **Не используйте и не публикуйте `service_role`/secret key.** Для этой реализации привилегированные серверные ключи не нужны.

Для локальной разработки скопируйте `.env.example` в `.env.local`, задайте Supabase Project URL и publishable key, затем запустите `npm run dev`. `.env.local` игнорируется Git.

### 3. Первый администратор

1. Зарегистрируйте аккаунт через сайт и подтвердите email.
2. В Supabase **SQL Editor** выполните запрос, подставив свой точный email:

```sql
update public.profiles
set role = 'admin'
where email = lower('your-admin@example.com');
```

Убедитесь, что обновлена ровно одна строка. Это действие выполняется только из защищённого Dashboard/SQL Editor. Публичной регистрации администраторов нет; регистрационные metadata не используются для назначения роли. После изменения роли выйдите и войдите в аккаунт заново.

### 4. Проверка

- Зарегистрируйте отдельный студенческий тестовый аккаунт, подтвердите email и войдите.
- Пройдите **Тарихи викторина** на странице игр. Балл вычисляет `submit_assessment` в Postgres из сохранённых сервером правильных ответов, а попытка привязывается к `auth.uid()`. Повторная отправка того же UUID попытки идемпотентна; новая попытка получает новый UUID.
- Для защиты от повторного набора баллов на один аккаунт разрешена одна сохранённая попытка на каждый тест. Повторный submit или повторное прохождение не создаёт новую начисляемую запись.
- Откройте личный кабинет и проверьте сохранённый результат. Попытки студент может только читать; вставка, изменение/удаление оценок и изменение роли не разрешены политиками/правами таблиц.
- Остальные четыре интерактивных мини-игры остаются учебными упражнениями в браузере. Их локальные показатели не сохраняются и не добавляются к баллам профиля.
- С аккаунта студента откройте `/#admin` — панель должна отказать в доступе. С аккаунта, которому роль назначена SQL-командой, проверьте поиск, историю, журнал и корректировку баллов с обязательной причиной.

Маршруты `/login`, `/register`, `/profile` и `/admin` обслуживаются Vercel rewrite; на GitHub Pages используйте hash-маршруты `/#login`, `/#register`, `/#profile` и `/#admin`. Вкладка **Admin** защищена не только интерфейсом: каждый административный RPC повторно проверяет роль из `profiles`, а чтение таблиц ограничено RLS. Тестовые ответы не выдаются RPC для списка вопросов. Не считайте проверки в браузере границей безопасности.

## Исторические изображения

`src/assets/steppe-hero.svg` — оригинальная художественная реконструкция, созданная для сайта. Это не архивная фотография и не точный портрет исторических лиц. Портретная галерея использует явно подписанные условные силуэты.

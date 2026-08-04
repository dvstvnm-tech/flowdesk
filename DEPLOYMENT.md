# Flowdesk — развёртывание в облаке (пошагово)

Инструкция «от нуля до рабочей ссылки». Всего 4 шага, займёт 20–30 минут.
Все сервисы бесплатны для команды такого размера.

---

## Шаг 1. Создать проект Supabase (база данных + авторизация + realtime)

1. Зайдите на **[supabase.com](https://supabase.com)** → Sign up → **New project**.
2. Укажите имя (например `flowdesk`), пароль базы данных (сохраните его), регион ближе к Казахстану.
3. Подождите 1–2 минуты, пока проект поднимется.
4. Слева: **Database → Extensions** → найдите **pg_cron** → включите (он нужен для автоматических напоминаний о дедлайнах).
5. Слева: **SQL Editor → New query** → скопируйте содержимое файла **`supabase/schema.sql`** из этого проекта целиком → вставьте → **Run**.
   - Если строка `select cron.schedule(...)` в конце выдаст ошибку — значит pg_cron не включился с первого раза; вернитесь к шагу 4, включите его и выполните только эту одну строку заново.
6. Слева: **Project Settings → API** — скопируйте и сохраните:
   - **Project URL** (`https://xxxxx.supabase.co`)
   - **anon public key** (строка, начинается с `eyJ...`)

---

## Шаг 2. Настроить вход через Google

1. **[console.cloud.google.com](https://console.cloud.google.com)** → создайте проект (или используйте существующий).
2. **APIs & Services → OAuth consent screen** — тип **Internal** (если Google Workspace всей компании) или **External**. Укажите название приложения «Flowdesk» — Save.
3. **APIs & Services → Credentials → Create Credentials → OAuth client ID** → Application type **Web application**.
4. **Authorized redirect URIs** — добавьте:
   ```
   https://ВАШ-ПРОЕКТ.supabase.co/auth/v1/callback
   ```
   (это адрес Supabase из Шага 1, не адрес будущего сайта).
5. Create → скопируйте **Client ID** и **Client Secret**.
6. В Supabase → **Authentication → Providers → Google** → включите, вставьте Client ID и Client Secret → Save.

---

## Шаг 3. Проверить Storage (для файлов и изображений в комментариях)

Bucket `attachments` создаётся автоматически скриптом из Шага 1. Проверить:
**Storage** в левом меню Supabase — там должен быть bucket `attachments` (не публичный).

---

## Шаг 4. Задеплоить на Vercel

1. Загрузите проект в GitHub:
   ```bash
   git init
   git add .
   git commit -m "Flowdesk"
   git branch -M main
   git remote add origin https://github.com/ВАШ-АККАУНТ/flowdesk.git
   git push -u origin main
   ```
2. **[vercel.com](https://vercel.com)** → Sign up через GitHub → **Add New… → Project** → выберите репозиторий → **Import**.
3. Framework Preset определится как **Next.js** автоматически.
4. **Environment Variables** — добавьте:
   | Name | Value |
   |---|---|
   | `NEXT_PUBLIC_SUPABASE_URL` | из Шага 1 |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | из Шага 1 |
5. **Deploy**. Через 1–2 минуты получите ссылку вида `https://flowdesk-ваш-аккаунт.vercel.app`.
6. Откройте ссылку → «Войти через Google» → при первом входе профиль создастся автоматически.

**Каждый `git push` в `main` автоматически публикует новую версию.**

---

## Первый администратор

Все новые пользователи получают роль `employee` по умолчанию. Чтобы назначить
администратора: Supabase → **Table Editor → profiles** → найдите свою строку
по email → поле `role` → `administrator` → Save.

---

## Локальная разработка (по желанию)

```bash
npm install
cp .env.local.example .env.local   # вписать значения из Шага 1
npm run dev
```
Открывается на `http://localhost:3000` — годится только для разработки на
одном компьютере; для совместной работы всей команды нужна ссылка из Vercel.

---

## Частые проблемы

- **«redirect_uri_mismatch»** — проверьте Redirect URI в Google Cloud Console:
  должен быть `https://ВАШ-ПРОЕКТ.supabase.co/auth/v1/callback`, а не адрес Vercel.
- **После входа сразу перекидывает на /login** — проверьте переменные окружения
  в Vercel и сделайте Redeploy после их изменения.
- **Realtime не работает** — проверьте, что команды `alter publication
  supabase_realtime add table ...` в конце `schema.sql` выполнились без ошибок.
- **Напоминания о дедлайне не приходят** — убедитесь, что расширение `pg_cron`
  включено (Шаг 1.4) и что строка `select cron.schedule(...)` выполнилась без ошибок.
- **Не получается прикрепить файл к комментарию** — проверьте, что bucket
  `attachments` существует в Storage.

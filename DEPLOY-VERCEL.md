# Deploying to Vercel

The app is a TanStack Start (SSR) app. Nitro auto-detects Vercel during `vite build`
and emits the Build Output API bundle to `.vercel/output`, which `vercel.json` points at.

## 1. Environment variables (Project Settings → Environment Variables)

Server-side (no `VITE_` prefix):

| Name | Value |
| --- | --- |
| `TELEGRAM_BOT_TOKEN` | your bot token from @BotFather |
| `TELEGRAM_BOT_USERNAME` | `ilnkbot` |
| `SUPABASE_URL` | same as `VITE_SUPABASE_URL` |
| `SUPABASE_PUBLISHABLE_KEY` | same as `VITE_SUPABASE_PUBLISHABLE_KEY` |
| `SUPABASE_SERVICE_ROLE_KEY` | service role key of the backend project |
| `PUBLIC_SITE_URL` | e.g. `https://your-domain.com` (optional; falls back to the Vercel URL) |

Client-side: `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_SUPABASE_PROJECT_ID`.

## 2. Point the Telegram webhook at the Vercel domain

```bash
SECRET=$(node -e "console.log(require('crypto').createHash('sha256').update('telegram-webhook:'+process.env.TELEGRAM_BOT_TOKEN).digest('base64url'))")

curl -sS "https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/setWebhook" \
  -H 'Content-Type: application/json' \
  -d '{
    "url": "https://YOUR-DOMAIN/api/public/telegram/webhook",
    "secret_token": "'"$SECRET"'",
    "allowed_updates": ["message", "edited_message"]
  }'
```

Verify with `getWebhookInfo`.

## 3. Notes

- After verification the bot replies with an inline button linking back to
  `PUBLIC_SITE_URL/?verified=<code>`; the site resumes and shows the success state.
- Static assets are served with a one-year immutable cache; the webhook route is `no-store`.
- Do not commit real secrets — set them in Vercel only.

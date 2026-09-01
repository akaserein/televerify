import { createFileRoute } from "@tanstack/react-router";
import { createHash, timingSafeEqual } from "crypto";

function deriveSecret(token: string) {
  return createHash("sha256").update(`telegram-webhook:${token}`).digest("base64url");
}

function safeEqual(a: string, b: string) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

/** Public site URL: explicit env first, then Vercel-provided hosts, then the request origin. */
function resolveSiteUrl(request: Request) {
  const explicit = process.env["PUBLIC_SITE_URL"];
  if (explicit) return explicit.replace(/\/$/, "");
  const vercelProd = process.env["VERCEL_PROJECT_PRODUCTION_URL"];
  if (vercelProd) return `https://${vercelProd}`;
  const vercel = process.env["VERCEL_URL"];
  if (vercel) return `https://${vercel}`;
  return new URL(request.url).origin;
}

type ReplyMarkup = {
  inline_keyboard: { text: string; url: string }[][];
};

async function sendMessage(
  token: string,
  chatId: number,
  text: string,
  replyMarkup?: ReplyMarkup,
) {
  await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: "HTML",
      disable_web_page_preview: true,
      ...(replyMarkup ? { reply_markup: replyMarkup } : {}),
    }),
  });
}

export const Route = createFileRoute("/api/public/telegram/webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const token = process.env["TELEGRAM_BOT_TOKEN"];
        if (!token) return new Response("Not configured", { status: 500 });

        const provided = request.headers.get("X-Telegram-Bot-Api-Secret-Token") ?? "";
        if (!safeEqual(provided, deriveSecret(token))) {
          return new Response("Unauthorized", { status: 401 });
        }

        const siteUrl = resolveSiteUrl(request);
        const update = (await request.json()) as any;
        const message = update?.message ?? update?.edited_message;
        const text: string = message?.text ?? "";
        const from = message?.from;
        const chatId: number | undefined = message?.chat?.id;
        if (!from || !chatId) return Response.json({ ok: true });

        const match = /^\/start\s+([A-Z0-9]{6,16})$/.exec(text.trim());
        if (!match) {
          await sendMessage(
            token,
            chatId,
            "To verify, open the website, enter your Telegram username or UID, then tap the button you get there.",
            { inline_keyboard: [[{ text: "Open website", url: siteUrl }]] },
          );
          return Response.json({ ok: true });
        }

        const code = match[1]!;
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: row } = await supabaseAdmin
          .from("telegram_verifications")
          .select("id, identifier, identifier_type, status, expires_at")
          .eq("code", code)
          .maybeSingle();

        if (!row) {
          await sendMessage(token, chatId, "❌ This code is not valid.");
          return Response.json({ ok: true });
        }

        if (row.status === "verified") {
          await sendMessage(token, chatId, "✅ This code has already been verified.", {
            inline_keyboard: [[{ text: "Go to website", url: siteUrl }]],
          });
          return Response.json({ ok: true });
        }

        if (new Date(row.expires_at as string) < new Date()) {
          await sendMessage(token, chatId, "⌛ This code has expired. Get a new one on the website.", {
            inline_keyboard: [[{ text: "Get a new code", url: siteUrl }]],
          });
          return Response.json({ ok: true });
        }

        const username: string | undefined = from.username;
        const matches =
          row.identifier_type === "uid"
            ? String(from.id) === row.identifier
            : (username ?? "").toLowerCase() === row.identifier;

        if (!matches) {
          await supabaseAdmin
            .from("telegram_verifications")
            .update({
              status: "failed",
              telegram_user_id: from.id,
              telegram_username: username ?? null,
              telegram_first_name: from.first_name ?? null,
              error_message: "Account mismatch",
            })
            .eq("id", row.id);
          await sendMessage(
            token,
            chatId,
            "❌ Your Telegram account does not match the username/UID entered on the website.",
            { inline_keyboard: [[{ text: "Try again", url: siteUrl }]] },
          );
          return Response.json({ ok: true });
        }

        await supabaseAdmin
          .from("telegram_verifications")
          .update({
            status: "verified",
            telegram_user_id: from.id,
            telegram_username: username ?? null,
            telegram_first_name: from.first_name ?? null,
            verified_at: new Date().toISOString(),
            error_message: null,
          })
          .eq("id", row.id);

        await sendMessage(
          token,
          chatId,
          "✅ <b>Verification successful!</b>\nYour Telegram account is verified. Tap below to return to the site.",
          {
            inline_keyboard: [
              [{ text: "🔗 Open the site", url: `${siteUrl}/?verified=${code}` }],
            ],
          },
        );
        return Response.json({ ok: true });
      },
    },
  },
});

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

async function sendMessage(token: string, chatId: number, text: string) {
  await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text }),
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
            "Verify karne ke liye website par apna username daalein aur wahan diye gaye link par click karein.",
          );
          return Response.json({ ok: true });
        }

        const code = match[1];
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: row } = await supabaseAdmin
          .from("telegram_verifications")
          .select("id, identifier, identifier_type, status, expires_at")
          .eq("code", code)
          .maybeSingle();

        if (!row) {
          await sendMessage(token, chatId, "❌ Ye code valid nahi hai.");
          return Response.json({ ok: true });
        }

        if (row.status === "verified") {
          await sendMessage(token, chatId, "✅ Ye code pehle hi verify ho chuka hai.");
          return Response.json({ ok: true });
        }

        if (new Date(row.expires_at as string) < new Date()) {
          await sendMessage(token, chatId, "⌛ Code expire ho gaya. Website par naya code lein.");
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
            "❌ Aapka Telegram account website par diye gaye username/UID se match nahi karta.",
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

        await sendMessage(token, chatId, "✅ Verification successful! Ab website par wapas jaayein.");
        return Response.json({ ok: true });
      },
    },
  },
});

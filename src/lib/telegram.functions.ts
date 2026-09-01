import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const identifierSchema = z
  .string()
  .trim()
  .min(2, { message: "Enter your Telegram username or UID" })
  .max(64, { message: "That is too long" })
  .regex(/^@?[A-Za-z0-9_]{2,64}$/, {
    message: "Only letters, numbers and _ are allowed",
  });

function makeCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  const bytes = crypto.getRandomValues(new Uint8Array(10));
  for (const b of bytes) out += alphabet[b % alphabet.length];
  return out;
}

export const startVerification = createServerFn({ method: "POST" })
  .inputValidator((data: { identifier: string }) =>
    z.object({ identifier: identifierSchema }).parse(data),
  )
  .handler(async ({ data }) => {
    const raw = data.identifier.replace(/^@/, "");
    const isNumeric = /^\d+$/.test(raw);
    const code = makeCode();

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("telegram_verifications").insert({
      code,
      identifier: isNumeric ? raw : raw.toLowerCase(),
      identifier_type: isNumeric ? "uid" : "username",
    });

    if (error) throw new Error("Could not start verification, please try again");

    const botUsername = process.env["TELEGRAM_BOT_USERNAME"] || "ilnkbot";
    return {
      code,
      link: `https://t.me/${botUsername}?start=${code}`,
      botUsername,
    };
  });

export const checkVerification = createServerFn({ method: "POST" })
  .inputValidator((data: { code: string }) =>
    z.object({ code: z.string().trim().regex(/^[A-Z0-9]{6,16}$/) }).parse(data),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row, error } = await supabaseAdmin
      .from("telegram_verifications")
      .select(
        "status, telegram_username, telegram_user_id, telegram_first_name, error_message, expires_at",
      )
      .eq("code", data.code)
      .maybeSingle();

    if (error || !row) return { status: "unknown" as const };

    if (row.status === "pending" && new Date(row.expires_at as string) < new Date()) {
      return { status: "expired" as const };
    }

    return {
      status: row.status as "pending" | "verified" | "failed",
      username: row.telegram_username as string | null,
      userId: row.telegram_user_id ? String(row.telegram_user_id) : null,
      firstName: row.telegram_first_name as string | null,
      error: row.error_message as string | null,
    };
  });

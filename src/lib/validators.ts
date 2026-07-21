import { z } from "zod";

// Username: 3-30 chars, lowercase letters/numbers/underscore, used in the URL.
export const usernameSchema = z
  .string()
  .trim()
  .min(3)
  .max(30)
  .regex(/^[a-z0-9_]+$/, "username_invalid");

export const registerSchema = z.object({
  email: z.string().trim().email().toLowerCase(),
  password: z.string().min(8).max(100),
  displayName: z.string().trim().min(1).max(60),
  username: usernameSchema,
});

export const profileSchema = z.object({
  displayName: z.string().trim().min(1).max(60),
  username: usernameSchema,
  bio: z.string().trim().max(300).optional().or(z.literal("")),
  // PromptPay id: Thai phone (0812345678) or 13-digit national id.
  promptpayId: z
    .string()
    .trim()
    .regex(/^(0\d{9}|\d{13})$/, "promptpay_invalid")
    .optional()
    .or(z.literal("")),
  autoConfirmTips: z.boolean().optional(),
  goalTitle: z.string().trim().max(80).optional().or(z.literal("")),
  goalAmount: z.coerce
    .number()
    .min(0)
    .max(100000000)
    .optional()
    .or(z.literal("")),
  // Social links: each an http(s) URL or empty (empty = clear that platform).
  socialLinks: z
    .record(
      z.string(),
      z
        .string()
        .trim()
        .max(300)
        .regex(/^https?:\/\/.+/i, "url_invalid")
        .or(z.literal("")),
    )
    .optional(),
});

export const tipSchema = z.object({
  // Empty name is allowed → displayed as "Anonymous".
  supporterName: z.string().trim().max(60).default(""),
  message: z.string().trim().max(300).default(""),
  amount: z.coerce.number().positive().min(1).max(100000),
});
// NOTE: do NOT use z.coerce.boolean() for checkbox values — Boolean("false")
// is true. Parse isMessagePublic manually (=== "true") in the route.

export const reviewSchema = z.object({
  name: z.string().trim().max(60).default(""),
  rating: z.coerce.number().int().min(1).max(5),
  comment: z.string().trim().min(1).max(500),
});

export const reportSchema = z.object({
  category: z.enum(["bug", "payment", "suggestion", "other"]).default("other"),
  message: z.string().trim().min(1).max(1000),
});

export const forgotSchema = z.object({
  email: z.string().trim().email().toLowerCase(),
  locale: z.enum(["th", "en"]).optional(),
});

export const resetSchema = z.object({
  token: z.string().min(10),
  password: z.string().min(8).max(100),
});

export const qrSchema = z.object({
  username: usernameSchema,
  amount: z.coerce.number().positive().min(1).max(100000),
});

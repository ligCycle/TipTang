// Lightweight profanity filter. Masks offensive words with asterisks so tips
// still go through but stay stream-safe. Applied at WRITE time (tips/reviews)
// so every read site — profile, leaderboard, OBS overlay, TTS, email — gets the
// cleaned text automatically.
//
// Two lists: Thai has no word boundaries → substring match; English uses word
// boundaries to avoid false positives (e.g. "ass" in "class"/"pass").

const TH_WORDS = [
  "ควย",
  "เหี้ย",
  "สัส",
  "สัด",
  "เย็ด",
  "แตด",
  "ระยำ",
  "พ่อง",
  "แม่ง",
  "ไอ้สัส",
  "อีดอก",
  "กระหรี่",
  "ดอกทอง",
  "สถุน",
  "จัญไร",
];

// Standalone หี is easy to over-match; keep a couple of explicit forms instead.
const TH_EXTRA = ["หีเน่า", "หมาหี"];

const EN_WORDS = [
  "fuck",
  "fucking",
  "shit",
  "bitch",
  "asshole",
  "dick",
  "cunt",
  "pussy",
  "bastard",
  "motherfucker",
  "slut",
  "whore",
  "nigger",
  "retard",
];

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const TH_RE = new RegExp(
  [...TH_WORDS, ...TH_EXTRA].map(escapeRegex).join("|"),
  "g",
);
const EN_RE = new RegExp(
  `\\b(?:${EN_WORDS.map(escapeRegex).join("|")})\\b`,
  "gi",
);

function mask(match: string): string {
  // Keep the first character, mask the rest — still readable as "censored".
  if (match.length <= 1) return "*";
  return match[0] + "*".repeat(match.length - 1);
}

/** Replace offensive words with a masked form. Safe on empty/undefined input. */
export function censorText(input: string | null | undefined): string {
  if (!input) return input ?? "";
  return input.replace(TH_RE, mask).replace(EN_RE, mask);
}

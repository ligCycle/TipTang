-- OBS alert card theme: "light" (original gradient card) or "dark" (glow card).
-- Existing creators keep the light card.
ALTER TABLE "User" ADD COLUMN "alertTheme" TEXT NOT NULL DEFAULT 'light';

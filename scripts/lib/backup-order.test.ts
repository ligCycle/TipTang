import { test } from "node:test";
import assert from "node:assert/strict";
import { restoreOrder, type ForeignKey } from "./backup-order.ts";

// TipTang's schema as of 2026-09-30.
const TABLES = [
  "AlertAsset",
  "EmailVerificationToken",
  "PasswordResetToken",
  "Report",
  "Review",
  "ShopItem",
  "ShopOrder",
  "Tip",
  "User",
];
const FKS: ForeignKey[] = [
  { table: "AlertAsset", references: "User" },
  { table: "EmailVerificationToken", references: "User" },
  { table: "PasswordResetToken", references: "User" },
  { table: "Report", references: "User" },
  { table: "ShopItem", references: "User" },
  { table: "ShopOrder", references: "User" },
  { table: "ShopOrder", references: "ShopItem" },
  { table: "Tip", references: "User" },
];

test("parents come before children, deterministically", () => {
  assert.deepEqual(restoreOrder(TABLES, FKS), [
    "Review",
    "User",
    "AlertAsset",
    "EmailVerificationToken",
    "PasswordResetToken",
    "Report",
    "ShopItem",
    "Tip",
    "ShopOrder",
  ]);
});

test("foreign keys of tables not being restored are ignored", () => {
  assert.deepEqual(restoreOrder(["User", "Tip"], FKS), ["User", "Tip"]);
});

test("a table referencing one missing from the backup is an error", () => {
  assert.throws(() => restoreOrder(["Tip"], FKS), /User/);
});

test("self-references and cycles are errors", () => {
  assert.throws(() => restoreOrder(["A"], [{ table: "A", references: "A" }]), /A/);
  assert.throws(
    () =>
      restoreOrder(
        ["A", "B"],
        [
          { table: "A", references: "B" },
          { table: "B", references: "A" },
        ],
      ),
    /A, B/,
  );
});

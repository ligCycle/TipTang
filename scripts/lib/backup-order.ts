/** "rows of `table` point at rows of `references`" (one per FK constraint). */
export type ForeignKey = { table: string; references: string };

/**
 * Order to insert tables so every foreign key's target already exists
 * (User before Tip, ShopItem before ShopOrder). Tables with no remaining
 * dependencies go in alphabetical order, so the result is stable.
 */
export function restoreOrder(tables: string[], fks: ForeignKey[]): string[] {
  const wanted = new Set(tables);
  const deps = new Map<string, Set<string>>();
  for (const t of tables) deps.set(t, new Set());

  for (const fk of fks) {
    if (!wanted.has(fk.table)) continue;
    if (fk.table === fk.references) {
      throw new Error(`ตาราง ${fk.table} อ้างถึงตัวเอง — สคริปต์นี้ยังเรียงลำดับแบบนั้นไม่ได้`);
    }
    if (!wanted.has(fk.references)) {
      throw new Error(`ตาราง ${fk.table} อ้างถึง ${fk.references} ซึ่งไม่มีใน backup`);
    }
    deps.get(fk.table)?.add(fk.references);
  }

  const order: string[] = [];
  const done = new Set<string>();
  while (order.length < tables.length) {
    const ready = tables
      .filter((t) => !done.has(t) && [...(deps.get(t) ?? [])].every((d) => done.has(d)))
      .sort();
    if (ready.length === 0) {
      const stuck = tables.filter((t) => !done.has(t)).sort();
      throw new Error(`foreign key วนกันเป็นวงระหว่าง: ${stuck.join(", ")}`);
    }
    for (const t of ready) {
      order.push(t);
      done.add(t);
    }
  }
  return order;
}

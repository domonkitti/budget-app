# Virtual Sub-Job Row (งานรวม) Logic

File: `app/projects/[code]/page.tsx`

---

## What It Is

When a project has **no real sub-jobs**, the sub-jobs table shows one auto-generated scratch row called **งานรวม**.

Controlled by:
```ts
const hasVirtualSjRow = activeSjGroups.length === 0 && newSjNames.length === 0 && allYears.length > 0
```

- Rendered by `renderVirtualSubJobRow()`
- Stored in `pendingNew` under keys `sj-new|งานรวม|{year}|ผูกพัน` and `sj-new|งานรวม|{year}|ลงทุน`
- **Never saved to DB** — filtered out in `saveAll()`:
  ```ts
  nr.name_or_source !== DEFAULT_VIRTUAL_SJ_NAME
  ```

`DEFAULT_VIRTUAL_SJ_NAME = "งานรวม"` is a module-level const (above the component).

---

## Display Logic

Every render, values are pulled from `bsYearTotal(year)` — the sum of all budget source rows:

| Cell | Value |
|------|-------|
| ผูกพัน budget | `sc_b` = Σ committed budgets across all BS sources |
| ลงทุน budget | `si_b` = Σ invest budgets across all BS sources |
| ผูกพัน target | `sc_t` |
| ลงทุน target | `si_t` |
| cut_transfer | `total_ct` = Σ cut_transfer from all BS rows |
| under_budget | `total_ub` |

Init values passed into `makeVirtualCell`:
```ts
commInit = { budget: sc_b, target: sc_t, cut_transfer: total_ct, under_budget: total_ub }
invInit  = { budget: si_b, target: si_t, cut_transfer: 0,         under_budget: 0 }
```

When the user first clicks a cell → `pendingNew` is seeded from `commInit` / `invInit`. After that, displayed value = `pendingNew` value.

Target columns are special: they always mirror `sc_t` / `si_t` unless the user has directly edited them (`directEditCells`).

---

## Carry-Forward Logic (makeForwardRecalc)

When the user commits an edit, `commitEdit` calls `makeForwardRecalc` — same as real rows. But since `project.sub_jobs` is empty, two inner helpers needed virtual-row fallbacks:

### getFundValues (counterpart fund-type lookup)

When computing carry-forward for ผูกพัน, the function needs the ลงทุน budget/target (and vice versa). For real rows it looks up `project.sub_jobs`. For the virtual row, there are no entries → must fall back to `bsYearTotal`.

**Fix:**
```ts
if (!pn && prefix === "sj" && groupName === DEFAULT_VIRTUAL_SJ_NAME) {
  const bst = bsYearTotal(year)
  return fundType === "ผูกพัน"
    ? { budget: bst.sc_b, target: bst.sc_t }
    : { budget: bst.si_b, target: bst.si_t }
}
```

### getCtUb (cut_transfer + under_budget for carry calc)

For real rows it sums ct/ub from the actual DB rows. For the virtual row, all candidates are null → was returning `{ct:0, ub:0}`.

**Fix:**
```ts
if (candidates.every(c => !c) && prefix === "sj" && groupName === DEFAULT_VIRTUAL_SJ_NAME) {
  if (source.fund_type === "ผูกพัน") {
    ct = source.cut_transfer ?? 0   // commInit already carries total_ct
    ub = source.under_budget ?? 0
  } else {
    // editing ลงทุน — get from ผูกพัน pendingNew or fall back to bsYearTotal
    const pnc = pendingNew.get(`sj-new|${groupName}|${year}|ผูกพัน`)
             ?? extraPendingNew.get(`sj-new|${groupName}|${year}|ผูกพัน`)
    const bst = bsYearTotal(year)
    ct = pnc?.cut_transfer ?? bst.total_ct
    ub = pnc?.under_budget ?? bst.total_ub
  }
}
```

### Correct carry-forward formula

Without fix: `(X - sc_t) + 0 + 0`

With fix: `(X - sc_t) + (si_b - si_t) + total_ct + total_ub`

---

## Key Invariants

- Budget source rows always show their own DB values, unchanged.
- The virtual row mirrors BS totals on every render; edits live only in `pendingNew`.
- `bsYearTotal` is a function declaration (hoisted) so `makeForwardRecalc` (defined earlier in the file) can call it.
- The cascade loop always breaks after the first step for the virtual row (no next-year ผูกพัน row in `project.sub_jobs`), so `getCtUb` is only ever called with `source.data_year`.

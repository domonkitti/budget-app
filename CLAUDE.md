@AGENTS.md

# budget-app

Next.js frontend for the budget app.

## Stack
- Next.js (App Router), TypeScript, Tailwind CSS, Playwright (testing)

## Run locally
```bash
cp .env.local.example .env.local
npm run dev
```
API base: `NEXT_PUBLIC_API_URL` (default `http://localhost:8080/api/v1`)

## File layout
```
app/
  layout.tsx                          ← root layout, wraps SnapshotProvider
  page.tsx                            ← home / project list
  SnapshotProvider.tsx                ← context for active snapshot
  categories/page.tsx                 ← tag category management
  category/
    page.tsx                          ← category list
    [category]/page.tsx               ← category detail
    [category]/allocate/page.tsx      ← allocation editor
  projects/[code]/page.tsx            ← project detail / budget editor

components/
  BudgetTable.tsx                     ← editable budget grid (sub-jobs + sources)
  Navbar.tsx                          ← top nav with snapshot switcher
  SummaryCharts.tsx                   ← charts for summary page

lib/
  api.ts                              ← all API calls (see below)
  types.ts                            ← all TypeScript types
  exportExcel.ts                      ← client-side Excel export
```

## API client (`lib/api.ts`) — key methods
```ts
api.projects(params?)               // GET /projects
api.projectDetail(code)             // GET /projects/{code}
api.flatProjects(params?)           // GET /projects/flat
api.filterOptions()                 // GET /filter-options
api.summary(by, params?)            // GET /summary

// Tags / Categories
api.tagCategories()
api.createCategory(name)
api.tagValues(catID)
api.createValue(catID, code)
api.summaryByTag(category, params?)

// Allocation
api.allocationSelections(categoryId)
api.setAllocationSelections(categoryId, selections)
api.projectCategoryAllocations(projectId)
api.setProjectCategoryAllocations(projectId, categoryId, allocations)
api.jobCategoryAllocations(projectId, subJobName)
api.setJobCategoryAllocations(projectId, subJobName, categoryId, allocations)

// Snapshots
api.snapshots() / api.createSnapshot(label, note?) / api.promoteSnapshot(id)

// Editing
api.batchSave(req)                  // preferred bulk edit path
api.updateSubJob(id, budget, target)
api.updateBudgetSource(id, budget, target, cut_transfer, under_budget)

// Change log
api.projectHistory(code)
api.undoChange(id)
api.updateBatchComment(batchId, comment)
```

## Key types (`lib/types.ts`)
- `Project`, `ProjectDetail`, `SubJob`, `BudgetSource`
- `FlatProject` — flat snapshot shape with `sub_jobs: SubJobYearEntry[]` and `source_breakdown: SourceYearEntry[]`
- `Snapshot`, `SnapshotDetail`
- `TagCategory`, `TagValue`, `ProjectTag`, `SubJobTag`, `CategoryAllocationSelection`
- `BatchSaveRequest` — bulk edit payload
- `ChangeLogEntry`
- `FilterOptions` — `{ years: number[], sources: string[], divisions: string[], departments: string[], groups: string[] }`

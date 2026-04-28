"use client"

import { Fragment, useMemo, useState } from "react"
import type { FlatProject, SourceYearEntry, SubJobYearEntry } from "@/lib/types"

const FUND_COLUMNS = [
  { key: "committed", label: "ผูกพัน", fundType: "ผูกพัน" as const },
  { key: "invest", label: "ลงทุน", fundType: "ลงทุน" as const },
  { key: "total", label: "รวม", fundType: null },
] as const
const GROUPS = [
  { key: "Budget", label: "งบเงินดำเนินการปี" },
  { key: "Target", label: "เป้าหมายการเบิกจ่ายปี" },
  { key: "Remain", label: "คงเหลือ" },
] as const

type Group = typeof GROUPS[number]["key"]
type FundType = "ผูกพัน" | "ลงทุน"
type FundColumnKey = typeof FUND_COLUMNS[number]["key"]
type SortDir = "asc" | "desc"
type NumericFilter = { min: string; max: string }
type MoneySortState = { kind: "money"; year: number; group: Group; fundKey: FundColumnKey; dir: SortDir }
type YearSortState = { kind: "year"; dir: SortDir }
type SortState = MoneySortState | YearSortState | null

function fmt(n: number) {
  if (n === 0) return <span className="text-gray-700">-</span>
  return n.toLocaleString("th-TH", { minimumFractionDigits: 3, maximumFractionDigits: 3 })
}

function metricValue(entry: Pick<SourceYearEntry, "budget" | "target" | "remain">, group: Group): number {
  return group === "Budget" ? entry.budget : group === "Target" ? entry.target : entry.remain
}

function getVal(
  breakdown: SourceYearEntry[],
  year: number,
  source: string | null,
  fundType: FundType | null,
  group: Group,
): number {
  return breakdown.reduce((sum, entry) => {
    if (entry.year !== year) return sum
    if (source !== null && entry.source !== source) return sum
    if (fundType !== null && entry.fund_type !== fundType) return sum
    return sum + metricValue(entry, group)
  }, 0)
}

function getSubJobVal(
  subJobs: SubJobYearEntry[],
  name: string | null,
  year: number,
  fundType: FundType | null,
  group: Group,
): number {
  return subJobs.reduce((sum, entry) => {
    if (entry.year !== year) return sum
    if (name !== null && entry.name !== name) return sum
    if (fundType !== null && entry.fund_type !== fundType) return sum
    return sum + metricValue(entry, group)
  }, 0)
}

function subJobRank(a: { sort_order: number | null; name: string }, b: { sort_order: number | null; name: string }) {
  const ao = a.sort_order ?? Number.MAX_SAFE_INTEGER
  const bo = b.sort_order ?? Number.MAX_SAFE_INTEGER
  return ao - bo || a.name.localeCompare(b.name, "th")
}

function sourceRank(source: string) {
  const order = ["เงินกู้", "เงินกู้ในประเทศ", "เงินรายได้ กฟภ.", "เงินสมทบผู้ใช้ไฟ", "เงินสมทบจากผู้ใช้ไฟ"]
  const idx = order.indexOf(source)
  return idx === -1 ? order.length : idx
}

function filterKey(year: number, group: Group, fundKey: FundColumnKey) {
  return `${year}-${group}-${fundKey}`
}

function parseFilterValue(value: string) {
  const cleaned = value.replace(/,/g, "").trim()
  if (!cleaned) return null
  const parsed = Number(cleaned)
  return Number.isFinite(parsed) ? parsed : null
}

type Props = {
  data: FlatProject[]
  years: number[]
}

export default function BudgetTable({ data, years }: Props) {
  const [textFilters, setTextFilters] = useState({ name: "", code: "", division: "", type: "" })
  const [numFilters, setNumFilters] = useState<Record<string, NumericFilter>>({})
  const [yearFilter, setYearFilter] = useState<NumericFilter>({ min: "", max: "" })
  const [sortState, setSortState] = useState<SortState>(null)
  const [showJobs, setShowJobs] = useState(true)
  const [showSources, setShowSources] = useState(true)
  const [infoVis, setInfoVis] = useState({ code: false, division: false, type: false, year: false })
  const [groupVis, setGroupVis] = useState<Record<Group, boolean>>({
    Budget: true,
    Target: true,
    Remain: true,
  })
  const [fundVis, setFundVis] = useState<Record<FundColumnKey, boolean>>({
    committed: true,
    invest: true,
    total: true,
  })

  const displayYears = useMemo(
    () => years.length > 0 ? years : [...new Set(data.flatMap(row => row.source_breakdown.map(entry => entry.year)))].sort(),
    [data, years],
  )
  const visibleGroups = GROUPS.filter(group => groupVis[group.key])
  const visibleFunds = FUND_COLUMNS.filter(column => fundVis[column.key])
  const leftColSpan = 2 + Number(infoVis.code) + Number(infoVis.division) + Number(infoVis.type) + Number(infoVis.year)
  const hasMoneyColumns = visibleGroups.length > 0 && visibleFunds.length > 0

  const sources = useMemo(() => {
    const set = new Set<string>()
    data.forEach(row => row.source_breakdown.forEach(entry => set.add(entry.source)))
    return [...set].sort((a, b) => sourceRank(a) - sourceRank(b) || a.localeCompare(b, "th"))
  }, [data])

  function getSubJobRows(row: FlatProject) {
    const byName = new Map<string, { name: string; sort_order: number | null }>()
    const subJobs = row.sub_jobs ?? []
    subJobs.forEach(entry => {
      const existing = byName.get(entry.name)
      if (!existing || subJobRank(entry, existing) < 0) {
        byName.set(entry.name, { name: entry.name, sort_order: entry.sort_order })
      }
    })
    return [...byName.values()].sort(subJobRank)
  }

  const filtered = useMemo(() => {
    const numericColumns = displayYears.flatMap(year =>
      visibleGroups.flatMap(group =>
        visibleFunds.map(column => ({
          year,
          group: group.key,
          fundType: column.fundType,
          filter: numFilters[filterKey(year, group.key, column.key)],
        })),
      ),
    )
    const yearMin = parseFilterValue(yearFilter.min)
    const yearMax = parseFilterValue(yearFilter.max)

    return data.filter(row => {
      if (textFilters.name && !row.name.toLowerCase().includes(textFilters.name.toLowerCase())) return false
      if (textFilters.code && !row.project_code.toLowerCase().includes(textFilters.code.toLowerCase())) return false
      if (textFilters.division && !(row.division ?? "").toLowerCase().includes(textFilters.division.toLowerCase())) return false
      if (textFilters.type && row.project_type.toLowerCase() !== textFilters.type.toLowerCase()) return false
      if (yearMin !== null && row.year < yearMin) return false
      if (yearMax !== null && row.year > yearMax) return false

      return numericColumns.every(column => {
        const min = parseFilterValue(column.filter?.min ?? "")
        const max = parseFilterValue(column.filter?.max ?? "")
        if (min === null && max === null) return true
        const value = getVal(row.source_breakdown, column.year, null, column.fundType, column.group)
        if (min !== null && value < min) return false
        if (max !== null && value > max) return false
        return true
      })
    })
  }, [data, displayYears, numFilters, textFilters, visibleFunds, visibleGroups, yearFilter])

  const sorted = useMemo(() => {
    if (!sortState) return filtered

    if (sortState.kind === "year") {
      return [...filtered].sort((a, b) => sortState.dir === "asc" ? a.year - b.year : b.year - a.year)
    }

    const groupVisible = groupVis[sortState.group]
    const fundColumn = FUND_COLUMNS.find(column => column.key === sortState.fundKey)
    if (!groupVisible || !fundColumn || !fundVis[sortState.fundKey]) return filtered

    return [...filtered].sort((a, b) => {
      const av = getVal(a.source_breakdown, sortState.year, null, fundColumn.fundType, sortState.group)
      const bv = getVal(b.source_breakdown, sortState.year, null, fundColumn.fundType, sortState.group)
      return sortState.dir === "asc" ? av - bv : bv - av
    })
  }, [filtered, fundVis, groupVis, sortState])

  function cycleMoneySort(year: number, group: Group, fundKey: FundColumnKey) {
    setSortState(current => {
      if (
        !current ||
        current.kind !== "money" ||
        current.year !== year ||
        current.group !== group ||
        current.fundKey !== fundKey
      ) {
        return { kind: "money", year, group, fundKey, dir: "asc" }
      }
      if (current.dir === "asc") return { ...current, dir: "desc" }
      return null
    })
  }

  function cycleYearSort() {
    setSortState(current => {
      if (!current || current.kind !== "year") return { kind: "year", dir: "asc" }
      if (current.dir === "asc") return { kind: "year", dir: "desc" }
      return null
    })
  }

  function updateNumFilter(year: number, group: Group, fundKey: FundColumnKey, part: keyof NumericFilter, value: string) {
    const key = filterKey(year, group, fundKey)
    setNumFilters(current => ({
      ...current,
      [key]: { ...(current[key] ?? { min: "", max: "" }), [part]: value },
    }))
  }

  function moneySortIcon(year: number, group: Group, fundKey: FundColumnKey) {
    if (
      !sortState ||
      sortState.kind !== "money" ||
      sortState.year !== year ||
      sortState.group !== group ||
      sortState.fundKey !== fundKey
    ) return "↕"
    return sortState.dir === "asc" ? "↑" : "↓"
  }

  function yearSortIcon() {
    if (!sortState || sortState.kind !== "year") return "↕"
    return sortState.dir === "asc" ? "↑" : "↓"
  }

  const cellClass = "border border-black px-2 py-1 text-right tabular-nums whitespace-nowrap"
  const headClass = "border border-black px-2 py-1 text-center font-semibold whitespace-nowrap"
  const infoHeadClass = "border border-black px-2 py-1 text-center font-semibold"
  const filterInputClass = "min-w-0 border border-gray-300 px-1 py-0.5 text-[11px] font-normal"

  return (
    <div className="bg-white border border-gray-300">
      <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 px-4 py-2.5 border-b bg-gray-50">
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Info</span>
          {([
            { key: "code" as const, label: "Code" },
            { key: "division" as const, label: "Division" },
            { key: "type" as const, label: "Type" },
            { key: "year" as const, label: "Start year" },
          ]).map(({ key, label }) => (
            <label key={key} className="flex items-center gap-1 cursor-pointer text-xs text-gray-600">
              <input
                type="checkbox"
                checked={infoVis[key]}
                onChange={event => setInfoVis(value => ({ ...value, [key]: event.target.checked }))}
              />
              {label}
            </label>
          ))}
        </div>
        <div className="w-px bg-gray-200 self-stretch" />
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Groups</span>
          {GROUPS.map(group => (
            <label key={group.key} className="flex items-center gap-1 cursor-pointer text-xs text-gray-600">
              <input
                type="checkbox"
                checked={groupVis[group.key]}
                onChange={event => setGroupVis(value => ({ ...value, [group.key]: event.target.checked }))}
              />
              {group.key}
            </label>
          ))}
        </div>
        <div className="w-px bg-gray-200 self-stretch" />
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Columns</span>
          {FUND_COLUMNS.map(column => (
            <label key={column.key} className="flex items-center gap-1 cursor-pointer text-xs text-gray-600">
              <input
                type="checkbox"
                checked={fundVis[column.key]}
                onChange={event => setFundVis(value => ({ ...value, [column.key]: event.target.checked }))}
              />
              {column.label}
            </label>
          ))}
          <label className="flex items-center gap-1 cursor-pointer text-xs text-gray-600">
            <input
              type="checkbox"
              checked={showJobs}
              onChange={event => setShowJobs(event.target.checked)}
            />
            Job rows
          </label>
          <label className="flex items-center gap-1 cursor-pointer text-xs text-gray-600">
            <input
              type="checkbox"
              checked={showSources}
              onChange={event => setShowSources(event.target.checked)}
            />
            Source rows
          </label>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-max border-collapse text-xs text-gray-900">
          <thead>
            <tr>
              <th colSpan={leftColSpan} className={`${infoHeadClass} min-w-[440px]`}>
                Info
              </th>
              {hasMoneyColumns && displayYears.map(year => (
                <Fragment key={year}>
                  {visibleGroups.map(group => (
                    <th key={`${year}-${group.key}`} colSpan={visibleFunds.length} className={headClass}>
                      {group.key === "Remain" ? group.label : `${group.label} ${year}`}
                    </th>
                  ))}
                </Fragment>
              ))}
            </tr>
            <tr>
              <th className={`${infoHeadClass} w-[44px]`}>ข้อ</th>
              <th className={`${infoHeadClass} min-w-[360px]`}>รายการ</th>
              {infoVis.code && <th className={`${infoHeadClass} min-w-[110px]`}>Code</th>}
              {infoVis.division && <th className={`${infoHeadClass} min-w-[120px]`}>Division</th>}
              {infoVis.type && <th className={`${infoHeadClass} w-[44px]`}>Type</th>}
              {infoVis.year && (
                <th className={`${infoHeadClass} min-w-[112px]`}>
                  <button
                    type="button"
                    className="inline-flex w-full items-center justify-center gap-1"
                    onClick={cycleYearSort}
                    title="Sort start year"
                  >
                    <span>Start year</span>
                    <span className="text-[10px] text-gray-500">{yearSortIcon()}</span>
                  </button>
                </th>
              )}
              {hasMoneyColumns && displayYears.map(year => (
                <Fragment key={year}>
                  {visibleGroups.map(group => (
                    <Fragment key={`${year}-${group.key}-funds`}>
                      {visibleFunds.map(column => (
                        <th key={`${year}-${group.key}-${column.key}`} className={headClass}>
                          <button
                            type="button"
                            className="inline-flex w-full items-center justify-center gap-1"
                            onClick={() => cycleMoneySort(year, group.key, column.key)}
                            title="Sort"
                          >
                            <span>{column.label}</span>
                            <span className="text-[10px] text-gray-500">{moneySortIcon(year, group.key, column.key)}</span>
                          </button>
                        </th>
                      ))}
                    </Fragment>
                  ))}
                </Fragment>
              ))}
            </tr>
            <tr>
              <th className="border border-black px-1 py-1" />
              <th className="border border-black px-1 py-1">
                <input
                  className="w-full min-w-[260px] border border-gray-300 px-1 py-0.5 text-xs font-normal"
                  placeholder="search..."
                  value={textFilters.name}
                  onChange={event => setTextFilters(value => ({ ...value, name: event.target.value }))}
                />
              </th>
              {infoVis.code && (
                <th className="border border-black px-1 py-1">
                  <input
                    className="w-full min-w-[90px] border border-gray-300 px-1 py-0.5 text-xs font-normal"
                    placeholder="code..."
                    value={textFilters.code}
                    onChange={event => setTextFilters(value => ({ ...value, code: event.target.value }))}
                  />
                </th>
              )}
              {infoVis.division && (
                <th className="border border-black px-1 py-1">
                  <input
                    className="w-full min-w-[90px] border border-gray-300 px-1 py-0.5 text-xs font-normal"
                    placeholder="division..."
                    value={textFilters.division}
                    onChange={event => setTextFilters(value => ({ ...value, division: event.target.value }))}
                  />
                </th>
              )}
              {infoVis.type && (
                <th className="border border-black px-1 py-1">
                  <input
                    className="w-[32px] border border-gray-300 px-1 py-0.5 text-center text-xs font-normal uppercase"
                    maxLength={1}
                    placeholder="Y"
                    value={textFilters.type}
                    onChange={event => setTextFilters(value => ({ ...value, type: event.target.value.trim().slice(0, 1) }))}
                  />
                </th>
              )}
              {infoVis.year && (
                <th className="border border-black px-1 py-1">
                  <div className="grid w-[112px] grid-cols-2 gap-1">
                    <input
                      className={filterInputClass}
                      inputMode="numeric"
                      placeholder="min"
                      value={yearFilter.min}
                      onChange={event => setYearFilter(value => ({ ...value, min: event.target.value }))}
                    />
                    <input
                      className={filterInputClass}
                      inputMode="numeric"
                      placeholder="max"
                      value={yearFilter.max}
                      onChange={event => setYearFilter(value => ({ ...value, max: event.target.value }))}
                    />
                  </div>
                </th>
              )}
              {hasMoneyColumns && displayYears.map(year => (
                <Fragment key={year}>
                  {visibleGroups.map(group => (
                    <Fragment key={`${year}-${group.key}-filters`}>
                      {visibleFunds.map(column => {
                        const current = numFilters[filterKey(year, group.key, column.key)] ?? { min: "", max: "" }
                        return (
                          <th key={`${year}-${group.key}-${column.key}-filter`} className="border border-black px-1 py-1">
                            <div className="grid w-[112px] grid-cols-2 gap-1">
                              <input
                                className={filterInputClass}
                                inputMode="decimal"
                                placeholder="min"
                                value={current.min}
                                onChange={event => updateNumFilter(year, group.key, column.key, "min", event.target.value)}
                              />
                              <input
                                className={filterInputClass}
                                inputMode="decimal"
                                placeholder="max"
                                value={current.max}
                                onChange={event => updateNumFilter(year, group.key, column.key, "max", event.target.value)}
                              />
                            </div>
                          </th>
                        )
                      })}
                    </Fragment>
                  ))}
                </Fragment>
              ))}
            </tr>
          </thead>

          <tbody>
            {sorted.length === 0 ? (
              <tr>
                <td colSpan={99} className="border border-black py-8 text-center text-gray-500">No data</td>
              </tr>
            ) : (
              sorted.map(row => (
                <Fragment key={row.project_code}>
                  <tr>
                    <td className="border border-black px-2 py-1 text-center align-top">{row.item_no ?? ""}</td>
                    <td className="border border-black px-2 py-1 align-top min-w-[360px]">{row.name}</td>
                    {infoVis.code && <td className="border border-black px-2 py-1 align-top font-mono">{row.project_code}</td>}
                    {infoVis.division && <td className="border border-black px-2 py-1 align-top">{row.division ?? "-"}</td>}
                    {infoVis.type && <td className="border border-black px-2 py-1 text-center align-top">{row.project_type}</td>}
                    {infoVis.year && <td className="border border-black px-2 py-1 text-center align-top">{row.year}</td>}
                    {hasMoneyColumns && displayYears.map(year => (
                      <Fragment key={year}>
                        {visibleGroups.map(group => (
                          <Fragment key={`${row.project_code}-${year}-${group.key}`}>
                            {visibleFunds.map(column => (
                              <td key={column.key} className={cellClass}>
                                {fmt(getVal(row.source_breakdown, year, null, column.fundType, group.key))}
                              </td>
                            ))}
                          </Fragment>
                        ))}
                      </Fragment>
                    ))}
                  </tr>

                  {showJobs && getSubJobRows(row).map((subJob, index) => (
                    <tr key={`${row.project_code}-sub-job-${subJob.name}`}>
                      <td className="border border-black px-2 py-1" />
                      <td className="border border-black px-2 py-1 pl-6 align-top">
                        {index + 1}. {subJob.name}
                      </td>
                      {infoVis.code && <td className="border border-black px-2 py-1" />}
                      {infoVis.division && <td className="border border-black px-2 py-1" />}
                      {infoVis.type && <td className="border border-black px-2 py-1" />}
                      {infoVis.year && <td className="border border-black px-2 py-1" />}
                      {hasMoneyColumns && displayYears.map(year => (
                        <Fragment key={year}>
                          {visibleGroups.map(group => (
                            <Fragment key={`${row.project_code}-${subJob.name}-${year}-${group.key}`}>
                              {visibleFunds.map(column => (
                                <td key={column.key} className={cellClass}>
                                  {fmt(getSubJobVal(row.sub_jobs ?? [], subJob.name, year, column.fundType, group.key))}
                                </td>
                              ))}
                            </Fragment>
                          ))}
                        </Fragment>
                      ))}
                    </tr>
                  ))}

                  {showSources && sources.map(source => (
                    <tr key={`${row.project_code}-${source}`}>
                      <td className="border border-black px-2 py-1" />
                      <td className="border border-black px-2 py-1 pl-6 align-top">- {source}</td>
                      {infoVis.code && <td className="border border-black px-2 py-1" />}
                      {infoVis.division && <td className="border border-black px-2 py-1" />}
                      {infoVis.type && <td className="border border-black px-2 py-1" />}
                      {infoVis.year && <td className="border border-black px-2 py-1" />}
                      {hasMoneyColumns && displayYears.map(year => (
                        <Fragment key={year}>
                          {visibleGroups.map(group => (
                            <Fragment key={`${row.project_code}-${source}-${year}-${group.key}`}>
                              {visibleFunds.map(column => (
                                <td key={column.key} className={cellClass}>
                                  {fmt(getVal(row.source_breakdown, year, source, column.fundType, group.key))}
                                </td>
                              ))}
                            </Fragment>
                          ))}
                        </Fragment>
                      ))}
                    </tr>
                  ))}
                </Fragment>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="px-4 py-2 border-t text-xs text-gray-500">
        {sorted.length} of {data.length} rows
      </div>
    </div>
  )
}

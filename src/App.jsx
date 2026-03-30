import { useEffect, useMemo, useState } from 'react'
import './App.css'

const STORAGE_KEY = 'parking-budget-shortcuts-v1'
const MONTHLY_LIMIT_MINUTES = 90 * 60

function getMonthKey(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
}

function formatDateTime(value) {
  return new Intl.DateTimeFormat('ko-KR', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value))
}

function toDatetimeLocalValue(value) {
  const date = new Date(value)
  const offset = date.getTimezoneOffset()
  const local = new Date(date.getTime() - offset * 60000)
  return local.toISOString().slice(0, 16)
}

function formatMinutes(totalMinutes) {
  const safe = Math.max(0, Math.round(totalMinutes))
  const hours = Math.floor(safe / 60)
  const minutes = safe % 60
  return `${hours}시간 ${minutes}분`
}

function parseMinutesBetween(start, end) {
  return Math.max(1, Math.round((new Date(end) - new Date(start)) / 60000))
}

function downloadCsv(filename, rows) {
  const header = ['입차', '출차', '사용시간(분)', '사용시간(표시)']
  const body = rows.map((row) => [
    new Date(row.entryAt).toISOString(),
    new Date(row.exitAt).toISOString(),
    String(row.durationMinutes),
    formatMinutes(row.durationMinutes),
  ])
  const csv = [header, ...body]
    .map((line) => line.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(','))
    .join('\n')
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}

function createInitialState() {
  return {
    monthlyLimitMinutes: MONTHLY_LIMIT_MINUTES,
    activeEntryAt: null,
    recordsByMonth: {},
    lastAutoActionKey: null,
  }
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    return JSON.parse(raw)
  } catch {
    return null
  }
}

function buildAutoActionKey(action) {
  const now = new Date()
  return `${action}:${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}-${now.getHours()}-${now.getMinutes()}`
}

function initializeApp() {
  const saved = loadState()
  const baseState = saved ? { ...createInitialState(), ...saved } : createInitialState()
  let initialNotice = ''

  if (typeof window !== 'undefined') {
    const url = new URL(window.location.href)
    const action = url.searchParams.get('action')
    if (action && ['entry', 'exit'].includes(action)) {
      const currentMonthKey = getMonthKey()
      const autoActionKey = buildAutoActionKey(action)

      if (baseState.lastAutoActionKey !== autoActionKey) {
        if (action === 'entry') {
          if (baseState.activeEntryAt) {
            initialNotice = '자동 입차 요청이 왔지만 이미 입차 상태야.'
            baseState.lastAutoActionKey = autoActionKey
          } else {
            const now = new Date().toISOString()
            baseState.activeEntryAt = now
            baseState.lastAutoActionKey = autoActionKey
            initialNotice = `자동 입차 처리됨: ${formatDateTime(now)}`
          }
        }

        if (action === 'exit') {
          if (!baseState.activeEntryAt) {
            baseState.lastAutoActionKey = autoActionKey
            initialNotice = '자동 출차 요청이 왔지만 현재 입차 상태가 아니야.'
          } else {
            const exitAt = new Date().toISOString()
            const durationMinutes = parseMinutesBetween(baseState.activeEntryAt, exitAt)
            const newRecord = {
              id: crypto.randomUUID(),
              entryAt: baseState.activeEntryAt,
              exitAt,
              durationMinutes,
              source: 'shortcut',
            }
            baseState.recordsByMonth = {
              ...baseState.recordsByMonth,
              [currentMonthKey]: [newRecord, ...(baseState.recordsByMonth[currentMonthKey] ?? [])],
            }
            baseState.activeEntryAt = null
            baseState.lastAutoActionKey = autoActionKey
            initialNotice = `자동 출차 처리됨 — ${formatMinutes(durationMinutes)}`
          }
        }
      }

      url.searchParams.delete('action')
      window.history.replaceState({}, '', url.toString())
    }
  }

  return { initialState: baseState, initialNotice }
}

function App() {
  const [{ initialState, initialNotice }] = useState(initializeApp)
  const [appState, setAppState] = useState(initialState)
  const [notice, setNotice] = useState(initialNotice)
  const [manualEntryAt, setManualEntryAt] = useState('')
  const [manualExitAt, setManualExitAt] = useState('')
  const [editingRecordId, setEditingRecordId] = useState(null)
  const [editingEntryAt, setEditingEntryAt] = useState('')
  const [editingExitAt, setEditingExitAt] = useState('')
  const currentMonthKey = getMonthKey()

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(appState))
  }, [appState])

  const monthlyRecords = useMemo(
    () => appState.recordsByMonth[currentMonthKey] ?? [],
    [appState.recordsByMonth, currentMonthKey],
  )

  const sortedMonthlyRecords = useMemo(
    () => [...monthlyRecords].sort((a, b) => new Date(b.entryAt) - new Date(a.entryAt)),
    [monthlyRecords],
  )

  const usedMinutes = useMemo(
    () => monthlyRecords.reduce((sum, record) => sum + (record.durationMinutes ?? 0), 0),
    [monthlyRecords],
  )

  const remainingMinutes = Math.max(0, appState.monthlyLimitMinutes - usedMinutes)
  const usagePercent = Math.min(100, (usedMinutes / appState.monthlyLimitMinutes) * 100)

  const updateMonthRecords = (updater) => {
    setAppState((current) => ({
      ...current,
      recordsByMonth: {
        ...current.recordsByMonth,
        [currentMonthKey]: updater(current.recordsByMonth[currentMonthKey] ?? []),
      },
    }))
  }

  const handleEntry = () => {
    if (appState.activeEntryAt) {
      setNotice('이미 입차 상태야.')
      return
    }
    const now = new Date().toISOString()
    setAppState((current) => ({ ...current, activeEntryAt: now }))
    setNotice(`입차 기록: ${formatDateTime(now)}`)
  }

  const handleExit = () => {
    if (!appState.activeEntryAt) {
      setNotice('현재 입차 상태가 아니라서 출차할 수 없어.')
      return
    }
    const exitAt = new Date().toISOString()
    const durationMinutes = parseMinutesBetween(appState.activeEntryAt, exitAt)
    const newRecord = {
      id: crypto.randomUUID(),
      entryAt: appState.activeEntryAt,
      exitAt,
      durationMinutes,
      source: 'manual',
    }
    updateMonthRecords((records) => [newRecord, ...records])
    setAppState((current) => ({ ...current, activeEntryAt: null }))
    setNotice(`출차 완료 — 이번 사용 시간 ${formatMinutes(durationMinutes)}`)
  }

  const handleManualAdd = (event) => {
    event.preventDefault()
    if (!manualEntryAt || !manualExitAt) {
      setNotice('수동 기록은 입차/출차 시간을 둘 다 넣어야 해.')
      return
    }
    const entryAt = new Date(manualEntryAt)
    const exitAt = new Date(manualExitAt)
    if (entryAt >= exitAt) {
      setNotice('출차 시간은 입차 시간보다 뒤여야 해.')
      return
    }
    const newRecord = {
      id: crypto.randomUUID(),
      entryAt: entryAt.toISOString(),
      exitAt: exitAt.toISOString(),
      durationMinutes: parseMinutesBetween(entryAt, exitAt),
      source: 'manual',
    }
    updateMonthRecords((records) => [newRecord, ...records])
    setManualEntryAt('')
    setManualExitAt('')
    setNotice(`수동 기록 추가 — ${formatMinutes(newRecord.durationMinutes)}`)
  }

  const startEdit = (record) => {
    setEditingRecordId(record.id)
    setEditingEntryAt(toDatetimeLocalValue(record.entryAt))
    setEditingExitAt(toDatetimeLocalValue(record.exitAt))
  }

  const handleSaveEdit = () => {
    if (!editingRecordId || !editingEntryAt || !editingExitAt) return
    const nextEntry = new Date(editingEntryAt)
    const nextExit = new Date(editingExitAt)
    if (nextEntry >= nextExit) {
      setNotice('수정 시에도 출차 시간이 더 늦어야 해.')
      return
    }
    updateMonthRecords((records) =>
      records.map((record) =>
        record.id === editingRecordId
          ? {
              ...record,
              entryAt: nextEntry.toISOString(),
              exitAt: nextExit.toISOString(),
              durationMinutes: parseMinutesBetween(nextEntry, nextExit),
            }
          : record,
      ),
    )
    setEditingRecordId(null)
    setEditingEntryAt('')
    setEditingExitAt('')
    setNotice('기록을 수정했어.')
  }

  const handleDeleteRecord = (id) => {
    updateMonthRecords((records) => records.filter((record) => record.id !== id))
    if (editingRecordId === id) {
      setEditingRecordId(null)
      setEditingEntryAt('')
      setEditingExitAt('')
    }
    setNotice('기록을 삭제했어.')
  }

  const handleExportCsv = () => {
    downloadCsv(`parking-${currentMonthKey}.csv`, sortedMonthlyRecords)
    setNotice('CSV로 내보냈어.')
  }

  const handleReset = () => {
    setAppState(createInitialState())
    setEditingRecordId(null)
    setEditingEntryAt('')
    setEditingExitAt('')
    setNotice('모든 기록을 초기화했어.')
  }

  const activeDurationText = useMemo(() => {
    if (!appState.activeEntryAt) return '주차 중 아님'
    return `${formatDateTime(appState.activeEntryAt)}에 입차 기록됨`
  }, [appState.activeEntryAt])

  const shortcutUrls = useMemo(() => ({
    entry: `${window.location.origin}${window.location.pathname}?action=entry`,
    exit: `${window.location.origin}${window.location.pathname}?action=exit`,
  }), [])

  return (
    <main className="page-shell">
      <section className="hero-card">
        <div className="hero-copy">
          <span className="eyebrow">0330 iPhone Shortcut Ready</span>
          <h1>주차 시간 자동 기록기</h1>
          <p>
            iPhone 단축어에서 URL만 열면 자동으로 입차/출차를 기록할 수 있게 만든 버전이야.
            위치 자동화와 연계해서 `action=entry`, `action=exit` 형태로 사용할 수 있어.
          </p>
        </div>

        <div className="hero-stats">
          <div className="stat-card accent">
            <span>이번 달 남은 시간</span>
            <strong>{formatMinutes(remainingMinutes)}</strong>
          </div>
          <div className="stat-card">
            <span>이번 달 사용 시간</span>
            <strong>{formatMinutes(usedMinutes)}</strong>
          </div>
          <div className="stat-card">
            <span>현재 상태</span>
            <strong>{appState.activeEntryAt ? '입차 상태' : '대기 상태'}</strong>
          </div>
        </div>
      </section>

      <section className="dashboard-grid">
        <article className="panel action-panel">
          <div className="section-head">
            <div>
              <p className="mini-label">SHORTCUT URL</p>
              <h2>iPhone 자동화용 링크</h2>
            </div>
            <span className="helper-chip">도착 / 떠남 자동화용</span>
          </div>

          <div className="url-card">
            <span>입차 URL</span>
            <code>{shortcutUrls.entry}</code>
          </div>
          <div className="url-card">
            <span>출차 URL</span>
            <code>{shortcutUrls.exit}</code>
          </div>

          <div className="button-row">
            <button className="primary-button entry" type="button" onClick={handleEntry} disabled={Boolean(appState.activeEntryAt)}>
              입차 버튼
            </button>
            <button className="primary-button exit" type="button" onClick={handleExit} disabled={!appState.activeEntryAt}>
              출차 버튼
            </button>
            <button className="ghost-button" type="button" onClick={handleReset}>
              리셋
            </button>
          </div>

          <div className="active-box">
            <span>현재 주차 상태</span>
            <strong>{activeDurationText}</strong>
          </div>

          <div className="progress-card">
            <div className="progress-meta">
              <span>이번 달 사용률</span>
              <strong>{usagePercent.toFixed(1)}%</strong>
            </div>
            <div className="progress-track">
              <div className="progress-bar" style={{ width: `${usagePercent}%` }} />
            </div>
          </div>

          <form className="manual-form" onSubmit={handleManualAdd}>
            <div className="section-subhead">
              <h3>수동 시간 입력</h3>
              <span>지난 기록도 추가 가능</span>
            </div>
            <div className="manual-grid">
              <label>
                <span>입차 시간</span>
                <input type="datetime-local" value={manualEntryAt} onChange={(event) => setManualEntryAt(event.target.value)} />
              </label>
              <label>
                <span>출차 시간</span>
                <input type="datetime-local" value={manualExitAt} onChange={(event) => setManualExitAt(event.target.value)} />
              </label>
            </div>
            <button className="ghost-button full" type="submit">수동 기록 추가</button>
          </form>

          {notice ? <p className="notice-text">{notice}</p> : null}
        </article>

        <article className="panel history-panel">
          <div className="section-head">
            <div>
              <p className="mini-label">HISTORY</p>
              <h2>{currentMonthKey} 기록</h2>
            </div>
            <div className="history-actions">
              <span className="helper-chip">자동/수동 기록 공존</span>
              <button className="ghost-button compact" type="button" onClick={handleExportCsv} disabled={sortedMonthlyRecords.length === 0}>
                CSV 내보내기
              </button>
            </div>
          </div>

          {sortedMonthlyRecords.length === 0 ? (
            <div className="empty-state">
              <p>아직 이번 달 주차 기록이 없어.</p>
              <span>입차 버튼 또는 단축어 URL로 시작하면 돼.</span>
            </div>
          ) : (
            <div className="record-list">
              {sortedMonthlyRecords.map((record) => {
                const isEditing = editingRecordId === record.id
                return (
                  <article key={record.id} className="record-card">
                    {isEditing ? (
                      <div className="edit-box">
                        <div className="manual-grid">
                          <label>
                            <span>입차 시간</span>
                            <input type="datetime-local" value={editingEntryAt} onChange={(event) => setEditingEntryAt(event.target.value)} />
                          </label>
                          <label>
                            <span>출차 시간</span>
                            <input type="datetime-local" value={editingExitAt} onChange={(event) => setEditingExitAt(event.target.value)} />
                          </label>
                        </div>
                        <div className="record-actions">
                          <button className="ghost-button compact" type="button" onClick={handleSaveEdit}>저장</button>
                          <button className="ghost-button compact" type="button" onClick={() => setEditingRecordId(null)}>취소</button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div className="record-top">
                          <strong>{formatMinutes(record.durationMinutes)}</strong>
                          <span>{formatDateTime(record.entryAt)} → {formatDateTime(record.exitAt)}</span>
                          <small>{record.source === 'shortcut' ? '자동 기록' : '수동/버튼 기록'}</small>
                        </div>
                        <div className="record-actions">
                          <button className="ghost-button compact" type="button" onClick={() => startEdit(record)}>수정</button>
                          <button className="danger-button compact" type="button" onClick={() => handleDeleteRecord(record.id)}>삭제</button>
                        </div>
                      </>
                    )}
                  </article>
                )
              })}
            </div>
          )}
        </article>
      </section>
    </main>
  )
}

export default App

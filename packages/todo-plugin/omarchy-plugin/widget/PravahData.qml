import QtQuick
import Quickshell.Io

// Data layer for the Pravah widget. Owns every `pravah` CLI interaction:
// a serialized read queue, the two-stage dry-run → apply write pipeline,
// envelope parsing, and the normalized task/goal/operation state the UI
// binds to.
//
// Contract notes:
// - Every command is run with --json and the v2 envelope is required:
//   successful exit, `ok: true`, payload under `data`, errors under
//   `error.message`.
// - Writes always preview with --dry-run first and only then apply the
//   exact same argv with a shared --idempotency-key, so the dry-run/apply
//   pair for one submission is safe. Each new user submission mints a fresh
//   key, so retrying after an ambiguous apply result is not deduplicated.
// - Horizon rules mirror the CLI's own: active = inbox|timeline,
//   overdue = timeline deadline < today, upcoming = today < deadline
//   <= today + 14, sorted by date, then time, then priority, then title.
// - transport: "cli" runs the read commands over HTTP as before. "watch"
//   reads the snapshot `pravah watch` maintains, so reads cost no network
//   and no process spawn. In watch mode a missing or stale snapshot is
//   reported, never silently replaced by an HTTP poll: falling back would
//   hide a dead `pravah watch` behind plausible-looking data. The daemon
//   heartbeats `generatedAt` while idle; the widget rechecks freshness on
//   every load/change, on a 30s timer, and on manual refresh.
// - Writes always run over HTTP in both transports.
QtObject {
  id: root

  property string cli: "pravah"
  // Overridden by the bar widget from the `transport` setting. The default here
  // stays "cli" so a bare PravahData (as used in tests) does not require a
  // running `pravah watch` daemon.
  property string transport: "cli"

  // ------------------------------------------------------------- state ---
  property var goals: []
  property var operations: []
  property string today: Qt.formatDate(new Date(), "yyyy-MM-dd")
  property bool initialized: false
  property bool syncing: false
  property string lastError: ""
  property string lastSyncAt: ""

  // ------------------------------------------------------------- health ---
  property bool healthChecked: false
  property bool healthy: false
  property bool authenticated: false
  property bool canWrite: false
  property string healthMessage: ""

  // ------------------------------------------------------------- writes ---
  property bool writeBusy: false
  property string writeLabel: ""
  property string lastWriteError: ""

  signal writeSucceeded(var envelope)
  signal writeFailed(string message)

  // Raw tasks as returned by `tasks list --all`; `allTasks` is the same
  // list with each task's goal stitched in from the goal summaries.
  property var _rawTasks: []
  property int _pendingReads: 0
  property bool _refreshQueued: false
  property bool _queuedForce: false
  property double _lastSuccessMs: 0
  property double _lastFailMs: 0
  property int _failCount: 0
  property var _readQueue: []
  property var _activeRead: null
  property var _write: null

  readonly property bool watching: transport === "watch"
  // Resolved from `pravah watch --path` so the XDG rules stay in one place.
  property string snapshotPath: ""
  property bool snapshotResolved: false
  property bool snapshotStale: false
  property bool _started: false

  onWatchingChanged: {
    if (!_started) return
    snapshotStale = false
    lastError = ""
    _lastSuccessMs = 0
    _failCount = 0
    refresh(true)
  }

  readonly property var allTasks: {
    var byTask = {}
    for (var g = 0; g < goals.length; g++) {
      var linked = goals[g].activeTasks || []
      for (var k = 0; k < linked.length; k++) {
        if (linked[k] && linked[k].id) byTask[linked[k].id] = goals[g]
      }
    }
    var out = []
    for (var i = 0; i < _rawTasks.length; i++) {
      var t = _rawTasks[i]
      var copy = {}
      for (var key in t) copy[key] = t[key]
      var goal = byTask[t.id]
      copy.goal = goal ? { id: goal.id, text: goal.text } : null
      out.push(copy)
    }
    return out
  }

  function priorityRank(p) { return p === "p1" ? 0 : p === "p2" ? 1 : 2 }

  function byDue(a, b) {
    var da = (a.deadline || "9999") + " " + (a.time || "99:99")
    var db = (b.deadline || "9999") + " " + (b.time || "99:99")
    if (da !== db) return da < db ? -1 : 1
    var pa = priorityRank(a.priority), pb = priorityRank(b.priority)
    if (pa !== pb) return pa - pb
    return a.title < b.title ? -1 : (a.title > b.title ? 1 : 0)
  }

  readonly property var activeTasks: {
    var out = []
    for (var i = 0; i < allTasks.length; i++) {
      var s = allTasks[i].status
      if (s === "inbox" || s === "timeline") out.push(allTasks[i])
    }
    return out
  }

  readonly property var overdueTasks: {
    var out = []
    for (var i = 0; i < activeTasks.length; i++)
      if (activeTasks[i].deadline && activeTasks[i].deadline < today) out.push(activeTasks[i])
    out.sort(byDue)
    return out
  }

  readonly property var todayTasks: {
    var out = []
    for (var i = 0; i < activeTasks.length; i++)
      if (activeTasks[i].deadline === today) out.push(activeTasks[i])
    out.sort(byDue)
    return out
  }

  readonly property var upcomingEnd: addDays(today, 14)

  readonly property var upcomingTasks: {
    var out = []
    for (var i = 0; i < activeTasks.length; i++) {
      var d = activeTasks[i].deadline
      if (d && d > today && d <= upcomingEnd) out.push(activeTasks[i])
    }
    out.sort(byDue)
    return out
  }

  readonly property var inboxTasks: {
    var out = []
    for (var i = 0; i < activeTasks.length; i++)
      if (activeTasks[i].status === "inbox") out.push(activeTasks[i])
    out.sort(byDue)
    return out
  }

  readonly property var completedToday: {
    var out = []
    for (var i = 0; i < allTasks.length; i++) {
      if (allTasks[i].status !== "completed") continue
      // Completion is determined by completedAt; fall back to the deadline
      // for records that predate the timestamp.
      if (allTasks[i].completedAt) {
        if (snapshotDay(allTasks[i].completedAt) === today) out.push(allTasks[i])
      } else if (allTasks[i].deadline === today) out.push(allTasks[i])
    }
    out.sort(byDue)
    return out
  }

  readonly property var allTags: {
    var seen = {}
    var out = []
    for (var i = 0; i < activeTasks.length; i++) {
      var tags = activeTasks[i].tags
      for (var k = 0; tags && k < tags.length; k++) {
        if (!seen[tags[k]]) { seen[tags[k]] = true; out.push(tags[k]) }
      }
    }
    out.sort()
    return out
  }

  readonly property var upcomingGroups: {
    var groups = []
    var byDate = {}
    for (var i = 0; i < upcomingTasks.length; i++) {
      var d = upcomingTasks[i].deadline
      if (!byDate[d]) {
        byDate[d] = { date: d, label: dayLabel(d), tasks: [] }
        groups.push(byDate[d])
      }
      byDate[d].tasks.push(upcomingTasks[i])
    }
    return groups
  }

  // ------------------------------------------------------------ helpers ---
  function addDays(dateStr, n) {
    var d = new Date(dateStr + "T12:00:00")
    if (isNaN(d.getTime())) return dateStr
    d.setDate(d.getDate() + n)
    return Qt.formatDate(d, "yyyy-MM-dd")
  }

  function dayLabel(dateStr) {
    if (dateStr === today) return "Today"
    if (dateStr === addDays(today, 1)) return "Tomorrow"
    var d = new Date(dateStr + "T12:00:00")
    return isNaN(d.getTime()) ? dateStr : Qt.formatDate(d, "ddd d MMM")
  }

  function parseEnvelope(out) {
    try { return JSON.parse(String(out || "").trim()) }
    catch (e) { return null }
  }

  function commandError(out, err, fallback) {
    var env = parseEnvelope(out)
    if (env && env.error && env.error.message) return String(env.error.message).slice(0, 240)
    var raw = String(err || out || "").trim()
    return (raw.slice(0, 240)) || fallback
  }

  function readDate(value) {
    return (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) ? value : ""
  }

  // Local day of a millisecond timestamp, for matching completedAt against
  // `today`. Returns "" for anything that is not a timestamp.
  function snapshotDay(ms) {
    if (typeof ms !== "number" || !isFinite(ms) || ms <= 0) return ""
    return Qt.formatDate(new Date(ms), "yyyy-MM-dd")
  }

  function readTime(value) {
    return (typeof value === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(value)) ? value : ""
  }

  // Quick-add tokens: Fix leak !p1 @home ~30m 9:30 → fields + title.
  // Unknown tokens stay in the title. If every token is consumed, the
  // original string is kept as the title so "!p1" still captures.
  function parseQuickAdd(raw) {
    var text = String(raw || "").trim()
    if (text === "") return null
    var fields = { title: "", priority: "", tags: [], estimatedMinutes: 0, time: "" }
    var tokens = text.split(/\s+/)
    var kept = []
    for (var i = 0; i < tokens.length; i++) {
      var tok = tokens[i]
      var m
      if ((m = tok.match(/^![pP]([1-3])$/))) { fields.priority = "p" + m[1]; continue }
      if ((m = tok.match(/^@([^\s,]+)$/))) { fields.tags.push(m[1]); continue }
      if ((m = tok.match(/^~(\d+)(m|min|h)?$/i))) {
        fields.estimatedMinutes = parseInt(m[1], 10) * ((m[2] && m[2].toLowerCase() === "h") ? 60 : 1)
        continue
      }
      if ((m = tok.match(/^([01]?\d|2[0-3]):([0-5]\d)$/))) {
        fields.time = (m[1].length === 1 ? "0" + m[1] : m[1]) + ":" + m[2]
        continue
      }
      kept.push(tok)
    }
    var title = kept.join(" ")
    fields.title = title === "" ? text : title
    return fields
  }

  function passesFilters(t, searchText, priorityFilter, tagFilter) {
    var q = String(searchText || "").toLowerCase()
    if (q !== "") {
      var hay = (t.title + " " + (t.description || "") + " " + (t.tags || []).join(" ")).toLowerCase()
      if (hay.indexOf(q) === -1) return false
    }
    if (priorityFilter && priorityFilter.length > 0 && priorityFilter.indexOf(t.priority) === -1) return false
    if (tagFilter && tagFilter !== "" && (!t.tags || t.tags.indexOf(tagFilter) === -1)) return false
    return true
  }

  function normalizeTask(t) {
    if (!t || typeof t !== "object") return null
    var id = typeof t._id === "string" ? t._id : (typeof t.id === "string" ? t.id : "")
    if (id === "" || typeof t.title !== "string") return null
    var status = String(t.status || "")
    if (status !== "completed" && status !== "cancelled" && status !== "inbox" && status !== "timeline") {
      if (t.cancelledAt) status = "cancelled"
      else if (t.completedAt) status = "completed"
      else status = (readDate(t.deadline) || readDate(t.scheduledDate)) ? "timeline" : "inbox"
    }
    var tags = []
    if (Array.isArray(t.tags))
      for (var i = 0; i < t.tags.length; i++)
        if (typeof t.tags[i] === "string" && t.tags[i] !== "") tags.push(t.tags[i])
    return {
      id: id,
      title: t.title,
      description: typeof t.description === "string" ? t.description : "",
      status: status,
      deadline: readDate(t.deadline) || readDate(t.scheduledDate),
      time: readTime(t.time),
      priority: (t.priority === "p1" || t.priority === "p2" || t.priority === "p3") ? t.priority : "",
      tags: tags,
      estimatedMinutes: typeof t.estimatedMinutes === "number" ? t.estimatedMinutes : 0,
      // Millisecond timestamp; 0 means absent. Drives the Completed section.
      completedAt: typeof t.completedAt === "number" && isFinite(t.completedAt) ? t.completedAt : 0,
      // Only the watch snapshot carries this; `tasks list` leaves it empty and
      // the goal is stitched from `goals list` as before.
      goalId: typeof t.goalId === "string" ? t.goalId : "",
      goal: null
    }
  }

  function normalizeGoal(g) {
    if (!g || typeof g !== "object") return null
    if (typeof g.id !== "string" || typeof g.text !== "string") return null
    var linked = []
    if (Array.isArray(g.activeTasks))
      for (var i = 0; i < g.activeTasks.length; i++) {
        var t = normalizeTask(g.activeTasks[i])
        if (t) linked.push(t)
      }
    return {
      id: g.id,
      text: g.text,
      description: typeof g.description === "string" ? g.description : "",
      deadline: readDate(g.deadline),
      priority: (g.priority === "p1" || g.priority === "p2" || g.priority === "p3") ? g.priority : "",
      progress: g.progress && typeof g.progress === "object" ? {
        completed: typeof g.progress.completed === "number" ? g.progress.completed : 0,
        active: typeof g.progress.active === "number" ? g.progress.active : 0
      } : { completed: 0, active: 0 },
      activeTasks: linked
    }
  }

  function normalizeOperation(o) {
    if (!o || typeof o !== "object" || typeof o.operationId !== "string") return null
    return {
      operationId: o.operationId,
      operationGroupId: typeof o.operationGroupId === "string" ? o.operationGroupId : "",
      operation: typeof o.operation === "string" ? o.operation : "",
      status: typeof o.status === "string" ? o.status : "",
      targetType: typeof o.targetType === "string" ? o.targetType : "",
      targetId: typeof o.targetId === "string" ? o.targetId : "",
      undoAvailable: o.undoAvailable === true,
      undoExpiresAt: typeof o.undoExpiresAt === "string" ? o.undoExpiresAt : ""
    }
  }

  // ---------------------------------------------------------- read queue ---
  property Process readProc: Process {
    id: readProc
    stdout: StdioCollector { id: readStdout; waitForEnd: true }
    stderr: StdioCollector { id: readStderr; waitForEnd: true }
    onExited: function(exitCode) { root.finishRead(exitCode, readStdout.text, readStderr.text) }
  }

  function enqueueRead(argv, handler) {
    _readQueue.push({ argv: argv, handler: handler })
    runNextRead()
  }

  function runNextRead() {
    if (_activeRead || _readQueue.length === 0) return
    _activeRead = _readQueue.shift()
    readProc.command = _activeRead.argv
    readProc.running = true
  }

  function finishRead(exitCode, out, err) {
    var job = _activeRead
    _activeRead = null
    if (job && job.handler) job.handler(exitCode, out, err)
    runNextRead()
  }

  // ------------------------------------------------------------- refresh ---
  // Background ticks use refresh() and can be skipped when the last good
  // snapshot is under a minute old or a failure backoff is active.
  // User-initiated paths (open, manual refresh, write receipt) pass
  // force=true so the panel still feels instant. A date rollover always
  // refreshes so the badge never sticks on yesterday.
  function backoffMs() {
    if (_failCount <= 0) return 0
    var shift = _failCount > 4 ? 4 : _failCount
    var wait = 300000 * Math.pow(2, shift - 1)
    return wait > 1800000 ? 1800000 : wait
  }

  function refresh(force) {
    var nowDate = Qt.formatDate(new Date(), "yyyy-MM-dd")
    var dateChanged = (nowDate !== today)
    today = nowDate
    // In watch mode the FileView pushes updates and the poll timer stays off;
    // a manual refresh rereads the file and reports watcher health instead of
    // polling HTTP.
    if (watching) {
      if (force === true || dateChanged) refreshWatch()
      else checkWatchFreshness()
      return
    }
    if (force !== true && !dateChanged) {
      var now = Date.now()
      if (_lastSuccessMs > 0 && now - _lastSuccessMs < 60000) return
      if (_failCount > 0 && now - _lastFailMs < backoffMs()) return
    }
    if (_pendingReads > 0) { _refreshQueued = true; _queuedForce = _queuedForce || force === true || dateChanged; return }
    _pendingReads = 2
    syncing = true
    enqueueRead([cli, "tasks", "list", "--all", "--json"], handleTasks)
    enqueueRead([cli, "goals", "list", "--json"], handleGoals)
  }

  function finishRefreshBatch() {
    _pendingReads -= 1
    if (_pendingReads > 0) return
    _pendingReads = 0
    syncing = false
    if (lastError === "") {
      initialized = true
      lastSyncAt = Qt.formatTime(new Date(), "HH:mm")
      _lastSuccessMs = Date.now()
      _failCount = 0
    } else {
      _lastFailMs = Date.now()
      _failCount += 1
    }
    if (_refreshQueued) { _refreshQueued = false; var queuedForce = _queuedForce; _queuedForce = false; refresh(queuedForce) }
  }

  function handleTasks(exitCode, out, err) {
    if (watching) { _pendingReads = Math.max(0, _pendingReads - 1); return }
    if (exitCode !== 0) lastError = commandError(out, err, "Pravah could not load tasks")
    else {
      var env = parseEnvelope(out)
      if (!env || !env.ok) lastError = env && env.error && env.error.message ? env.error.message : "Pravah returned an unreadable response"
      else {
        lastError = ""
        var list = env.data && Array.isArray(env.data.tasks) ? env.data.tasks : []
        var norm = []
        for (var i = 0; i < list.length; i++) {
          var t = normalizeTask(list[i])
          if (t) norm.push(t)
        }
        _rawTasks = norm
      }
    }
    finishRefreshBatch()
  }

  function handleGoals(exitCode, out, err) {
    if (watching) { _pendingReads = Math.max(0, _pendingReads - 1); return }
    if (exitCode !== 0) { /* goals failures don't block the task lists */ }
    else {
      var env = parseEnvelope(out)
      if (env && env.ok) {
        var list = env.data && Array.isArray(env.data.goals) ? env.data.goals : []
        var norm = []
        for (var i = 0; i < list.length; i++) {
          var g = normalizeGoal(list[i])
          if (g) norm.push(g)
        }
        goals = norm
      }
    }
    finishRefreshBatch()
  }

  // ----------------------------------------------------- watch transport ---
  // The snapshot is written by `pravah watch` with a temp-file + rename, so a
  // FileView read never observes a half-written file. The one-time `watch
  // --path` call keeps the XDG resolution rules in the CLI rather than
  // duplicating them here.
  //
  // FileView must live in a property: QtObject has no default property, so a
  // bare FileView child fails the whole component with "Cannot assign to
  // non-existent default property" before any transport is even selected.
  // FileView also caches its content: onFileChanged must reload() and the
  // parse must happen in onLoaded, otherwise updates reread stale text.
  property FileView snapshotView: FileView {
    id: snapshotView
    path: root.watching ? root.snapshotPath : ""
    watchChanges: root.watching
    blockLoading: false
    onLoaded: function() { root.applySnapshotText(snapshotView.text()) }
    onFileChanged: function() { snapshotView.reload() }
    onLoadFailed: function() {
      if (!root.watching) return
      root.syncing = false
      root.snapshotStale = false
      root.lastError = "pravah watch is not publishing a snapshot — start it with `pravah watch`"
    }
  }

  // The daemon heartbeats `generatedAt` every minute while idle, so a file
  // whose timestamp stops advancing means the daemon died. Checked on every
  // load/change and on a small timer, because a healthy idle socket would
  // otherwise look identical to a dead one.
  property double _lastSnapshotMs: 0
  property Timer watchFreshTimer: Timer {
    interval: 30000
    running: root.watching
    repeat: true
    onTriggered: root.checkWatchFreshness()
  }

  function checkWatchFreshness() {
    if (!watching || !snapshotResolved) return
    if (_lastSnapshotMs <= 0) {
      if (snapshotPath !== "") {
        snapshotStale = true
        if (lastError === "") lastError = "pravah watch is not publishing a snapshot — start it with `pravah watch`"
      }
      return
    }
    var stale = (Date.now() - _lastSnapshotMs) > 600000
    snapshotStale = stale
    if (stale) lastError = "pravah watch stopped updating — restart it with `pravah watch`"
    else if (lastError === "pravah watch stopped updating — restart it with `pravah watch`") lastError = ""
  }

  // Manual refresh in watch mode: reread the file and surface watcher health.
  // Never falls back to HTTP polling — that would hide a dead `pravah watch`
  // behind plausible-looking data.
  function refreshWatch() {
    if (!snapshotResolved) resolveSnapshotPathFromCli()
    if (snapshotPath === "") {
      if (snapshotResolved) lastError = "Pravah reported an empty watch snapshot path"
      return
    }
    syncing = true
    snapshotView.reload()
    checkWatchFreshness()
  }

  function resolveSnapshotPathFromCli() {
    if (!watching || snapshotResolved) return
    enqueueRead([cli, "watch", "--path"], function(exitCode, out, err) {
      if (exitCode !== 0) {
        lastError = "Pravah could not resolve the watch snapshot path"
        return
      }
      var path = String(out).trim()
      snapshotResolved = path !== ""
      if (path === "") lastError = "Pravah reported an empty watch snapshot path"
      else snapshotPath = path
    })
  }

  function applySnapshotText(raw) {
    if (!watching) return
    var snap = null
    try { snap = JSON.parse(String(raw)) } catch (e) { snap = null }
    if (!snap || typeof snap !== "object" || snap.version !== 1) {
      lastError = "pravah watch wrote an unreadable snapshot"
      return
    }
    var tasks = Array.isArray(snap.tasks) ? snap.tasks : []
    var normTasks = []
    for (var i = 0; i < tasks.length; i++) {
      var t = normalizeTask(tasks[i])
      if (t) normTasks.push(t)
    }
    // Snapshot goals carry counters rather than embedded tasks, so link them
    // back here for the same goal-stitching the HTTP path gets from
    // `goals list`.
    var byGoal = {}
    for (var k = 0; k < normTasks.length; k++) {
      var gid = normTasks[k].goalId
      if (gid === "" || gid === undefined) continue
      if (!byGoal[gid]) byGoal[gid] = []
      byGoal[gid].push(normTasks[k])
    }
    var snapGoals = Array.isArray(snap.goals) ? snap.goals : []
    var normGoals = []
    for (var g = 0; g < snapGoals.length; g++) {
      var raw_ = snapGoals[g]
      if (!raw_ || typeof raw_.id !== "string" || typeof raw_.text !== "string") continue
      var linked = byGoal[raw_.id] ? byGoal[raw_.id] : []
      normGoals.push({
        id: raw_.id,
        text: raw_.text,
        description: typeof raw_.description === "string" ? raw_.description : "",
        deadline: readDate(raw_.deadline),
        priority: (raw_.priority === "p1" || raw_.priority === "p2" || raw_.priority === "p3") ? raw_.priority : "",
        progress: {
          completed: typeof raw_.completedTasks === "number" ? raw_.completedTasks : 0,
          active: typeof raw_.linkedTasks === "number" ? raw_.linkedTasks : 0
        },
        activeTasks: linked
      })
    }

    _rawTasks = normTasks
    goals = normGoals
    if (typeof snap.day === "string" && snap.day !== "") today = snap.day
    lastError = ""
    initialized = true
    syncing = false
    lastSyncAt = Qt.formatTime(new Date(), "HH:mm")
    _lastSuccessMs = Date.now()
    _failCount = 0
    _lastSnapshotMs = typeof snap.generatedAt === "number" ? snap.generatedAt : Date.now()
    // A snapshot that stopped advancing means the daemon died. Say so rather
    // than showing data that looks current.
    checkWatchFreshness()
    // A degraded snapshot carries the last complete data plus the failing
    // queries. Surface it even when the timestamp is fresh — the heartbeat
    // stops advancing while any source is failing, so age alone would lag.
    var snapErrors = []
    if (Array.isArray(snap.errors))
      for (var e = 0; e < snap.errors.length; e++)
        if (typeof snap.errors[e] === "string" && snap.errors[e] !== "") snapErrors.push(snap.errors[e])
    if (snapErrors.length > 0) {
      snapshotStale = true
      lastError = "pravah watch subscription failed: " + snapErrors.join(", ")
    }
  }

  function loadOperations() {
    enqueueRead([cli, "operations", "list", "--limit", "30", "--json"], function(exitCode, out, err) {
      if (exitCode !== 0) return
      var env = parseEnvelope(out)
      if (!env || !env.ok) return
      var list = env.data && Array.isArray(env.data.operations) ? env.data.operations : []
      var norm = []
      for (var i = 0; i < list.length; i++) {
        var o = normalizeOperation(list[i])
        if (o) norm.push(o)
      }
      operations = norm
    })
  }

  function checkHealth() {
    enqueueRead([cli, "doctor", "--json"], function(exitCode, out, err) {
      healthChecked = true
      if (exitCode !== 0) {
        healthy = false
        healthMessage = "pravah CLI is not available — install it with `bun install --global pravah`"
        return
      }
      var env = parseEnvelope(out)
      if (!env || !env.ok) {
        healthy = false
        healthMessage = env && env.error && env.error.message ? env.error.message : "Pravah doctor failed"
        return
      }
      healthy = env.data && env.data.healthy === true
      var fail = ""
      var checks = env.data && Array.isArray(env.data.checks) ? env.data.checks : []
      for (var i = 0; i < checks.length; i++)
        if (!checks[i].ok && fail === "") fail = checks[i].name + " — " + checks[i].remedy
      healthMessage = healthy ? "" : (fail || "Pravah doctor reported problems")
    })
    enqueueRead([cli, "auth", "status", "--json"], function(exitCode, out, err) {
      if (exitCode !== 0) { authenticated = false; canWrite = false; return }
      var env = parseEnvelope(out)
      if (!env || !env.ok) { authenticated = false; canWrite = false; return }
      var d = env.data || {}
      authenticated = d.authenticated === true
      var scopes = Array.isArray(d.scopes) ? d.scopes : []
      canWrite = scopes.indexOf("tasks:write") !== -1
      if (authenticated && healthy) healthMessage = ""
    })
  }

  // -------------------------------------------------------------- writes ---
  property Process writeProc: Process {
    id: writeProc
    stdout: StdioCollector { id: writeStdout; waitForEnd: true }
    stderr: StdioCollector { id: writeStderr; waitForEnd: true }
    onExited: function(exitCode) { root.finishWrite(exitCode, writeStdout.text, writeStderr.text) }
  }

  // Insert extra flags before `--` so they are not extra positionals
  // after the title. tasks add / goals add end with `--` + title.
  function withWriteFlags(baseArgv, extra) {
    var argv = baseArgv || []
    var flags = extra || []
    var cut = -1
    for (var i = 0; i < argv.length; i++) {
      if (argv[i] === "--") { cut = i; break }
    }
    if (cut === -1) return argv.concat(flags)
    return argv.slice(0, cut).concat(flags).concat(argv.slice(cut))
  }

  // baseArgv must include --json but no --dry-run/--idempotency-key.
  // Returns false when a write is already in flight or the credential
  // lacks tasks:write.
  function submitWrite(baseArgv, label) {
    if (writeBusy || !canWrite) return false
    writeBusy = true
    writeLabel = label
    lastWriteError = ""
    var key = "omarchy-widget-" + Date.now() + "-" + Math.floor(Math.random() * 1000000)
    _write = { argv: withWriteFlags(baseArgv, ["--idempotency-key", key]), applied: false }
    writeProc.command = withWriteFlags(baseArgv, ["--dry-run", "--idempotency-key", key])
    writeProc.running = true
    return true
  }

  function finishWrite(exitCode, out, err) {
    if (!_write) return
    if (exitCode !== 0) { failWrite(commandError(out, err, "Pravah could not complete the change")); return }
    var env = parseEnvelope(out)
    if (!env) { failWrite("Pravah returned an unreadable response"); return }
    if (!env.ok) { failWrite(env.error && env.error.message ? env.error.message : "Pravah could not complete the change"); return }
    if (!_write.applied) {
      _write.applied = true
      writeProc.command = _write.argv
      writeProc.running = true
      return
    }
    _write = null
    writeBusy = false
    writeLabel = ""
    lastWriteError = ""
    writeSucceeded(env)
    refresh(true)
  }

  function failWrite(message) {
    _write = null
    writeBusy = false
    writeLabel = ""
    lastWriteError = String(message || "Pravah command failed").slice(0, 240)
    writeFailed(lastWriteError)
  }

  // --------------------------------------------------------- argv builders ---
  // Field object: { title, description, deadline, time, priority, tags, estimatedMinutes, goalId }
  // where "" means "unset", tags is an array, and goalId "" means "no
  // change" (add) while taskEditArgv diffs it against the task's link.
  function taskAddArgv(f, defaultDeadline) {
    var argv = [cli, "tasks", "add", "--json"]
    var deadline = f.deadline || defaultDeadline || ""
    if (deadline !== "") argv = argv.concat(["--deadline", deadline])
    if (f.time) argv = argv.concat(["--time", f.time])
    if (f.priority) argv = argv.concat(["--priority", f.priority])
    if (f.tags && f.tags.length > 0) argv = argv.concat(["--tags", f.tags.join(",")])
    if (f.estimatedMinutes > 0) argv = argv.concat(["--estimated-minutes", String(Math.round(f.estimatedMinutes))])
    if (f.description) argv = argv.concat(["--description", f.description])
    if (f.goalId) argv = argv.concat(["--goal", f.goalId])
    return argv.concat(["--", f.title])
  }

  function taskEditArgv(task, f) {
    var argv = [cli, "tasks", "edit", task.id, "--json"]
    var deadlineNow = f.deadline || ""
    var timeNow = deadlineNow === "" ? "" : (f.time || "")
    if (f.title !== task.title) argv = argv.concat(["--title", f.title])
    if (f.description !== (task.description || ""))
      argv = argv.concat(["--description", f.description === "" ? "clear" : f.description])
    if (deadlineNow !== (task.deadline || ""))
      argv = argv.concat(["--deadline", deadlineNow === "" ? "clear" : deadlineNow])
    if (timeNow !== (task.time || ""))
      argv = argv.concat(["--time", timeNow === "" ? "clear" : timeNow])
    if (f.priority !== (task.priority || ""))
      argv = argv.concat(["--priority", f.priority === "" ? "clear" : f.priority])
    var tagsNow = f.tags ? f.tags.join(",") : ""
    if (tagsNow !== (task.tags || []).join(","))
      argv = argv.concat(["--tags", tagsNow === "" ? "clear" : tagsNow])
    var estNow = f.estimatedMinutes > 0 ? Math.round(f.estimatedMinutes) : 0
    if (estNow !== (task.estimatedMinutes || 0))
      argv = argv.concat(["--estimated-minutes", estNow === 0 ? "clear" : String(estNow)])
    var goalNow = f.goalId || ""
    var goalBefore = (task.goal && task.goal.id) || ""
    if (goalNow !== goalBefore)
      argv = argv.concat(["--goal", goalNow === "" ? "clear" : goalNow])
    return argv
  }

  function taskLinkArgv(task, goalId) { return [cli, "tasks", "link", task.id, "--json", "--goal", goalId] }
  function taskUnlinkArgv(task) { return [cli, "tasks", "unlink", task.id, "--json"] }

  function taskCompleteArgv(task) { return [cli, "tasks", "complete", task.id, "--json"] }
  function taskReopenArgv(task) { return [cli, "tasks", "reopen", task.id, "--json"] }
  function taskScheduleArgv(task, date) { return [cli, "tasks", "schedule", task.id, "--json", "--date", date] }
  function taskUnscheduleArgv(task) { return [cli, "tasks", "unschedule", task.id, "--json"] }
  function taskRemoveArgv(task) { return [cli, "tasks", "remove", task.id, "--json", "--confirm"] }

  function goalAddArgv(f) {
    var argv = [cli, "goals", "add", "--json"]
    if (f.deadline) argv = argv.concat(["--deadline", f.deadline])
    if (f.priority) argv = argv.concat(["--priority", f.priority])
    if (f.description) argv = argv.concat(["--description", f.description])
    return argv.concat(["--", f.title])
  }

  function goalEditArgv(goal, f) {
    var argv = [cli, "goals", "edit", goal.id, "--json"]
    if ((f.description || "") !== (goal.description || ""))
      argv = argv.concat(["--description", f.description ? f.description : "clear"])
    if ((f.deadline || "") !== (goal.deadline || ""))
      argv = argv.concat(["--deadline", f.deadline ? f.deadline : "clear"])
    if ((f.priority || "") !== (goal.priority || ""))
      argv = argv.concat(["--priority", f.priority ? f.priority : "clear"])
    return argv
  }

  function goalRemoveArgv(goal) { return [cli, "goals", "remove", goal.id, "--json", "--confirm"] }

  function undoArgv(operation) { return [cli, "operations", "undo", operation.operationId, "--json"] }

  Component.onCompleted: {
    _started = true
    checkHealth()
    if (watching) resolveSnapshotPathFromCli()
    else refresh()
  }
}

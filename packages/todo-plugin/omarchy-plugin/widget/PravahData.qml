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
//   exact same argv with a shared --idempotency-key, so a retry of the
//   same intended change is safe.
// - Horizon rules mirror the CLI's own: active = inbox|timeline,
//   overdue = timeline deadline < today, upcoming = today < deadline
//   <= today + 14, sorted by date, then time, then priority, then title.
QtObject {
  id: root

  property string cli: "pravah"

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
  property var _readQueue: []
  property var _activeRead: null
  property var _write: null

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
    for (var i = 0; i < allTasks.length; i++)
      if (allTasks[i].status === "completed" && allTasks[i].deadline === today) out.push(allTasks[i])
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

  function readTime(value) {
    return (typeof value === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(value)) ? value : ""
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
  function refresh() {
    today = Qt.formatDate(new Date(), "yyyy-MM-dd")
    if (_pendingReads > 0) { _refreshQueued = true; return }
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
    }
    if (_refreshQueued) { _refreshQueued = false; refresh() }
  }

  function handleTasks(exitCode, out, err) {
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

  // baseArgv must include --json but no --dry-run/--idempotency-key.
  // Returns false when a write is already in flight or the credential
  // lacks tasks:write.
  function submitWrite(baseArgv, label) {
    if (writeBusy || !canWrite) return false
    writeBusy = true
    writeLabel = label
    lastWriteError = ""
    var key = "omarchy-widget-" + Date.now() + "-" + Math.floor(Math.random() * 1000000)
    _write = { argv: baseArgv.concat(["--idempotency-key", key]), applied: false }
    writeProc.command = baseArgv.concat(["--dry-run", "--idempotency-key", key])
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
    refresh()
    loadOperations()
  }

  function failWrite(message) {
    _write = null
    writeBusy = false
    writeLabel = ""
    lastWriteError = String(message || "Pravah command failed").slice(0, 240)
    writeFailed(lastWriteError)
  }

  // --------------------------------------------------------- argv builders ---
  // Field object: { title, description, deadline, time, priority, tags, estimatedMinutes }
  // where "" means "unset" and tags is an array.
  function taskAddArgv(f, defaultDeadline) {
    var argv = [cli, "tasks", "add", "--json"]
    var deadline = f.deadline || defaultDeadline || ""
    if (deadline !== "") argv = argv.concat(["--deadline", deadline])
    if (f.time) argv = argv.concat(["--time", f.time])
    if (f.priority) argv = argv.concat(["--priority", f.priority])
    if (f.tags && f.tags.length > 0) argv = argv.concat(["--tags", f.tags.join(",")])
    if (f.estimatedMinutes > 0) argv = argv.concat(["--estimated-minutes", String(Math.round(f.estimatedMinutes))])
    if (f.description) argv = argv.concat(["--description", f.description])
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
    return argv
  }

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
    checkHealth()
    refresh()
  }
}

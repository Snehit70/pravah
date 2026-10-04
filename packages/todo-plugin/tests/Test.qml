import QtQuick
import Quickshell
import Quickshell.Io

// Headless contract tests for PravahData.qml. Instantiates the real data
// layer against fake-pravah and asserts horizons, argv, envelope parsing,
// token parsing, filters, and the dry-run → apply write pipeline.
ShellRoot {
  id: root

  property int passed: 0
  property int failed: 0
  property var failures: []
  property int phase: 0
  property bool finished: false

  PravahData {
    id: store
    cli: Quickshell.shellDir + "/pravah"
  }

  // Second data layer pinned to the watch transport, so the snapshot parsing
  // and the no-HTTP-fallback rule are covered without a live `pravah watch`.
  PravahData {
    id: watchStore
    cli: Quickshell.shellDir + "/pravah"
    transport: "watch"
  }

  Process {
    id: logCat
    command: ["cat", String(Quickshell.env("PRAVAH_FAKE_LOG") || "")]
    stdout: StdioCollector { id: logStdout; waitForEnd: true }
    onExited: function() { root.inspectWriteLog(String(logStdout.text)) }
  }

  FileView {
    id: resultFile
    path: Quickshell.env("PRAVAH_TEST_RESULT") || ""
    preload: false
    watchChanges: false
  }

  function eq(name, actual, expected) {
    var a = String(actual)
    var e = String(expected)
    if (a === e) {
      passed += 1
      return true
    }
    failed += 1
    failures.push(name + ": got " + a + " expected " + e)
    return false
  }

  function ok(name, cond) {
    if (cond) {
      passed += 1
      return true
    }
    failed += 1
    failures.push(name)
    return false
  }

  function ids(list) {
    var out = []
    for (var i = 0; i < list.length; i++) out.push(list[i].id)
    return out.join(",")
  }

  function argvEq(name, actual, expected) {
    eq(name, JSON.stringify(actual), JSON.stringify(expected))
  }

  function runSyncTests() {
    ok("parseEnvelope object", store.parseEnvelope('{"ok":true,"data":{"n":1}}').ok === true)
    ok("parseEnvelope trash", store.parseEnvelope("not-json") === null)
    ok("parseEnvelope empty", store.parseEnvelope("") === null)
    eq("commandError envelope", store.commandError('{"ok":false,"error":{"message":"nope"}}', "", "fb"), "nope")
    eq("commandError stdout", store.commandError("raw-out", "", "fb"), "raw-out")
    eq("commandError fallback", store.commandError("", "", "fb"), "fb")

    eq("addDays", store.addDays("2026-09-04", 1), "2026-09-05")
    eq("addDays month", store.addDays("2026-01-31", 1), "2026-02-01")
    eq("dayLabel today", store.dayLabel(store.today), "Today")
    eq("dayLabel tomorrow", store.dayLabel(store.addDays(store.today, 1)), "Tomorrow")

    var fromId = store.normalizeTask({ id: "t1", title: "A", status: "inbox" })
    eq("norm id", fromId.id, "t1")
    eq("norm inbox", fromId.status, "inbox")

    var fromUnderscore = store.normalizeTask({ _id: "t2", title: "B", deadline: "2026-09-04" })
    eq("norm _id", fromUnderscore.id, "t2")
    eq("norm timeline from deadline", fromUnderscore.status, "timeline")
    eq("norm deadline", fromUnderscore.deadline, "2026-09-04")

    var fromScheduled = store.normalizeTask({ id: "t3", title: "C", scheduledDate: "2026-09-05" })
    eq("norm scheduledDate", fromScheduled.deadline, "2026-09-05")
    eq("norm timeline from scheduledDate", fromScheduled.status, "timeline")

    ok("norm null no title", store.normalizeTask({ id: "x" }) === null)
    ok("norm null no id", store.normalizeTask({ title: "x" }) === null)

    var completed = store.normalizeTask({ id: "t4", title: "D", completedAt: 1 })
    eq("norm completedAt", completed.status, "completed")
    eq("norm completedAt kept", completed.completedAt, 1)
    var cancelled = store.normalizeTask({ id: "t5", title: "E", cancelledAt: 1 })
    eq("norm cancelledAt", cancelled.status, "cancelled")

    var messy = store.normalizeTask({
      id: "t6",
      title: "F",
      status: "inbox",
      deadline: "nope",
      time: "9:30",
      priority: "p9",
      tags: ["ok", "", 12],
      estimatedMinutes: "30"
    })
    eq("norm bad date", messy.deadline, "")
    eq("norm bad time", messy.time, "")
    eq("norm bad priority", messy.priority, "")
    eq("norm tags", messy.tags.join(","), "ok")
    eq("norm bad estimate", messy.estimatedMinutes, 0)

    var timed = store.normalizeTask({ id: "t7", title: "G", status: "timeline", deadline: "2026-09-04", time: "09:30", priority: "p2", estimatedMinutes: 45, tags: ["home"] })
    eq("norm time", timed.time, "09:30")
    eq("norm p2", timed.priority, "p2")
    eq("norm estimate", timed.estimatedMinutes, 45)

    ok("norm goal null", store.normalizeGoal({ id: "g" }) === null)
    var goal = store.normalizeGoal({
      id: "g1",
      text: "Ship",
      activeTasks: [{ id: "t1", title: "A", status: "inbox" }, { title: "drop" }],
      progress: { completed: 1 }
    })
    eq("norm goal text", goal.text, "Ship")
    eq("norm goal progress active default", goal.progress.active, 0)
    eq("norm goal progress completed", goal.progress.completed, 1)
    eq("norm goal linked", goal.activeTasks.length, 1)

    ok("norm op null", store.normalizeOperation({ status: "applied" }) === null)
    var op = store.normalizeOperation({ operationId: "op1", undoAvailable: "yes" })
    eq("norm op undo strict", op.undoAvailable, false)
    var op2 = store.normalizeOperation({ operationId: "op2", undoAvailable: true, operation: "tasks.add" })
    eq("norm op undo true", op2.undoAvailable, true)

    var empty = store.parseQuickAdd("  ")
    ok("qa empty", empty === null)
    var plain = store.parseQuickAdd("Draft spec")
    eq("qa plain title", plain.title, "Draft spec")
    eq("qa plain pri", plain.priority, "")
    var mixed = store.parseQuickAdd("Fix leak !P1 @home @work ~30m 9:30")
    eq("qa mixed title", mixed.title, "Fix leak")
    eq("qa mixed pri", mixed.priority, "p1")
    eq("qa mixed tags", mixed.tags.join(","), "home,work")
    eq("qa mixed est", mixed.estimatedMinutes, 30)
    eq("qa mixed time", mixed.time, "09:30")
    var hours = store.parseQuickAdd("Deep work ~2h")
    eq("qa hours", hours.estimatedMinutes, 120)
    var mins = store.parseQuickAdd("Ping ~15min")
    eq("qa min suffix", mins.estimatedMinutes, 15)
    var onlyTok = store.parseQuickAdd("!p2")
    eq("qa tokens-only title", onlyTok.title, "!p2")
    eq("qa tokens-only pri", onlyTok.priority, "p2")
    var late = store.parseQuickAdd("Call 23:59")
    eq("qa 23:59", late.time, "23:59")

    var t = { title: "Draft spec", description: "Widget coverage", tags: ["work"], priority: "p1" }
    ok("filter search hit", store.passesFilters(t, "widget", [], "") === true)
    ok("filter search miss", store.passesFilters(t, "banana", [], "") === false)
    ok("filter pri hit", store.passesFilters(t, "", ["p1"], "") === true)
    ok("filter pri miss", store.passesFilters(t, "", ["p2"], "") === false)
    ok("filter tag hit", store.passesFilters(t, "", [], "work") === true)
    ok("filter tag miss", store.passesFilters(t, "", [], "home") === false)

    var add = store.taskAddArgv({
      title: "Draft spec",
      description: "notes",
      deadline: "2026-09-04",
      time: "09:30",
      priority: "p1",
      tags: ["work", "home"],
      estimatedMinutes: 30
    }, "")
    argvEq("taskAdd", add, [store.cli, "tasks", "add", "--json", "--deadline", "2026-09-04", "--time", "09:30", "--priority", "p1", "--tags", "work,home", "--estimated-minutes", "30", "--description", "notes", "--", "Draft spec"])

    var addDefault = store.taskAddArgv({ title: "Inbox me", description: "", deadline: "", time: "", priority: "", tags: [], estimatedMinutes: 0 }, "2026-09-04")
    argvEq("taskAdd default deadline", addDefault, [store.cli, "tasks", "add", "--json", "--deadline", "2026-09-04", "--", "Inbox me"])

    var task = { id: "t1", title: "Old", description: "", deadline: "2026-09-04", time: "09:00", priority: "p1", tags: ["x"], estimatedMinutes: 30 }
    var editDesc = store.taskEditArgv(task, { title: "Old", description: "notes", deadline: "2026-09-04", time: "09:00", priority: "p1", tags: ["x"], estimatedMinutes: 30 })
    argvEq("taskEdit description", editDesc, [store.cli, "tasks", "edit", "t1", "--json", "--description", "notes"])

    var editClear = store.taskEditArgv(task, { title: "Old", description: "", deadline: "", time: "", priority: "", tags: [], estimatedMinutes: 0 })
    argvEq("taskEdit clear", editClear, [store.cli, "tasks", "edit", "t1", "--json", "--deadline", "clear", "--time", "clear", "--priority", "clear", "--tags", "clear", "--estimated-minutes", "clear"])

    var addGoal = store.taskAddArgv({ title: "Goal task", description: "", deadline: "", time: "", priority: "", tags: [], estimatedMinutes: 0, goalId: "g_ship" }, "")
    argvEq("taskAdd goal", addGoal, [store.cli, "tasks", "add", "--json", "--goal", "g_ship", "--", "Goal task"])

    var editLink = store.taskEditArgv({ id: "t1", title: "Old", description: "", deadline: "", time: "", priority: "", tags: [], estimatedMinutes: 0, goal: null }, { title: "Old", description: "", deadline: "", time: "", priority: "", tags: [], estimatedMinutes: 0, goalId: "g_ship" })
    argvEq("taskEdit link", editLink, [store.cli, "tasks", "edit", "t1", "--json", "--goal", "g_ship"])

    var editUnlink = store.taskEditArgv({ id: "t1", title: "Old", description: "", deadline: "", time: "", priority: "", tags: [], estimatedMinutes: 0, goal: { id: "g_ship" } }, { title: "Old", description: "", deadline: "", time: "", priority: "", tags: [], estimatedMinutes: 0, goalId: "" })
    argvEq("taskEdit unlink", editUnlink, [store.cli, "tasks", "edit", "t1", "--json", "--goal", "clear"])

    argvEq("link", store.taskLinkArgv(task, "g_ship"), [store.cli, "tasks", "link", "t1", "--json", "--goal", "g_ship"])
    argvEq("unlink", store.taskUnlinkArgv(task), [store.cli, "tasks", "unlink", "t1", "--json"])

    argvEq("complete", store.taskCompleteArgv(task), [store.cli, "tasks", "complete", "t1", "--json"])
    argvEq("reopen", store.taskReopenArgv(task), [store.cli, "tasks", "reopen", "t1", "--json"])
    argvEq("schedule", store.taskScheduleArgv(task, "2026-09-05"), [store.cli, "tasks", "schedule", "t1", "--json", "--date", "2026-09-05"])
    argvEq("unschedule", store.taskUnscheduleArgv(task), [store.cli, "tasks", "unschedule", "t1", "--json"])
    argvEq("remove", store.taskRemoveArgv(task), [store.cli, "tasks", "remove", "t1", "--json", "--confirm"])

    var goalAdd = store.goalAddArgv({ title: "Ship", description: "why", deadline: "2026-09-11", priority: "p1" })
    argvEq("goalAdd", goalAdd, [store.cli, "goals", "add", "--json", "--deadline", "2026-09-11", "--priority", "p1", "--description", "why", "--", "Ship"])
    var goal = { id: "g1", text: "Ship", description: "why", deadline: "2026-09-11", priority: "p1" }
    var goalEdit = store.goalEditArgv(goal, { title: "Ship", description: "new why", deadline: "2026-09-11", priority: "p1" })
    argvEq("goalEdit description", goalEdit, [store.cli, "goals", "edit", "g1", "--json", "--description", "new why"])
    var goalClear = store.goalEditArgv(goal, { title: "Ship", description: "", deadline: "", priority: "" })
    argvEq("goalEdit clear", goalClear, [store.cli, "goals", "edit", "g1", "--json", "--description", "clear", "--deadline", "clear", "--priority", "clear"])
    var goalNoChange = store.goalEditArgv(goal, { title: "Ship", description: "why", deadline: "2026-09-11", priority: "p1" })
    argvEq("goalEdit no-change stays base argv", goalNoChange, [store.cli, "goals", "edit", "g1", "--json"])
    var goalRenameIgnored = store.goalEditArgv(goal, { title: "Renamed", description: "why", deadline: "2026-09-11", priority: "p1" })
    argvEq("goalEdit ignores title", goalRenameIgnored, [store.cli, "goals", "edit", "g1", "--json"])
    argvEq("goalRemove", store.goalRemoveArgv({ id: "g1" }), [store.cli, "goals", "remove", "g1", "--json", "--confirm"])
    argvEq("undo", store.undoArgv({ operationId: "op1" }), [store.cli, "operations", "undo", "op1", "--json"])

    // An unchanged goal editor must not submit a no-op write.
    var goalBefore = { id: "g1", text: "Ship", description: "why", deadline: "2026-09-11", priority: "p1" }
    eq("goalEdit noop", store.goalEditArgv(goalBefore, { title: "Ship", description: "why", deadline: "2026-09-11", priority: "p1" }).length, 5)
    ok("goalEdit changed", store.goalEditArgv(goalBefore, { title: "Ship", description: "new", deadline: "2026-09-11", priority: "p1" }).length > 5)

    var writeFlags = ["--dry-run", "--idempotency-key", "omarchy-widget-test"]
    argvEq("withWriteFlags add before --", store.withWriteFlags(addDefault, writeFlags), [
      store.cli, "tasks", "add", "--json", "--deadline", "2026-09-04",
      "--dry-run", "--idempotency-key", "omarchy-widget-test",
      "--", "Inbox me"
    ])
    argvEq("withWriteFlags goalAdd before --", store.withWriteFlags(goalAdd, writeFlags), [
      store.cli, "goals", "add", "--json", "--deadline", "2026-09-11", "--priority", "p1", "--description", "why",
      "--dry-run", "--idempotency-key", "omarchy-widget-test",
      "--", "Ship"
    ])
    argvEq("withWriteFlags complete append", store.withWriteFlags(store.taskCompleteArgv(task), writeFlags), [
      store.cli, "tasks", "complete", "t1", "--json",
      "--dry-run", "--idempotency-key", "omarchy-widget-test"
    ])
  }

  function runHorizonTests() {
    eq("health checked", store.healthChecked, true)
    eq("healthy", store.healthy, true)
    eq("authenticated", store.authenticated, true)
    eq("canWrite", store.canWrite, true)
    eq("initialized", store.initialized, true)
    eq("lastError", store.lastError, "")

    eq("overdue ids", ids(store.overdueTasks), "t_overdue")
    eq("today ids", ids(store.todayTasks), "t_today_p1,t_today_p3")
    eq("upcoming ids", ids(store.upcomingTasks), "t_tomorrow,t_week")
    eq("inbox ids", ids(store.inboxTasks), "t_inbox")
    eq("completed today ids", ids(store.completedToday), "t_done")
    eq("upcoming group count", store.upcomingGroups.length, 2)
    eq("allTags", store.allTags.join(","), "home,work")

    var stitched = null
    for (var i = 0; i < store.allTasks.length; i++)
      if (store.allTasks[i].id === "t_today_p1") stitched = store.allTasks[i]
    ok("goal stitched", stitched && stitched.goal && stitched.goal.id === "g_ship")
    eq("goals loaded", store.goals.length, 1)
    eq("goal linked", store.goals[0].activeTasks.length, 1)

    var farVisible = false
    for (var k = 0; k < store.upcomingTasks.length; k++)
      if (store.upcomingTasks[k].id === "t_far") farVisible = true
    ok("far future excluded from upcoming", farVisible === false)
  }

  function finish() {
    if (finished) return
    finished = true
    var line = "PRAVAH_QTEST passed=" + passed + " failed=" + failed
    if (failures.length > 0) line += "\n" + failures.join("\n")
    console.log(line)
    if (resultFile.path && resultFile.path !== "") {
      resultFile.setText(line + "\n")
    } else {
      Qt.quit()
    }
  }

  Connections {
    target: resultFile
    function onSaved() { Qt.quit() }
    function onSaveFailed(error) {
      console.log("PRAVAH_QTEST result write failed")
      Qt.quit()
    }
  }

  Connections {
    target: store
    function onWriteSucceeded(envelope) {
      if (phase === 3) {
        ok("write envelope ok", envelope && envelope.ok === true)
        eq("write action", envelope.data.action, "tasks.complete")
        eq("write operation", envelope.data.operation.operationId, "op_test_1")
        phase = 31
        logCat.running = true
        return
      }
      if (phase === 5) {
        ok("add write envelope ok", envelope && envelope.ok === true)
        eq("add write action", envelope.data.action, "tasks.add")
        phase = 51
        logCat.running = true
      }
    }
    function onWriteFailed(message) {
      if (phase !== 4) return
      eq("fail message", message, "stub refused remove")
      eq("writeBusy after fail", store.writeBusy, false)
      phase = 6
    }
  }

  Timer {
    id: boot
    interval: 40
    running: true
    repeat: true
    onTriggered: {
      if (phase === 0) {
        Quickshell.watchFiles = false
        try {
          root.runSyncTests()
        } catch (e) {
          root.ok("runSyncTests threw: " + e, false)
          boot.stop()
          root.finish()
          return
        }
        phase = 1
        return
      }
      if (phase === 1) {
        if (!store.initialized || !store.healthChecked || !store.canWrite) return
        if (store.syncing) return
        try {
          root.runHorizonTests()
        } catch (e) {
          root.ok("runHorizonTests threw: " + e, false)
          boot.stop()
          root.finish()
          return
        }
        ok("blocked write without canWrite", (function() {
          store.canWrite = false
          var blocked = store.submitWrite(store.taskCompleteArgv({ id: "t_today_p1" }), "no")
          store.canWrite = true
          return blocked === false
        })())
        phase = 3
        var started = store.submitWrite(store.taskCompleteArgv({ id: "t_today_p1" }), "Completing…")
        ok("write accepted", started === true)
        return
      }
      if (phase === 6) {
        // The watch store must resolve its snapshot path and load it without
        // ever issuing a `tasks list` or `goals list` read.
        if (!watchStore.snapshotResolved || watchStore.snapshotPath === "") return
        if (!watchStore.initialized) return
        if (watchStore.syncing) return
        try {
          root.runWatchTests()
        } catch (e) {
          root.ok("runWatchTests threw: " + e, false)
          boot.stop()
          root.finish()
          return
        }
        boot.stop()
        root.finish()
        return
      }
    }
  }

  // Watch transport: the snapshot is the only read source, and a snapshot that
  // stops advancing is surfaced rather than papered over.
  function runWatchTests() {
    eq("watch path resolved from the CLI", watchStore.snapshotPath, Quickshell.env("PRAVAH_FAKE_SNAPSHOT") || "")
    eq("watch tasks loaded", watchStore.allTasks.length, 2)
    eq("watch goals loaded", watchStore.goals.length, 1)
    eq("watch snapshot day adopted", watchStore.today, "2026-05-04")
    eq("watch no error", watchStore.lastError, "")
    eq("watch snapshot not stale", watchStore.snapshotStale, false)

    var overdue = 0
    for (var i = 0; i < watchStore.overdueTasks.length; i++) overdue += 1
    eq("watch overdue horizon", overdue, 1)
    var inbox = 0
    for (var j = 0; j < watchStore.inboxTasks.length; j++) inbox += 1
    eq("watch inbox horizon", inbox, 1)

    // Goal stitching: the snapshot goal carries counters, not embedded tasks,
    // so the widget rebuilds activeTasks from each task's goalId.
    var goal = watchStore.goals[0]
    eq("watch goal progress completed", goal.progress.completed, 2)
    eq("watch goal progress active", goal.progress.active, 1)
    eq("watch goal linked task count", goal.activeTasks.length, 1)

    // Canonical backend shape: `_id` with no `status`, lifecycle carried by
    // timestamps and dates, plus the editor fields the snapshot must carry.
    var noon = new Date(2026, 4, 4, 12, 0, 0).getTime()
    watchStore.applySnapshotText(JSON.stringify({
      version: 1, generatedAt: Date.now(), day: "2026-05-04",
      counts: {},
      tasks: [
        { _id: "c_board", title: "Canon board", deadline: "2026-05-04", description: "d", tags: ["h"], estimatedMinutes: 20, goalId: "g9" },
        { _id: "c_done", title: "Canon done", deadline: "2026-04-01", completedAt: noon, description: "did", tags: ["w"], estimatedMinutes: 5, goalId: "g9" }
      ],
      goals: [{ id: "g9", text: "Canon goal", description: "why", linkedTasks: 1, completedTasks: 1 }]
    }))
    eq("watch canonical board kept", watchStore.todayTasks.length, 1)
    var canon = null
    for (var m = 0; m < watchStore.allTasks.length; m++)
      if (watchStore.allTasks[m].id === "c_board") canon = watchStore.allTasks[m]
    ok("watch canonical task found", canon !== null)
    eq("watch canonical description", canon.description, "d")
    eq("watch canonical tags", canon.tags.join(","), "h")
    eq("watch canonical estimate", canon.estimatedMinutes, 20)
    // The completion counts by completedAt day, not by deadline.
    eq("watch canonical completed", watchStore.completedToday.length, 1)
    eq("watch canonical completed id", watchStore.completedToday[0].id, "c_done")
    eq("watch canonical goal description", watchStore.goals[0].description, "why")

    // A degraded snapshot surfaces the failing query instead of looking current.
    watchStore.applySnapshotText(JSON.stringify({
      version: 1, generatedAt: Date.now(), day: "2026-05-04",
      counts: {}, tasks: [], goals: [], errors: ["goals:list"]
    }))
    eq("watch error flagged stale", watchStore.snapshotStale, true)
    ok("watch error names the query", watchStore.lastError.indexOf("goals:list") !== -1)
    // Recovery clears it.
    watchStore.applySnapshotText(JSON.stringify({
      version: 1, generatedAt: Date.now(), day: "2026-05-04",
      counts: {}, tasks: [], goals: []
    }))
    eq("watch error cleared", watchStore.lastError, "")
    eq("watch stale cleared", watchStore.snapshotStale, false)

    // A manual refresh in watch mode rereads the file without HTTP reads.
    var readsBefore = watchStore._readQueue.length
    watchStore.refresh(true)
    eq("watch manual refresh syncing", watchStore.syncing, true)
    ok("watch manual refresh spawns no HTTP read", watchStore._readQueue.length === readsBefore)

    // A stale snapshot must be reported, not silently accepted.
    watchStore.applySnapshotText(JSON.stringify({
      version: 1, generatedAt: Date.now() - 3600000, day: "2026-05-04",
      counts: {}, tasks: [], goals: []
    }))
    eq("stale snapshot flagged", watchStore.snapshotStale, true)
    ok("stale snapshot reports an error", watchStore.lastError !== "")

    // An unreadable snapshot is a hard error, not a silent empty board.
    watchStore.applySnapshotText("{not json")
    ok("malformed snapshot reports an error", watchStore.lastError !== "")

    // The point of the watch transport: no HTTP reads at all.
    ok("watch store never spawned a read", watchStore._readQueue.length === 0)

    watchStore.transport = "cli"
    watchStore._rawTasks = [{ id: "http-only", title: "HTTP result", status: "inbox" }]
    watchStore.lastError = "HTTP error"
    var tasksBeforeSwitch = JSON.stringify(watchStore._rawTasks)
    var errorBeforeSwitch = watchStore.lastError
    watchStore.applySnapshotText(JSON.stringify({ version: 1, tasks: [], goals: [], generatedAt: Date.now() }))
    eq("CLI transport ignores watch snapshots", JSON.stringify(watchStore._rawTasks), tasksBeforeSwitch)
    watchStore.applySnapshotText("{not json")
    eq("CLI transport ignores watch parse errors", watchStore.lastError, errorBeforeSwitch)
  }

  function writeLines(log, needle) {
    var lines = []
    var raw = String(log || "").split("\n")
    for (var i = 0; i < raw.length; i++)
      if (raw[i].indexOf(needle) !== -1) lines.push(raw[i])
    return lines
  }

  function idempotencyKey(line) {
    var part = String(line || "").split("--idempotency-key ")[1]
    return part ? part.split(" ")[0] : ""
  }

  function flagsBeforeSentinel(line, title, expectDryRun) {
    var idx = String(line || "").indexOf(" -- ")
    if (idx === -1) return false
    var before = line.slice(0, idx)
    var after = line.slice(idx + 4)
    if (after.indexOf(title) === -1) return false
    if (before.indexOf("--idempotency-key") === -1) return false
    if (expectDryRun && before.indexOf("--dry-run") === -1) return false
    if (!expectDryRun && before.indexOf("--dry-run") !== -1) return false
    if (after.indexOf("--dry-run") !== -1) return false
    if (after.indexOf("--idempotency-key") !== -1) return false
    return true
  }

  function inspectWriteLog(log) {
    if (phase === 31) {
      var lines = writeLines(log, "tasks complete")
      ok("write two complete calls", lines.length >= 2)
      if (lines.length >= 2) {
        ok("write dry-run first", lines[0].indexOf("--dry-run") !== -1)
        ok("write apply has no dry-run", lines[1].indexOf("--dry-run") === -1)
        var key0 = idempotencyKey(lines[0])
        var key1 = idempotencyKey(lines[1])
        ok("write shared idempotency key", key0 && key0 === key1 && String(key0).indexOf("omarchy-widget-") === 0)
      } else {
        failures.push("write log was: " + String(log || "").replace(/\n/g, " | "))
      }
      phase = 5
      var started = store.submitWrite(store.taskAddArgv({
        title: "Widget add repro",
        description: "",
        deadline: "2026-09-04",
        time: "",
        priority: "",
        tags: [],
        estimatedMinutes: 0
      }, ""), "Adding…")
      ok("add write accepted", started === true)
      return
    }
    if (phase === 51) {
      var addLines = writeLines(log, "tasks add")
      ok("write two add calls", addLines.length >= 2)
      if (addLines.length >= 2) {
        ok("add dry-run first", addLines[0].indexOf("--dry-run") !== -1)
        ok("add apply has no dry-run", addLines[1].indexOf("--dry-run") === -1)
        ok("add dry-run flags before --", flagsBeforeSentinel(addLines[0], "Widget add repro", true))
        ok("add apply flags before --", flagsBeforeSentinel(addLines[1], "Widget add repro", false))
        var addKey0 = idempotencyKey(addLines[0])
        var addKey1 = idempotencyKey(addLines[1])
        ok("add shared idempotency key", addKey0 && addKey0 === addKey1 && String(addKey0).indexOf("omarchy-widget-") === 0)
      } else {
        failures.push("add write log was: " + String(log || "").replace(/\n/g, " | "))
      }
      phase = 4
      var failStarted = store.submitWrite(store.taskRemoveArgv({ id: "t_inbox" }), "Removing…")
      ok("failing write accepted", failStarted === true)
    }
  }

  Timer {
    interval: 12000
    running: true
    repeat: false
    onTriggered: {
      if (root.finished) return
      root.ok("timed out waiting for CLI stub", false)
      root.finish()
    }
  }
}

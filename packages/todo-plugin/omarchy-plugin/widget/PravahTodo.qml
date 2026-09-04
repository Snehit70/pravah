import QtQuick
import QtQuick.Controls
import QtQuick.Layouts
import Quickshell.Io
import qs.Commons
import qs.Ui

// Pravah for Omarchy — a full front-end for the Pravah CLI living in the
// bar. Tabs mirror the CLI's views (Today, Inbox, Upcoming, Goals,
// History); every mutation goes through the CLI's dry-run → apply
// pipeline (see PravahData) and offers Undo from the operation receipt.
BarWidget {
  id: root
  moduleName: "raja.pravah-todo"

  // ----------------------------------------------------------- settings ---
  readonly property int pollSec: Math.max(10, Number(setting("pollIntervalSec", 30)) || 30)
  readonly property bool showCompleted: String(setting("showCompleted", "On")).toLowerCase() !== "off"

  // -------------------------------------------------------------- state ---
  property bool panelOpen: false
  property string activeTab: "today"
  property string searchText: ""
  property var priorityFilter: []
  property string tagFilter: ""
  property string pendingTaskId: ""
  property bool overdueExpanded: false
  property var confirmAction: null
  property string lastOperationId: ""

  PravahData { id: store }

  // ---------------------------------------------------------------- ipc ---
  IpcHandler {
    target: "raja.pravah-todo"

    function open(): void {
      root.panelOpen = true
      store.refresh()
    }

    function close(): void { root.panelOpen = false }

    function toggle(): void {
      if (root.panelOpen) root.panelOpen = false
      else open()
    }

    function refresh(): string {
      store.refresh()
      return "ok"
    }
  }

  // ------------------------------------------------------------ palette ---
  readonly property color fg: root.bar ? root.bar.barForeground : Color.foreground
  readonly property color muted: Qt.rgba(fg.r, fg.g, fg.b, 0.58)
  readonly property color faint: Qt.rgba(fg.r, fg.g, fg.b, 0.09)
  readonly property color accent: root.bar ? root.bar.urgent : Color.urgent
  readonly property color urgent: Color.urgent

  // -------------------------------------------------------------- tabs ----
  readonly property var tabList: [
    { id: "today", label: "Today", count: store.todayTasks.length },
    { id: "inbox", label: "Inbox", count: store.inboxTasks.length },
    { id: "upcoming", label: "Upcoming", count: store.upcomingTasks.length },
    { id: "goals", label: "Goals", count: store.goals.length }
  ]

  readonly property bool isTaskTab: activeTab === "today" || activeTab === "inbox" || activeTab === "upcoming"

  // ------------------------------------------------------------- filters ---
  function filtered(list) {
    var out = []
    for (var i = 0; i < list.length; i++)
      if (store.passesFilters(list[i], searchText, priorityFilter, tagFilter)) out.push(list[i])
    return out
  }

  readonly property var fOverdue: filtered(store.overdueTasks)
  readonly property var fToday: filtered(store.todayTasks)
  readonly property var fInbox: filtered(store.inboxTasks)
  readonly property var fUpcoming: filtered(store.upcomingTasks)
  readonly property var fCompletedToday: filtered(store.completedToday)

  readonly property var visibleUpcomingGroups: {
    var out = []
    for (var i = 0; i < store.upcomingGroups.length; i++) {
      var group = store.upcomingGroups[i]
      var tasks = []
      for (var k = 0; k < group.tasks.length; k++)
        if (store.passesFilters(group.tasks[k], searchText, priorityFilter, tagFilter)) tasks.push(group.tasks[k])
      if (tasks.length > 0) out.push({ date: group.date, label: group.label, tasks: tasks })
    }
    return out
  }

  readonly property var tagOptions: {
    var out = [{ value: "", label: "Tag…" }]
    for (var i = 0; i < store.allTags.length; i++) out.push({ value: store.allTags[i], label: "@" + store.allTags[i] })
    return out
  }

  // -------------------------------------------------------- interactions ---
  function toggleTask(task) {
    var reopening = task.status === "completed"
    pendingTaskId = task.id
    var argv = reopening ? store.taskReopenArgv(task) : store.taskCompleteArgv(task)
    if (!store.submitWrite(argv, reopening ? "Reopening task…" : "Completing task…")) pendingTaskId = ""
  }

  function unscheduleTask(task) {
    store.submitWrite(store.taskUnscheduleArgv(task), "Moving task to Inbox…")
  }

  function openSchedulePicker(task) {
    schedulePicker.targetTask = task
    schedulePicker.openFor(task.deadline)
  }

  function openEditor(task) {
    editor.openFor(task, task ? "" : (activeTab === "today" ? store.today : ""))
  }

  function confirmRemoveTask(task) {
    askConfirm("Remove “" + task.title + "”? It stays recoverable via Undo.", function() {
      store.submitWrite(store.taskRemoveArgv(task), "Removing task…")
    })
  }

  function confirmRemoveGoal(goal) {
    askConfirm("Remove goal “" + goal.text + "”? Its tasks stay, the goal goes away.", function() {
      store.submitWrite(store.goalRemoveArgv(goal), "Removing goal…")
    })
  }

  function askConfirm(message, onConfirm) {
    confirmAction = { onConfirm: onConfirm }
    confirmOverlay.message = message
    confirmOverlay.selectedIndex = 0
    confirmOverlay.opened = true
  }

  function undoLast() {
    if (lastOperationId === "") return
    store.submitWrite(store.undoArgv({ operationId: lastOperationId }), "Undoing…")
    lastOperationId = ""
  }

  function messageFor(envelope) {
    var action = envelope && envelope.data && envelope.data.action ? String(envelope.data.action) : ""
    if (action === "tasks.add") return "Task added"
    if (action === "tasks.edit") return "Task updated"
    if (action === "tasks.complete") return "Task completed"
    if (action === "tasks.reopen") return "Task reopened"
    if (action === "tasks.schedule") return "Task rescheduled"
    if (action === "tasks.unschedule") return "Task moved to Inbox"
    if (action === "tasks.remove") return "Task removed"
    if (action === "goals.add") return "Goal created"
    if (action === "goals.edit") return "Goal updated"
    if (action === "goals.remove") return "Goal removed"
    if (action === "operations.undo") return "Change undone"
    return "Done"
  }

  function quickAdd() {
    var parsed = store.parseQuickAdd(quickInput.text)
    if (!parsed || parsed.title.trim() === "") return
    var fields = {
      title: parsed.title,
      description: "",
      deadline: activeTab === "today" ? store.today : "",
      time: parsed.time,
      priority: parsed.priority,
      tags: parsed.tags,
      estimatedMinutes: parsed.estimatedMinutes
    }
    if (!store.submitWrite(store.taskAddArgv(fields, ""), "Adding task…")) return
    quickInput.text = ""
  }

  function focusQuick() { quickInput.forceActiveFocus() }

  readonly property string subtitleText: {
    if (store.lastError !== "") return store.lastError
    if (store.healthChecked && !store.healthy) return store.healthMessage
    if (store.healthChecked && store.authenticated && !store.canWrite) return "Read-only credential — actions disabled"
    if (!store.initialized) return store.syncing ? "Syncing…" : "Loading today…"
    if (store.syncing) return "Syncing…"
    var parts = []
    if (store.overdueTasks.length > 0) parts.push(store.overdueTasks.length + " overdue")
    parts.push(store.todayTasks.length + (store.todayTasks.length === 1 ? " task today" : " tasks today"))
    if (store.inboxTasks.length > 0) parts.push(store.inboxTasks.length + " in inbox")
    return parts.join(" · ")
  }

  function tooltipText() {
    if (!store.healthChecked) return "Checking Pravah…"
    if (!store.healthy || !store.authenticated) return store.healthMessage !== "" ? store.healthMessage : "Pravah is unavailable"
    if (store.lastError !== "") return "Pravah is keeping the last good list\n" + store.lastError
    if (!store.initialized) return "Loading today's tasks"
    var n = store.todayTasks.length
    var text = n === 0 ? "Nothing left today" : n + (n === 1 ? " task left today" : " tasks left today")
    if (store.overdueTasks.length > 0) text += "\n" + store.overdueTasks.length + " overdue"
    return text
  }

  // ------------------------------------------------------------ bar icon ---
  implicitWidth: barButton.implicitWidth
  implicitHeight: barButton.implicitHeight

  BarIconButton {
    id: barButton

    anchors.centerIn: parent
    bar: root.bar
    tooltipText: root.tooltipText()
    active: panelOpen
    iconComponent: Component {
      Item {
        readonly property color ink: barButton.active ? barButton.activeColor : barButton.foreground
        Column {
          anchors.centerIn: parent
          spacing: 3
          Repeater {
            model: 3
            Row {
              spacing: 3
              Rectangle { width: 4; height: 4; radius: 1; color: "transparent"; border.width: 1; border.color: ink }
              Rectangle { width: 10; height: 2; radius: 1; color: ink; anchors.verticalCenter: parent.verticalCenter }
            }
          }
        }
        Rectangle {
          visible: store.initialized && store.todayTasks.length > 0
          width: 11; height: 11; radius: 6
          anchors.right: parent.right; anchors.top: parent.top
          color: store.overdueTasks.length > 0 ? root.urgent : root.accent
          Text { anchors.centerIn: parent; text: store.todayTasks.length > 9 ? "9+" : String(store.todayTasks.length); color: Color.background; font.pixelSize: 7; font.bold: true }
        }
      }
    }
    onPressed: function(button) {
      if (button === Qt.RightButton) { store.refresh(); return }
      panelOpen = !panelOpen
      if (panelOpen) {
        store.refresh()
      }
    }
  }

  // ------------------------------------------------------------- panel ----
  KeyboardPanel {
    id: popup

    anchorItem: barButton
    bar: root.bar
    owner: root
    open: root.panelOpen
    focusTarget: quickInput
    contentWidth: fittedContentWidth(470)
    contentHeight: fittedContentHeight(contentCol.implicitHeight + Style.space(16), Style.space(640))
    function close() { root.panelOpen = false }

    Column {
      id: contentCol

      anchors.fill: parent
      anchors.margins: Style.space(8)
      spacing: Style.space(8)

      // --- header
      RowLayout {
        id: headerRow

        width: parent.width
        spacing: Style.space(7)

        Rectangle {
          id: healthDot

          Layout.alignment: Qt.AlignVCenter
          width: Style.space(8)
          height: Style.space(8)
          radius: Style.space(4)
          color: !store.healthChecked ? root.muted
            : (!store.healthy || !store.authenticated) ? root.urgent
            : (store.canWrite ? root.accent : root.muted)

          MouseArea {
            id: dotHover

            anchors.fill: parent
            anchors.margins: -Style.space(6)
            hoverEnabled: true
            acceptedButtons: Qt.NoButton
          }

          ToolTip {
            id: dotTooltip

            visible: dotHover.containsMouse
            text: !store.healthChecked ? "Checking Pravah…"
              : (!store.healthy || !store.authenticated) ? (store.healthMessage !== "" ? store.healthMessage : "Pravah is unavailable")
              : (store.canWrite ? "Pravah is healthy" : "Pravah is reachable, credential is read-only")
            delay: 300
            padding: 0
            background: BorderSurface { color: Color.tooltip.background; borderSpec: Border.flat(Color.tooltip.border, Style.normalBorderWidth); radius: 0 }
            contentItem: Text {
              text: dotTooltip.text
              color: Color.tooltip.text
              font.family: Style.font.family
              font.pixelSize: Style.font.bodySmall
              leftPadding: Style.space(8)
              rightPadding: Style.space(8)
              topPadding: Style.space(5)
              bottomPadding: Style.space(5)
            }
          }
        }

        Column {
          Layout.fillWidth: true
          spacing: 1

          Text { text: "Pravah"; color: root.fg; font.family: Style.font.family; font.pixelSize: Style.font.title; font.bold: true }
          Text {
            width: parent.width
            text: root.subtitleText
            color: root.muted
            elide: Text.ElideRight
            font.family: Style.font.family
            font.pixelSize: Style.font.caption
          }
        }

        Button {
          iconText: "󰑐"
          iconSpinning: store.syncing
          tooltipText: "Refresh"
          focusable: false
          enabled: !store.syncing
          onClicked: store.refresh()
        }

        Button {
          iconText: "󰅚"
          tooltipText: "Close"
          focusable: false
          onClicked: root.panelOpen = false
        }
      }

      Rectangle { width: parent.width; height: 1; color: root.faint }

      // --- tabs
      PravahTabs {
        id: tabsRow

        width: parent.width
        activeTab: root.activeTab
        tabs: root.tabList
        onTabSelected: function(id) { root.activeTab = id }
      }

      // --- toolbar (task tabs)
      RowLayout {
        id: toolbarRow

        width: parent.width
        spacing: Style.space(5)
        visible: root.isTaskTab

        TextField {
          id: searchInput

          Layout.fillWidth: true
          placeholderText: "Search tasks…"
          selectByMouse: true
          font.pixelSize: Style.font.bodySmall
          verticalPadding: Style.space(4)
          onTextChanged: root.searchText = text
          Keys.onEscapePressed: { text = ""; root.focusQuick() }
        }

        Repeater {
          model: ["p1", "p2", "p3"]

          delegate: Button {
            required property string modelData

            text: modelData.toUpperCase()
            fontSize: Style.font.caption
            focusable: false
            selected: root.priorityFilter.indexOf(modelData) !== -1
            onClicked: {
              var next = []
              for (var i = 0; i < root.priorityFilter.length; i++) next.push(root.priorityFilter[i])
              var at = next.indexOf(modelData)
              if (at === -1) next.push(modelData)
              else next.splice(at, 1)
              root.priorityFilter = next
            }
          }
        }

        Dropdown {
          id: tagDropdown

          Layout.preferredWidth: Style.space(108)
          showLabel: false
          options: root.tagOptions
          value: root.tagFilter
          onChanged: function(value) { root.tagFilter = value }
        }
      }

      // --- write error banner
      Text {
        id: errorBanner

        visible: store.lastWriteError !== ""
        width: parent.width
        text: store.lastWriteError
        color: root.urgent
        wrapMode: Text.Wrap
        font.family: Style.font.family
        font.pixelSize: Style.font.caption
      }

      // --- tab content
      ScrollView {
        id: scrollViewport

        width: parent.width
        height: Math.min(tabLoader.item ? tabLoader.item.implicitHeight : 0, Style.space(380))
        contentWidth: availableWidth
        contentHeight: tabLoader.item ? tabLoader.item.implicitHeight : 0
        clip: true

        Loader {
          id: tabLoader

          width: scrollViewport.availableWidth
          sourceComponent: root.activeTab === "today" ? todayComp
            : root.activeTab === "inbox" ? inboxComp
            : root.activeTab === "upcoming" ? upcomingComp
            : goalsComp
        }
      }

      // --- footer
      RowLayout {
        id: footerRow

        width: parent.width
        spacing: Style.space(7)
        visible: root.isTaskTab

        TextField {
          id: quickInput

          Layout.fillWidth: true
          placeholderText: root.activeTab === "today"
            ? "Add a task for today — try: Draft spec !p1 @work ~30m"
            : (root.activeTab === "inbox" ? "Capture to Inbox…" : "Add a task…")
          enabled: store.canWrite && !store.writeBusy
          selectByMouse: true
          onAccepted: root.quickAdd()
          Keys.onEscapePressed: root.panelOpen = false
        }

        Button {
          text: store.writeLabel === "Adding task…" ? "Adding…" : "Add"
          enabled: store.canWrite && !store.writeBusy && quickInput.text.trim() !== ""
          focusable: false
          onClicked: root.quickAdd()
        }

        Button {
          iconText: "󰇙"
          tooltipText: "Open the full form (description, tags, estimate…)"
          enabled: store.canWrite && !store.writeBusy
          focusable: false
          onClicked: root.openEditor(null)
        }
      }

      RowLayout {
        id: goalFooter

        width: parent.width
        spacing: Style.space(7)
        visible: root.activeTab === "goals"

        Text {
          Layout.fillWidth: true
          text: store.goals.length === 0 ? "No goals yet — give your tasks a why." : "Progress counts every linked task."
          color: root.muted
          elide: Text.ElideRight
          font.family: Style.font.family
          font.pixelSize: Style.font.caption
        }

        Button {
          text: "New goal"
          enabled: store.canWrite && !store.writeBusy
          focusable: false
          onClicked: goalEditor.openFor(null)
        }
      }

    }

    // ------------------------------------------------------- overlays ---
    PravahEditor {
      id: editor

      anchors.fill: parent
      z: 30
      fg: root.fg
      accent: root.accent
      urgent: root.urgent

      onSaveRequested: function(fields) {
        close()
        if (editingTask) {
          var argv = store.taskEditArgv(editingTask, fields)
          if (argv.length > 5) store.submitWrite(argv, "Saving task…")
        } else {
          store.submitWrite(store.taskAddArgv(fields, ""), "Adding task…")
        }
      }
      onCanceled: close()
    }

    PravahGoalEditor {
      id: goalEditor

      anchors.fill: parent
      z: 30
      fg: root.fg
      accent: root.accent

      onSaveRequested: function(fields) {
        close()
        if (editingGoal) store.submitWrite(store.goalEditArgv(editingGoal, fields), "Saving goal…")
        else store.submitWrite(store.goalAddArgv(fields), "Creating goal…")
      }
      onCanceled: close()
    }

    PravahDatePicker {
      id: schedulePicker

      anchors.fill: parent
      z: 35
      fg: root.fg
      accent: root.accent
      today: store.today
      property var targetTask: null

      onPicked: function(date) {
        if (targetTask && date !== "") store.submitWrite(store.taskScheduleArgv(targetTask, date), "Rescheduling task…")
        targetTask = null
        close()
      }
      onCanceled: { targetTask = null; close() }
    }

    ConfirmDialog {
      id: confirmOverlay

      anchors.fill: parent
      z: 40
      background: Color.popups.background
      foreground: root.fg
      scrim: Qt.rgba(Color.background.r, Color.background.g, Color.background.b, 0.75)
      selectedText: root.fg
      cancelText: "Keep"
      confirmText: "Remove"
      focus: opened
      Keys.onPressed: function(event) { if (handleKey(event)) event.accepted = true }
      onConfirmed: {
        opened = false
        var action = root.confirmAction
        root.confirmAction = null
        if (action && action.onConfirm) action.onConfirm()
      }
      onCanceled: { opened = false; root.confirmAction = null }
    }

    PravahToast {
      id: toast

      z: 50
      anchors.left: parent.left
      anchors.right: parent.right
      anchors.bottom: parent.bottom
      anchors.margins: Style.space(6)
      fg: root.fg
      accent: root.accent
      onUndoRequested: root.undoLast()
    }
  }

  // --------------------------------------------------- shared delegates ---
  Component {
    id: taskDelegate

    PravahTaskRow {
      required property var modelData

      task: modelData
      today: store.today
      pending: root.pendingTaskId === modelData.id && store.writeBusy
      canWrite: store.canWrite
      fg: root.fg
      accent: root.accent
      urgent: root.urgent
      width: parent.width
      onToggled: root.toggleTask(modelData)
      onEditRequested: root.openEditor(modelData)
      onScheduleRequested: root.openSchedulePicker(modelData)
      onUnscheduleRequested: root.unscheduleTask(modelData)
      onRemoveRequested: root.confirmRemoveTask(modelData)
    }
  }

  Component {
    id: sectionLabel

    Text {
      required property string modelData

      text: modelData
      color: root.muted
      font.family: Style.font.family
      font.pixelSize: Style.font.caption
      font.bold: true
    }
  }

  Component {
    id: todayComp

    Column {
      width: tabLoader.width
      spacing: Style.space(4)

      // Overdue stays collapsed until expanded — today's list stays calm.
      Rectangle {
        visible: root.fOverdue.length > 0
        width: parent.width
        height: Style.space(24)
        radius: Style.space(6)
        color: overdueHeaderMouse.containsMouse ? root.faint : "transparent"

        Behavior on color { ColorAnimation { duration: 100 } }

        Row {
          anchors.fill: parent
          anchors.leftMargin: Style.space(5)
          spacing: Style.space(5)

          Text {
            anchors.verticalCenter: parent.verticalCenter
            text: root.overdueExpanded ? "󰅀" : "󰅂"
            color: root.urgent
            font.family: Style.font.family
            font.pixelSize: Style.font.caption
          }

          Text {
            anchors.verticalCenter: parent.verticalCenter
            text: "Overdue · " + root.fOverdue.length
            color: root.urgent
            font.family: Style.font.family
            font.pixelSize: Style.font.caption
            font.bold: true
          }

          Text {
            anchors.verticalCenter: parent.verticalCenter
            text: root.overdueExpanded ? "" : "tap to expand"
            color: root.muted
            font.family: Style.font.family
            font.pixelSize: Style.font.caption
          }
        }

        MouseArea {
          id: overdueHeaderMouse

          anchors.fill: parent
          hoverEnabled: true
          cursorShape: Qt.PointingHandCursor
          onClicked: root.overdueExpanded = !root.overdueExpanded
        }
      }

      Repeater { model: root.overdueExpanded ? root.fOverdue : []; delegate: taskDelegate }

      Text {
        visible: root.overdueExpanded && root.fOverdue.length > 0 && (root.fToday.length > 0 || root.fCompletedToday.length > 0)
        text: "Today · " + root.fToday.length
        color: root.muted
        font.family: Style.font.family
        font.pixelSize: Style.font.caption
        font.bold: true
      }

      Repeater { model: root.fToday; delegate: taskDelegate }

      Text {
        visible: root.showCompleted && root.fCompletedToday.length > 0 && (root.fToday.length > 0 || root.fOverdue.length > 0)
        text: "Completed · " + root.fCompletedToday.length
        color: root.muted
        font.family: Style.font.family
        font.pixelSize: Style.font.caption
        font.bold: true
      }

      Repeater { model: root.showCompleted ? root.fCompletedToday : []; delegate: taskDelegate }

      Item {
        visible: root.fToday.length === 0 && root.fCompletedToday.length === 0
        width: tabLoader.width
        height: Style.space(92)

        Column {
          anchors.centerIn: parent
          spacing: Style.space(7)

          Text { anchors.horizontalCenter: parent.horizontalCenter; text: "✓"; color: root.muted; font.pixelSize: 25 }
          Text { anchors.horizontalCenter: parent.horizontalCenter; text: root.fOverdue.length > 0 ? "Nothing scheduled for right now" : "Nothing left for today"; color: root.fg; font.family: Style.font.family; font.pixelSize: Style.font.bodySmall }
          Text { anchors.horizontalCenter: parent.horizontalCenter; text: root.fOverdue.length > 0 ? "Expand Overdue above to work through delayed tasks." : "Capture something below, or pull from the Inbox tab."; color: root.muted; font.family: Style.font.family; font.pixelSize: Style.font.caption }
        }
      }
    }
  }

  Component {
    id: inboxComp

    Column {
      width: tabLoader.width
      spacing: Style.space(4)

      Repeater { model: root.fInbox; delegate: taskDelegate }

      Item {
        visible: root.fInbox.length === 0
        width: tabLoader.width
        height: Style.space(92)

        Column {
          anchors.centerIn: parent
          spacing: Style.space(7)

          Text { anchors.horizontalCenter: parent.horizontalCenter; text: "◍"; color: root.muted; font.pixelSize: 22 }
          Text { anchors.horizontalCenter: parent.horizontalCenter; text: "Inbox zero"; color: root.fg; font.family: Style.font.family; font.pixelSize: Style.font.bodySmall }
          Text { anchors.horizontalCenter: parent.horizontalCenter; text: "Capture freely below — triage later."; color: root.muted; font.family: Style.font.family; font.pixelSize: Style.font.caption }
        }
      }
    }
  }

  Component {
    id: upcomingComp

    Column {
      width: tabLoader.width
      spacing: Style.space(4)

      Repeater {
        model: root.visibleUpcomingGroups

        delegate: Column {
          required property var modelData

          width: parent.width
          spacing: Style.space(4)

          Text {
            text: modelData.label + " · " + modelData.tasks.length
            color: root.muted
            font.family: Style.font.family
            font.pixelSize: Style.font.caption
            font.bold: true
          }

          Repeater { model: modelData.tasks; delegate: taskDelegate }
        }
      }

      Item {
        visible: root.visibleUpcomingGroups.length === 0
        width: tabLoader.width
        height: Style.space(92)

        Column {
          anchors.centerIn: parent
          spacing: Style.space(7)

          Text { anchors.horizontalCenter: parent.horizontalCenter; text: "→"; color: root.muted; font.pixelSize: 22 }
          Text { anchors.horizontalCenter: parent.horizontalCenter; text: "Nothing scheduled in the next 14 days"; color: root.fg; font.family: Style.font.family; font.pixelSize: Style.font.bodySmall }
          Text { anchors.horizontalCenter: parent.horizontalCenter; text: "Use a row's ⋯ menu → Change date to plan ahead."; color: root.muted; font.family: Style.font.family; font.pixelSize: Style.font.caption }
        }
      }
    }
  }

  Component {
    id: goalsComp

    Column {
      width: tabLoader.width
      spacing: Style.space(4)

      Repeater {
        model: store.goals

        delegate: PravahGoalCard {
          required property var modelData

          goal: modelData
          fg: root.fg
          accent: root.accent
          urgent: root.urgent
          width: parent.width
          onEditRequested: goalEditor.openFor(modelData)
          onRemoveRequested: root.confirmRemoveGoal(modelData)
        }
      }

      Item {
        visible: store.goals.length === 0
        width: tabLoader.width
        height: Style.space(92)

        Column {
          anchors.centerIn: parent
          spacing: Style.space(7)

          Text { anchors.horizontalCenter: parent.horizontalCenter; text: "◇"; color: root.muted; font.pixelSize: 22 }
          Text { anchors.horizontalCenter: parent.horizontalCenter; text: "No goals yet"; color: root.fg; font.family: Style.font.family; font.pixelSize: Style.font.bodySmall }
        }
      }
    }
  }

  // ------------------------------------------------------------- wiring ---
  Connections {
    target: store

    function onWriteSucceeded(envelope) {
      pendingTaskId = ""
      var op = envelope && envelope.data ? envelope.data.operation : null
      lastOperationId = op && op.undoAvailable === true ? String(op.operationId) : ""
      toast.show(messageFor(envelope), lastOperationId !== "")
    }

    function onWriteFailed(message) {
      pendingTaskId = ""
      lastOperationId = ""
      toast.dismiss()
    }
  }

  Timer {
    interval: root.pollSec * 1000
    running: true
    repeat: true
    onTriggered: store.refresh()
  }

  Component.onCompleted: {
    var tab = String(setting("defaultTab", "today"))
    var valid = ["today", "inbox", "upcoming", "goals"]
    activeTab = valid.indexOf(tab) !== -1 ? tab : "today"
  }
}

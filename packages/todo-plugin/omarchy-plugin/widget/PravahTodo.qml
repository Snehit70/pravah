import QtQuick
import QtQuick.Controls
import QtQuick.Layouts
import Quickshell.Io
import qs.Commons
import qs.Ui

BarWidget {
  id: root
  moduleName: "raja.pravah-todo"

  readonly property int pollSec: Math.max(10, Number(setting("pollIntervalSec", 30)) || 30)
  readonly property string cli: "pravah"
  property bool panelOpen: false
  property bool initialized: false
  property bool refreshing: false
  property string today: Qt.formatDate(new Date(), "yyyy-MM-dd")
  property var tasks: []
  property string lastError: ""
  property string action: ""
  property string actionTarget: ""
  property string actionTitle: ""
  property string actionStage: ""

  readonly property int count: tasks.length
  readonly property bool busy: action !== ""
  readonly property color fg: root.bar ? root.bar.barForeground : Color.foreground
  readonly property color muted: Qt.rgba(fg.r, fg.g, fg.b, 0.58)
  readonly property color faint: Qt.rgba(fg.r, fg.g, fg.b, 0.09)
  readonly property color accent: root.bar ? root.bar.urgent : Color.urgent

  function tooltipText() {
    if (lastError !== "") return "Pravah is keeping the last good list\n" + lastError
    if (!initialized) return "Loading today's tasks"
    if (count === 0) return "Nothing left today"
    return count + (count === 1 ? " task left today" : " tasks left today")
  }

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
          visible: root.initialized && root.count > 0
          width: 11; height: 11; radius: 6
          anchors.right: parent.right; anchors.top: parent.top
          color: root.accent
          Text { anchors.centerIn: parent; text: root.count > 9 ? "9+" : String(root.count); color: Color.background; font.pixelSize: 7; font.bold: true }
        }
      }
    }
    onPressed: function(button) {
      if (button === Qt.RightButton) root.refresh()
      else root.panelOpen = !root.panelOpen
    }
  }

  KeyboardPanel {
    id: popup
    anchorItem: barButton
    bar: root.bar
    owner: root
    open: root.panelOpen
    focusTarget: newTask
    contentWidth: fittedContentWidth(390)
    contentHeight: fittedContentHeight(content.implicitHeight + Style.space(8), Style.space(560))
    function close() { root.panelOpen = false }

    Column {
      id: content
      anchors.fill: parent
      anchors.margins: Style.space(8)
      spacing: Style.space(10)

      RowLayout {
        width: parent.width
        Column {
          Layout.fillWidth: true
          spacing: 2
          Text { text: "Today"; color: root.fg; font.family: Style.font.family; font.pixelSize: Style.font.title; font.bold: true }
          Text { text: root.count === 0 ? "You're clear" : root.count + (root.count === 1 ? " task left" : " tasks left"); color: root.muted; font.family: Style.font.family; font.pixelSize: Style.font.caption }
        }
        ToolButton { text: root.refreshing ? "·" : "↻"; enabled: !root.refreshing; onClicked: root.refresh(); ToolTip.visible: hovered; ToolTip.text: "Refresh" }
        ToolButton { text: "×"; onClicked: root.panelOpen = false; ToolTip.visible: hovered; ToolTip.text: "Close" }
      }

      Rectangle { width: parent.width; height: 1; color: root.faint }

      RowLayout {
        width: parent.width
        spacing: Style.space(7)
        TextField {
          id: newTask
          Layout.fillWidth: true
          placeholderText: "Add a task for today"
          enabled: !root.busy
          selectByMouse: true
          onAccepted: root.addTask(text)
        }
        Button { text: root.action === "add" ? "Adding…" : "Add"; enabled: !root.busy && newTask.text.trim() !== ""; onClicked: root.addTask(newTask.text) }
      }

      Text {
        visible: root.lastError !== ""
        width: parent.width
        text: root.lastError
        color: root.accent
        wrapMode: Text.Wrap
        font.family: Style.font.family
        font.pixelSize: Style.font.caption
      }

      ScrollView {
        id: taskViewport
        width: parent.width
        height: !root.initialized ? 72 : (root.count === 0 ? 92 : Math.min(taskList.implicitHeight, Style.space(360)))
        contentWidth: availableWidth
        contentHeight: !root.initialized ? 72 : (root.count === 0 ? 92 : taskList.implicitHeight)
        clip: true

        Text {
          visible: !root.initialized
          anchors.centerIn: parent
          text: "Loading today…"
          color: root.muted
          font.family: Style.font.family
        }

        Column {
          visible: root.initialized && root.count === 0
          anchors.centerIn: parent
          spacing: 7
          Text { anchors.horizontalCenter: parent.horizontalCenter; text: "✓"; color: root.muted; font.pixelSize: 25 }
          Text { anchors.horizontalCenter: parent.horizontalCenter; text: "Nothing left for today"; color: root.fg; font.family: Style.font.family; font.pixelSize: Style.font.bodySmall }
        }

        Column {
          id: taskList
          visible: root.initialized && root.count > 0
          width: taskViewport.availableWidth
          spacing: Style.space(6)
          Repeater {
            model: root.tasks
            delegate: Rectangle {
              required property var modelData
              width: taskList.width
              height: taskRow.implicitHeight + Style.space(14)
              radius: Style.space(7)
              color: taskMouse.containsMouse ? Qt.rgba(root.fg.r, root.fg.g, root.fg.b, 0.12) : root.faint

              RowLayout {
                id: taskRow
                anchors.fill: parent
                anchors.margins: Style.space(7)
                spacing: Style.space(9)
                Rectangle {
                  width: 20; height: 20; radius: 6
                  color: "transparent"
                  border.width: 1
                  border.color: root.actionTarget === modelData.id ? root.accent : root.muted
                  Text { anchors.centerIn: parent; text: root.actionTarget === modelData.id ? "·" : ""; color: root.accent; font.bold: true }
                }
                Column {
                  Layout.fillWidth: true
                  spacing: 3
                  Text { width: parent.width; text: modelData.title; color: root.fg; wrapMode: Text.Wrap; font.family: Style.font.family; font.pixelSize: Style.font.bodySmall }
                  Text { visible: modelData.time !== ""; text: modelData.time; color: root.muted; font.family: Style.font.family; font.pixelSize: Style.font.caption }
                }
              }
              MouseArea {
                id: taskMouse
                anchors.fill: parent
                hoverEnabled: true
                cursorShape: Qt.PointingHandCursor
                enabled: !root.busy
                onClicked: root.completeTask(modelData.id)
              }
            }
          }
        }
      }
    }
  }

  Process {
    id: pollProc
    command: [root.cli, "today", "--json"]
    stdout: StdioCollector { id: pollStdout; waitForEnd: true }
    stderr: StdioCollector { id: pollStderr; waitForEnd: true }
    onExited: function(exitCode) { root.handlePoll(exitCode, pollStdout.text, pollStderr.text) }
  }

  Process {
    id: actionProc
    stdout: StdioCollector { id: actionStdout; waitForEnd: true }
    stderr: StdioCollector { id: actionStderr; waitForEnd: true }
    onExited: function(exitCode) { root.handleAction(exitCode, actionStdout.text, actionStderr.text) }
  }

  function refresh() {
    if (pollProc.running) return
    refreshing = true
    pollProc.running = true
  }

  function handlePoll(exitCode, stdout, stderr) {
    refreshing = false
    if (exitCode !== 0) {
      lastError = commandError(stdout, stderr, "Pravah could not load today")
      return
    }
    try {
      var env = JSON.parse(String(stdout || "").trim())
      if (!env.ok) { lastError = env.error && env.error.message ? env.error.message : "Pravah could not load today"; return }
      var data = env.data || {}
      today = String(data.today || today)
      var list = Array.isArray(data.tasks) ? data.tasks : []
      tasks = list.map(function(t) { return { id: String(t.id || ""), title: String(t.title || "Untitled"), time: String(t.time || "") } })
      initialized = true
      lastError = ""
    } catch (error) { lastError = "Pravah returned an unreadable response" }
  }

  function addTask(title) {
    var clean = String(title || "").trim()
    if (busy || clean === "") return
    action = "add"; actionTitle = clean; actionTarget = ""; actionStage = "preview"; lastError = ""
    actionProc.command = [cli, "tasks", "add", "--deadline", today, "--dry-run", "--json", "--", clean]
    actionProc.running = true
  }

  function completeTask(id) {
    if (busy) return
    action = "complete"; actionTarget = String(id); actionTitle = ""; actionStage = "preview"; lastError = ""
    actionProc.command = [cli, "tasks", "complete", actionTarget, "--dry-run", "--json"]
    actionProc.running = true
  }

  function handleAction(exitCode, stdout, stderr) {
    if (action === "") return
    if (exitCode !== 0) { failAction(commandError(stdout, stderr, "Pravah could not update the task")); return }
    var env
    try { env = JSON.parse(String(stdout || "").trim()) }
    catch (error) { failAction("Pravah returned an unreadable response"); return }
    if (!env.ok) { failAction(env.error && env.error.message ? env.error.message : "Pravah could not update the task"); return }
    if (actionStage === "preview") {
      actionStage = "apply"
      actionProc.command = action === "add"
        ? [cli, "tasks", "add", "--deadline", today, "--json", "--", actionTitle]
        : [cli, "tasks", "complete", actionTarget, "--json"]
      actionProc.running = true
      return
    }
    if (action === "add") newTask.clear()
    action = ""; actionTarget = ""; actionTitle = ""; actionStage = ""
    refresh()
  }

  function commandError(stdout, stderr, fallback) {
    try {
      var env = JSON.parse(String(stdout || "").trim())
      if (env.error && env.error.message) return String(env.error.message).slice(0, 240)
    } catch (error) {}
    return String(stderr || stdout || fallback).trim().slice(0, 240) || fallback
  }

  function failAction(message) {
    lastError = String(message || "Pravah command failed").slice(0, 240)
    action = ""; actionTarget = ""; actionTitle = ""; actionStage = ""
  }

  Component.onCompleted: refresh()
  Timer { interval: root.pollSec * 1000; running: true; repeat: true; onTriggered: root.refresh() }
}

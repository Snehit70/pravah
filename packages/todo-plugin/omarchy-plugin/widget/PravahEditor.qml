import QtQuick
import QtQuick.Controls
import QtQuick.Layouts
import qs.Commons
import qs.Ui

// Overlay form that maps to the full surface of `tasks add` / `tasks edit`:
// title, description, deadline (date picker), time, priority, tags, and
// estimate. Emits saveRequested(fields) with
// { title, description, deadline, time, priority, tags, estimatedMinutes }.
Item {
  id: editor

  property var editingTask: null
  property string defaultDeadline: ""
  property color fg: Color.foreground
  property color accent: Color.accent
  property color urgent: Color.urgent

  signal saveRequested(var fields)
  signal canceled()

  readonly property color muted: Qt.rgba(fg.r, fg.g, fg.b, 0.55)
  property string selectedDate: ""
  property string selectedPriority: ""
  property int selectedEstimate: 0
  property string error: ""

  function openFor(task, fallbackDeadline) {
    editingTask = task || null
    defaultDeadline = fallbackDeadline || ""
    titleInput.text = task ? task.title : ""
    descInput.text = task ? (task.description || "") : ""
    selectedDate = task ? (task.deadline || "") : (fallbackDeadline || "")
    timeInput.text = task ? (task.time || "") : ""
    selectedPriority = task ? (task.priority || "") : ""
    selectedEstimate = task ? (task.estimatedMinutes || 0) : 0
    estimateField.value = selectedEstimate
    tagsInput.text = task && task.tags ? task.tags.join(", ") : ""
    error = ""
    dueButton.refreshLabel()
    visible = true
    titleInput.forceActiveFocus()
  }

  function close() { visible = false }

  function dueLabel() {
    if (selectedDate === "") return "No date — Inbox"
    if (selectedDate === Qt.formatDate(new Date(), "yyyy-MM-dd")) return "Scheduled today"
    return Qt.formatDate(new Date(selectedDate + "T12:00:00"), "ddd d MMM yyyy")
  }

  function normalizeTime(raw) {
    var m = String(raw || "").trim().match(/^([01]?\d|2[0-3]):([0-5]\d)$/)
    if (!m) return null
    return (m[1].length === 1 ? "0" + m[1] : m[1]) + ":" + m[2]
  }

  function save() {
    var title = titleInput.text.trim()
    if (title === "") { error = "Give the task a title."; return }
    var time = timeInput.text.trim()
    var timeNorm = ""
    if (time !== "") {
      timeNorm = normalizeTime(time)
      if (timeNorm === null) { error = "Time must use 24-hour HH:MM."; return }
    }
    var tags = []
    var rawTags = tagsInput.text.split(",")
    for (var i = 0; i < rawTags.length; i++) {
      var tag = rawTags[i].trim()
      if (tag !== "" && tags.indexOf(tag) === -1) tags.push(tag)
    }
    if (selectedDate === "" && timeNorm !== "") { error = "A time needs a date."; return }
    error = ""
    saveRequested({
      title: title,
      description: descInput.text.trim(),
      deadline: selectedDate,
      time: timeNorm,
      priority: selectedPriority,
      tags: tags,
      estimatedMinutes: selectedEstimate
    })
  }

  visible: false

  Rectangle {
    anchors.fill: parent
    color: Qt.rgba(Color.background.r, Color.background.g, Color.background.b, 0.85)

    MouseArea { anchors.fill: parent; onClicked: {} }

    Column {
      anchors.fill: parent
      anchors.margins: Style.space(2)
      spacing: Style.space(7)

      RowLayout {
        width: parent.width

        Text {
          Layout.fillWidth: true
          text: editor.editingTask ? "Edit task" : "New task"
          color: editor.fg
          font.family: Style.font.family
          font.pixelSize: Style.font.title
          font.bold: true
        }

        Button { iconText: "✕"; focusable: false; onClicked: editor.canceled() }
      }

      TextField {
        id: titleInput

        width: parent.width
        placeholderText: "Task title"
        selectByMouse: true
        onAccepted: editor.save()
        Keys.onEscapePressed: editor.canceled()
      }

      Column {
        width: parent.width
        spacing: Style.space(3)

        Text {
          text: "Notes"
          color: editor.muted
          font.family: Style.font.family
          font.pixelSize: Style.font.caption
        }

        Rectangle {
          width: parent.width
          height: Style.space(52)
          radius: Style.space(6)
          color: Qt.rgba(editor.fg.r, editor.fg.g, editor.fg.b, 0.05)
          border.width: descInput.activeFocus ? 1 : 0
          border.color: editor.accent

          TextArea {
            id: descInput

            anchors.fill: parent
            anchors.margins: Style.space(6)
            placeholderText: "Details, links, next actions…"
            wrapMode: TextArea.Wrap
            background: null
            Keys.onEscapePressed: editor.canceled()
          }
        }
      }

      RowLayout {
        width: parent.width
        spacing: Style.space(6)

        Button {
          id: dueButton

          Layout.fillWidth: true
          property string labelText: ""

          text: labelText
          leftAlign: true
          focusable: false
          onClicked: taskDatePicker.openFor(editor.selectedDate)

          Component.onCompleted: refreshLabel()
          function refreshLabel() { labelText = editor.dueLabel() }
        }

        Button {
          iconText: "✕"
          tooltipText: "Clear date"
          focusable: false
          enabled: editor.selectedDate !== ""
          onClicked: {
            editor.selectedDate = ""
            dueButton.refreshLabel()
          }
        }

        TextField {
          id: timeInput

          Layout.preferredWidth: Style.space(76)
          placeholderText: "HH:MM"
          selectByMouse: true
          horizontalAlignment: TextInput.AlignHCenter
          onAccepted: editor.save()
          Keys.onEscapePressed: editor.canceled()
        }
      }

      RowLayout {
        width: parent.width
        spacing: Style.space(6)

        Row {
          spacing: Style.space(4)

          Repeater {
            model: [{ key: "", label: "None" }, { key: "p1", label: "P1" }, { key: "p2", label: "P2" }, { key: "p3", label: "P3" }]

            delegate: Button {
              required property var modelData

              text: modelData.label
              fontSize: Style.font.caption
              focusable: false
              selected: editor.selectedPriority === modelData.key
              onClicked: editor.selectedPriority = modelData.key
            }
          }
        }

        Item { Layout.fillWidth: true; height: 1 }

        NumberField {
          id: estimateField

          label: ""
          from: 0
          to: 100000
          fieldWidth: Style.space(96)
          fontSize: Style.font.bodySmall
          onModified: function(value) { editor.selectedEstimate = value }
        }
      }

      TextField {
        id: tagsInput

        width: parent.width
        placeholderText: "Tags, comma separated (e.g. work, deep)"
        selectByMouse: true
        font.pixelSize: Style.font.bodySmall
        onAccepted: editor.save()
        Keys.onEscapePressed: editor.canceled()
      }

      Text {
        visible: editor.error !== ""
        text: editor.error
        color: editor.urgent
        wrapMode: Text.Wrap
        width: parent.width
        font.family: Style.font.family
        font.pixelSize: Style.font.caption
      }

      Row {
        anchors.right: parent.right
        spacing: Style.space(6)

        Button { text: "Cancel"; focusable: false; onClicked: editor.canceled() }

        Button {
          text: editor.editingTask ? "Save" : "Add task"
          focusable: false
          onClicked: editor.save()
        }
      }
    }

    PravahDatePicker {
      id: taskDatePicker

      anchors.fill: parent
      z: 10
      fg: editor.fg
      accent: editor.accent

      onPicked: function(date) {
        editor.selectedDate = date
        dueButton.refreshLabel()
        close()
      }
      onCanceled: close()
    }
  }
}

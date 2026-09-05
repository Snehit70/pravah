import QtQuick
import QtQuick.Controls
import QtQuick.Layouts
import qs.Commons
import qs.Ui

// Overlay form to add a goal or edit one's deadline / priority /
// description. Goal names are immutable through the CLI, so the title is
// read-only while editing. Emits saveRequested(fields) with
// { title, description, deadline, priority }.
Item {
  id: editor

  focus: visible
  Keys.onEscapePressed: editor.canceled()

  property var editingGoal: null
  property color fg: Color.foreground
  property color accent: Color.accent

  signal saveRequested(var fields)
  signal canceled()

  readonly property color muted: Qt.rgba(fg.r, fg.g, fg.b, 0.55)
  property string selectedDate: ""
  property string selectedPriority: ""
  property string error: ""

  function openFor(goal) {
    editingGoal = goal || null
    nameInput.text = goal ? goal.text : ""
    descInput.text = goal ? (goal.description || "") : ""
    selectedDate = goal ? (goal.deadline || "") : ""
    selectedPriority = goal ? (goal.priority || "") : ""
    error = ""
    dateLabel.refreshLabel()
    visible = true
    if (editingGoal === null) nameInput.forceActiveFocus()
    else forceActiveFocus()
  }

  function close() { visible = false }

  function dueLabel() {
    if (selectedDate === "") return "No due date"
    if (selectedDate === Qt.formatDate(new Date(), "yyyy-MM-dd")) return "Due today"
    return "Due " + Qt.formatDate(new Date(selectedDate + "T12:00:00"), "d MMM yyyy")
  }

  function save() {
    var title = nameInput.text.trim()
    if (editingGoal === null && title === "") {
      error = "Give the goal a name."
      return
    }
    var fields = {
      title: title,
      description: descInput.text.trim(),
      deadline: selectedDate,
      priority: selectedPriority
    }
    saveRequested(fields)
  }

  visible: false

  Rectangle {
    anchors.fill: parent
    color: Color.popups.background

    MouseArea { anchors.fill: parent; onClicked: {} }

    Column {
      anchors.fill: parent
      anchors.margins: Style.space(2)
      spacing: Style.space(7)

      RowLayout {
        width: parent.width

        Text {
          Layout.fillWidth: true
          text: editor.editingGoal ? "Edit goal" : "New goal"
          color: editor.fg
          font.family: Style.font.family
          font.pixelSize: Style.font.title
          font.bold: true
        }

        Button { iconText: "󰅚"; focusable: false; onClicked: editor.canceled() }
      }

      Column {
        width: parent.width
        spacing: Style.space(3)
        visible: editor.editingGoal === null

        Text {
          text: "Name"
          color: editor.muted
          font.family: Style.font.family
          font.pixelSize: Style.font.caption
        }

        TextField {
          id: nameInput

          width: parent.width
          placeholderText: "What do you want to achieve?"
          selectByMouse: true
          font.family: Style.font.family
          onAccepted: editor.save()
          Keys.onEscapePressed: editor.canceled()
        }
      }

      Text {
        width: parent.width
        visible: editor.editingGoal !== null
        text: editor.editingGoal ? editor.editingGoal.text : ""
        color: editor.fg
        wrapMode: Text.Wrap
        font.family: Style.font.family
        font.pixelSize: Style.font.body
        font.bold: true
      }

      RowLayout {
        width: parent.width
        spacing: Style.space(6)

        Button {
          id: dateLabel

          Layout.fillWidth: true
          property string labelText: ""

          text: labelText
          leftAlign: true
          focusable: false
          onClicked: goalDatePicker.openFor(editor.selectedDate)

          Component.onCompleted: refreshLabel()
          function refreshLabel() { labelText = editor.dueLabel() }
        }

        Button {
          iconText: "󰅚"
          tooltipText: "Clear due date"
          focusable: false
          enabled: editor.selectedDate !== ""
          onClicked: {
            editor.selectedDate = ""
            dateLabel.refreshLabel()
          }
        }
      }

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
            placeholderText: "Why does this goal matter?"
            wrapMode: TextArea.Wrap
            color: editor.fg
            placeholderTextColor: editor.muted
            font.family: Style.font.family
            font.pixelSize: Style.font.bodySmall
            selectionColor: Qt.rgba(editor.accent.r, editor.accent.g, editor.accent.b, 0.35)
            selectedTextColor: editor.fg
            background: null
            Keys.onEscapePressed: editor.canceled()
          }
        }
      }

      Text {
        visible: error !== ""
        text: error
        color: editor.accent
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
          text: editor.editingGoal ? "Save" : "Add goal"
          focusable: false
          onClicked: editor.save()
        }
      }
    }

    PravahDatePicker {
      id: goalDatePicker

      anchors.fill: parent
      z: 10
      fg: editor.fg
      accent: editor.accent

      onPicked: function(date) {
        editor.selectedDate = date
        dateLabel.refreshLabel()
        close()
      }
      onCanceled: close()
    }
  }
}

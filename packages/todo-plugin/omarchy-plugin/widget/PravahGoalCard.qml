import QtQuick
import QtQuick.Layouts
import qs.Commons
import qs.Ui

// One goal: name, priority/deadline meta, linked-task progress bar, and
// hover actions (edit, remove).
Rectangle {
  id: card

  property var goal: null
  property color fg: Color.foreground
  property color accent: Color.accent
  property color urgent: Color.urgent

  signal editRequested()
  signal removeRequested()

  readonly property color muted: Qt.rgba(fg.r, fg.g, fg.b, 0.55)
  readonly property color faint: Qt.rgba(fg.r, fg.g, fg.b, 0.08)
  readonly property int completed: goal ? goal.progress.completed : 0
  readonly property int active: goal ? goal.progress.active : 0
  readonly property int total: completed + active
  readonly property real ratio: total > 0 ? Math.min(1, completed / total) : 0
  readonly property color priorityColor: goal ? (goal.priority === "p1" ? urgent : (goal.priority === "p2" ? accent : muted)) : muted

  width: parent ? parent.width : 0
  implicitHeight: content.implicitHeight + Style.space(14)
  radius: Style.space(7)
  color: hoverArea.containsMouse ? Qt.rgba(fg.r, fg.g, fg.b, 0.10) : faint

  ColumnLayout {
    id: content

    anchors.fill: parent
    anchors.margins: Style.space(7)
    spacing: Style.space(4)

    RowLayout {
      Layout.fillWidth: true
      spacing: Style.space(6)

      Text {
        Layout.fillWidth: true
        text: card.goal ? card.goal.text : ""
        color: card.fg
        font.family: Style.font.family
        font.pixelSize: Style.font.bodySmall
        font.bold: true
        elide: Text.ElideRight
      }

      Button {
        visible: hoverArea.containsMouse
        iconText: "✎"
        tooltipText: "Edit goal"
        fontSize: Style.font.caption
        focusable: false
        onClicked: card.editRequested()
      }

      Button {
        visible: hoverArea.containsMouse
        iconText: "✕"
        tooltipText: "Remove goal"
        fontSize: Style.font.caption
        focusable: false
        onClicked: card.removeRequested()
      }
    }

    Row {
      spacing: Style.space(7)
      visible: card.goal && (card.goal.priority !== "" || card.goal.deadline !== "")

      Text {
        anchors.verticalCenter: parent.verticalCenter
        visible: card.goal && card.goal.priority !== ""
        text: card.goal ? card.goal.priority.toUpperCase() : ""
        color: card.priorityColor
        font.family: Style.font.family
        font.pixelSize: Style.font.caption
        font.bold: true
      }

      Text {
        anchors.verticalCenter: parent.verticalCenter
        visible: card.goal && card.goal.deadline !== ""
        text: card.goal ? "due " + Qt.formatDate(new Date(card.goal.deadline + "T12:00:00"), "d MMM yyyy") : ""
        color: card.muted
        font.family: Style.font.family
        font.pixelSize: Style.font.caption
      }
    }

    Item {
      Layout.fillWidth: true
      height: Style.space(4)
      visible: card.total > 0

      Rectangle {
        anchors.fill: parent
        radius: Style.space(2)
        color: Qt.rgba(card.fg.r, card.fg.g, card.fg.b, 0.12)
      }

      Rectangle {
        anchors.left: parent.left
        anchors.top: parent.top
        anchors.bottom: parent.bottom
        width: parent.width * card.ratio
        radius: Style.space(2)
        color: card.accent
        Behavior on width { NumberAnimation { duration: 160; easing.type: Easing.OutCubic } }
      }
    }

    Text {
      Layout.fillWidth: true
      visible: card.total > 0
      text: card.completed + "/" + card.total + " tasks done · " + card.active + " active"
      color: card.muted
      font.family: Style.font.family
      font.pixelSize: Style.font.caption
    }

    Text {
      Layout.fillWidth: true
      visible: card.total === 0
      text: "No linked tasks yet"
      color: card.muted
      font.family: Style.font.family
      font.pixelSize: Style.font.caption
    }
  }

  MouseArea {
    id: hoverArea

    anchors.fill: parent
    hoverEnabled: true
    acceptedButtons: Qt.NoButton
    z: -1
  }
}

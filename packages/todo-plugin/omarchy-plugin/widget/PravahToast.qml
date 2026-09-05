import QtQuick
import qs.Commons
import qs.Ui

// Inline write result. Occupies space only while a success or error is
// showing, between the list and the add field. Idle height is zero.
Item {
  id: root

  property color fg: Color.foreground
  property color accent: Color.accent
  property color urgent: Color.urgent
  property color success: "#7cb87c"

  property string message: ""
  property bool undoable: false
  property bool isError: false
  property bool active: false

  signal undoRequested()

  readonly property color tone: isError ? urgent : success

  visible: active
  height: active ? Style.space(28) : 0
  implicitHeight: height

  function show(text, withUndo) {
    isError = false
    message = String(text || "")
    undoable = withUndo === true
    active = message !== ""
    if (active) hideTimer.restart()
    else hideTimer.stop()
  }

  function showError(text) {
    isError = true
    message = String(text || "")
    undoable = false
    active = message !== ""
    if (active) hideTimer.restart()
    else hideTimer.stop()
  }

  function dismiss() {
    hideTimer.stop()
    active = false
    undoable = false
  }

  Timer {
    id: hideTimer
    interval: 4000
    onTriggered: root.dismiss()
  }

  Rectangle {
    anchors.fill: parent
    radius: Style.space(6)
    color: Qt.rgba(root.tone.r, root.tone.g, root.tone.b, 0.14)

    Row {
      id: messageRow

      anchors.left: parent.left
      anchors.leftMargin: Style.space(8)
      anchors.right: undoButton.left
      anchors.rightMargin: Style.space(6)
      anchors.verticalCenter: parent.verticalCenter
      spacing: Style.space(7)

      Text {
        anchors.verticalCenter: parent.verticalCenter
        text: root.isError ? "󰅙" : "󰄬"
        color: root.tone
        font.family: Style.font.family
        font.pixelSize: Style.font.body
      }

      Text {
        width: Math.max(0, messageRow.width - Style.space(22))
        anchors.verticalCenter: parent.verticalCenter
        text: root.message
        color: root.isError ? root.urgent : root.fg
        elide: Text.ElideRight
        font.family: Style.font.family
        font.pixelSize: Style.font.bodySmall
      }
    }

    Button {
      id: undoButton

      anchors.right: parent.right
      anchors.rightMargin: Style.space(2)
      anchors.verticalCenter: parent.verticalCenter
      iconText: "󰕌"
      tooltipText: "Undo"
      focusable: false
      visible: root.undoable
      enabled: root.undoable
      onClicked: {
        root.dismiss()
        root.undoRequested()
      }
    }
  }
}

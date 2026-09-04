import QtQuick
import qs.Commons
import qs.Ui

// Reserved status bar. Always takes a slot at the bottom of the panel
// so a result never covers the add field and never relayouts the list.
// Idle is an empty strip; success/error fade in via opacity and color.
Rectangle {
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
  readonly property color muted: Qt.rgba(fg.r, fg.g, fg.b, 0.45)

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

  height: Style.space(28)
  implicitHeight: height
  radius: Style.space(6)
  color: active ? Qt.rgba(tone.r, tone.g, tone.b, 0.14) : "transparent"

  Behavior on color { ColorAnimation { duration: 120 } }

  Rectangle {
    anchors.top: parent.top
    width: parent.width
    height: 1
    color: root.active ? Qt.rgba(root.tone.r, root.tone.g, root.tone.b, 0.40)
                       : Qt.rgba(root.fg.r, root.fg.g, root.fg.b, 0.10)
    Behavior on color { ColorAnimation { duration: 120 } }
  }

  Timer {
    id: hideTimer
    interval: 8000
    onTriggered: root.dismiss()
  }

  Row {
    id: messageRow

    anchors.left: parent.left
    anchors.leftMargin: Style.space(8)
    anchors.right: undoButton.left
    anchors.rightMargin: Style.space(6)
    anchors.verticalCenter: parent.verticalCenter
    spacing: Style.space(7)
    opacity: root.active ? 1 : 0

    Behavior on opacity { NumberAnimation { duration: 120 } }

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
    opacity: root.active && root.undoable ? 1 : 0
    enabled: root.active && root.undoable

    Behavior on opacity { NumberAnimation { duration: 120 } }

    onClicked: {
      root.dismiss()
      root.undoRequested()
    }
  }
}

import QtQuick
import qs.Commons
import qs.Ui

// Inline feedback bar pinned to the bottom of the panel. Shows the outcome
// of the last write and keeps an Undo affordance while the CLI's operation
// receipt says the change is still reversible.
Rectangle {
  id: root

  property color fg: Color.foreground
  property color accent: Color.accent
  property string message: ""
  property bool undoable: false

  signal undoRequested()

  readonly property color muted: Qt.rgba(fg.r, fg.g, fg.b, 0.55)

  function show(text, withUndo) {
    message = String(text || "")
    undoable = withUndo === true
    opacity = 1
    hideTimer.restart()
  }

  function dismiss() {
    hideTimer.stop()
    opacity = 0
  }

  visible: opacity > 0
  opacity: 0
  Behavior on opacity { NumberAnimation { duration: 120 } }

  height: Style.space(30)
  radius: Style.space(7)
  color: Qt.rgba(fg.r, fg.g, fg.b, 0.10)

  Timer {
    id: hideTimer
    interval: 8000
    onTriggered: root.dismiss()
  }

  Row {
    anchors.left: parent.left
    anchors.leftMargin: Style.space(10)
    anchors.verticalCenter: parent.verticalCenter
    spacing: Style.space(8)

    Text {
      anchors.verticalCenter: parent.verticalCenter
      text: "✓"
      color: root.accent
      font.family: Style.font.family
      font.pixelSize: Style.font.bodySmall
    }

    Text {
      anchors.verticalCenter: parent.verticalCenter
      width: Math.min(implicitWidth, root.width - Style.space(150))
      text: root.message
      color: root.fg
      elide: Text.ElideRight
      font.family: Style.font.family
      font.pixelSize: Style.font.bodySmall
    }
  }

  Button {
    anchors.right: parent.right
    anchors.rightMargin: Style.space(8)
    anchors.verticalCenter: parent.verticalCenter
    visible: root.undoable
    text: "Undo"
    fontSize: Style.font.caption
    focusable: false
    onClicked: {
      root.dismiss()
      root.undoRequested()
    }
  }
}

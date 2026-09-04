import QtQuick
import QtQuick.Controls
import QtQuick.Layouts
import qs.Commons
import qs.Ui

// One task. Left: a completion checkbox (click to complete, click again to
// reopen). Middle: title over a meta line (priority, time, date when it
// differs from today, tags, estimate, goal). Right: a hover action pair
// whose slot is ALWAYS reserved — hover only fades it in via opacity, so
// scrolling the list never triggers reflow or jitter.
Rectangle {
  id: row

  property var task: null
  property string today: ""
  property bool pending: false
  property bool canWrite: true
  property color fg: Color.foreground
  property color accent: Color.accent
  property color urgent: Color.urgent

  signal toggled()
  signal editRequested()
  signal scheduleRequested()
  signal unscheduleRequested()
  signal removeRequested()

  readonly property color muted: Qt.rgba(fg.r, fg.g, fg.b, 0.55)
  readonly property color faint: Qt.rgba(fg.r, fg.g, fg.b, 0.08)
  readonly property bool hovered: hoverArea.containsMouse
  readonly property bool actionable: hovered && canWrite && !pending
  readonly property bool done: task ? task.status === "completed" : false
  readonly property bool overdue: task && !done && task.deadline !== "" && task.deadline < today
  readonly property bool showDate: task && task.deadline !== "" && task.deadline !== today
  readonly property bool hasMeta: (task && task.priority !== "") || (task && task.time !== "") || showDate
    || (task && task.tags && task.tags.length > 0) || (task && task.estimatedMinutes > 0) || (task && task.goal)

  width: parent ? parent.width : 0
  implicitHeight: content.implicitHeight + Style.space(12)
  radius: Style.space(7)
  color: hovered ? Qt.rgba(fg.r, fg.g, fg.b, 0.10) : faint

  Behavior on color { ColorAnimation { duration: 120 } }

  function pillColor(p) { return p === "p1" ? urgent : (p === "p2" ? accent : muted) }

  RowLayout {
    id: content

    anchors.fill: parent
    anchors.margins: Style.space(6)
    spacing: Style.space(8)

    Rectangle {
      id: checkbox

      Layout.alignment: Qt.AlignVCenter
      width: Style.space(18)
      height: Style.space(18)
      radius: Style.space(5)
      color: row.done ? Qt.rgba(row.fg.r, row.fg.g, row.fg.b, 0.22) : "transparent"
      border.width: 1
      border.color: row.pending ? row.accent : (row.done ? row.muted : Qt.rgba(row.fg.r, row.fg.g, row.fg.b, 0.45))

      Behavior on color { ColorAnimation { duration: 100 } }

      Text {
        anchors.centerIn: parent
        text: row.pending ? "·" : (row.done ? "✓" : "")
        color: row.pending ? row.accent : row.fg
        font.family: Style.font.family
        font.pixelSize: Style.font.caption
        font.bold: true
      }

      MouseArea {
        anchors.fill: parent
        anchors.margins: -Style.space(3)
        enabled: row.canWrite && !row.pending
        cursorShape: Qt.PointingHandCursor
        onClicked: row.toggled()
      }
    }

    Column {
      Layout.fillWidth: true
      Layout.alignment: Qt.AlignVCenter
      spacing: 2

      Text {
        width: parent.width
        text: row.task ? row.task.title : ""
        color: row.done ? row.muted : row.fg
        font.family: Style.font.family
        font.pixelSize: Style.font.bodySmall
        font.strikeout: row.done
        elide: Text.ElideRight
        wrapMode: Text.NoWrap
      }

      Row {
        visible: row.hasMeta
        spacing: Style.space(7)

        Rectangle {
          visible: row.task && row.task.priority !== ""
          anchors.verticalCenter: parent.verticalCenter
          width: Style.space(24)
          height: Style.space(14)
          radius: Style.space(4)
          color: Qt.rgba(pillColor(row.task ? row.task.priority : "").r,
                         pillColor(row.task ? row.task.priority : "").g,
                         pillColor(row.task ? row.task.priority : "").b, 0.22)

          Text {
            anchors.centerIn: parent
            text: row.task ? row.task.priority.toUpperCase() : ""
            color: pillColor(row.task ? row.task.priority : "")
            font.family: Style.font.family
            font.pixelSize: Style.font.caption
            font.bold: true
          }
        }

        Text {
          anchors.verticalCenter: parent.verticalCenter
          visible: row.overdue
          text: row.task ? "overdue " + Qt.formatDate(new Date(row.task.deadline + "T12:00:00"), "d MMM") : ""
          color: row.urgent
          font.family: Style.font.family
          font.pixelSize: Style.font.caption
        }

        Text {
          anchors.verticalCenter: parent.verticalCenter
          visible: row.showDate && !row.overdue
          text: row.task ? Qt.formatDate(new Date(row.task.deadline + "T12:00:00"), "d MMM") : ""
          color: row.muted
          font.family: Style.font.family
          font.pixelSize: Style.font.caption
        }

        Text {
          anchors.verticalCenter: parent.verticalCenter
          visible: row.task && row.task.time !== ""
          text: row.task ? row.task.time : ""
          color: row.muted
          font.family: Style.font.family
          font.pixelSize: Style.font.caption
        }

        Text {
          anchors.verticalCenter: parent.verticalCenter
          visible: row.task && row.task.tags && row.task.tags.length > 0
          text: row.task && row.task.tags ? row.task.tags.map(function(tag) { return "@" + tag }).join(" ") : ""
          color: row.muted
          font.family: Style.font.family
          font.pixelSize: Style.font.caption
        }

        Text {
          anchors.verticalCenter: parent.verticalCenter
          visible: row.task && row.task.estimatedMinutes > 0
          text: row.task ? "~" + row.task.estimatedMinutes + "m" : ""
          color: row.muted
          font.family: Style.font.family
          font.pixelSize: Style.font.caption
        }

        Text {
          anchors.verticalCenter: parent.verticalCenter
          visible: row.task && row.task.goal
          width: Math.min(implicitWidth + Style.space(6), row.width - Style.space(120))
          text: row.task && row.task.goal ? "◇ " + row.task.goal.text : ""
          color: row.muted
          elide: Text.ElideRight
          font.family: Style.font.family
          font.pixelSize: Style.font.caption
        }
      }
    }

    // Reserved action slot: constant geometry, hover only animates opacity.
    Row {
      id: actions

      Layout.alignment: Qt.AlignVCenter
      spacing: Style.space(2)
      opacity: row.actionable ? 1 : 0
      enabled: row.actionable

      Behavior on opacity { NumberAnimation { duration: 110; easing.type: Easing.OutQuad } }

      Button {
        anchors.verticalCenter: parent.verticalCenter
        width: Style.space(24)
        height: Style.space(24)
        horizontalPadding: 0
        verticalPadding: 0
        iconText: "󰏫"
        tooltipText: "Edit task"
        fontSize: Style.font.bodySmall
        focusable: false
        onClicked: row.editRequested()
      }

      Button {
        anchors.verticalCenter: parent.verticalCenter
        width: Style.space(24)
        height: Style.space(24)
        horizontalPadding: 0
        verticalPadding: 0
        iconText: "󰇙"
        tooltipText: "More actions"
        fontSize: Style.font.bodySmall
        focusable: false
        onClicked: rowMenu.open()
      }
    }
  }

  Popup {
    id: rowMenu

    x: row.width - width - Style.space(8)
    y: row.height - Style.space(2)
    padding: Style.space(4)
    implicitWidth: Style.space(150)

    background: BorderSurface {
      color: Color.popups.background
      borderSpec: Border.flat(Color.popups.border, Style.normalBorderWidth)
      radius: Style.cornerRadius
    }

    contentItem: Column {
      spacing: Style.space(1)

      Button {
        width: parent.width
        text: "Change date…"
        leftAlign: true
        fontSize: Style.font.bodySmall
        focusable: false
        onClicked: { rowMenu.close(); row.scheduleRequested() }
      }

      Button {
        width: parent.width
        text: "Move to Inbox"
        leftAlign: true
        fontSize: Style.font.bodySmall
        focusable: false
        visible: row.task && row.task.deadline !== ""
        onClicked: { rowMenu.close(); row.unscheduleRequested() }
      }

      Button {
        width: parent.width
        text: "Remove"
        leftAlign: true
        fontSize: Style.font.bodySmall
        focusable: false
        onClicked: { rowMenu.close(); row.removeRequested() }
      }
    }
  }

  MouseArea {
    id: hoverArea

    anchors.fill: parent
    hoverEnabled: true
    acceptedButtons: Qt.NoButton
    cursorShape: Qt.ArrowCursor
    z: -1
  }
}

import QtQuick
import QtQuick.Layouts
import qs.Commons
import qs.Ui

// One goal: name, priority/deadline meta, linked-task progress bar, and
// hover actions (edit, remove). Header click expands to the linked tasks.
// Hover only fades the reserved action slot — it never reflows.
Rectangle {
  id: card

  property var goal: null
  property var tasks: []
  property string today: ""
  property bool canWrite: true
  property string pendingTaskId: ""
  property bool writeBusy: false
  property color fg: Color.foreground
  property color accent: Color.accent
  property color urgent: Color.urgent
  property bool expanded: false

  signal editRequested()
  signal removeRequested()
  signal taskToggled(var task)
  signal taskEditRequested(var task)
  signal taskScheduleRequested(var task)
  signal taskUnscheduleRequested(var task)
  signal taskRemoveRequested(var task)

  readonly property color muted: Qt.rgba(fg.r, fg.g, fg.b, 0.55)
  readonly property color faint: Qt.rgba(fg.r, fg.g, fg.b, 0.08)
  readonly property bool hovered: hover.hovered
  readonly property int completed: goal ? goal.progress.completed : 0
  readonly property int active: goal ? goal.progress.active : 0
  readonly property int total: completed + active
  readonly property real ratio: total > 0 ? Math.min(1, completed / total) : 0
  readonly property color priorityColor: goal ? (goal.priority === "p1" ? urgent : (goal.priority === "p2" ? accent : muted)) : muted
  readonly property int linkedCount: tasks ? tasks.length : 0

  width: parent ? parent.width : 0
  implicitHeight: content.implicitHeight + Style.space(14)
  radius: Style.space(7)
  color: hovered ? Qt.rgba(fg.r, fg.g, fg.b, 0.10) : faint

  Behavior on color { ColorAnimation { duration: 120 } }

  HoverHandler { id: hover }

  ColumnLayout {
    id: content

    anchors.fill: parent
    anchors.margins: Style.space(7)
    spacing: Style.space(4)

    RowLayout {
      Layout.fillWidth: true
      spacing: Style.space(6)

      Item {
        Layout.fillWidth: true
        implicitHeight: Math.max(headerTitle.implicitHeight, Style.space(24))

        Row {
          anchors.fill: parent
          spacing: Style.space(5)

          Text {
            anchors.verticalCenter: parent.verticalCenter
            text: card.expanded ? "󰅀" : "󰅂"
            color: card.muted
            font.family: Style.font.family
            font.pixelSize: Style.font.caption
          }

          Text {
            id: headerTitle

            width: parent.width - Style.space(20)
            anchors.verticalCenter: parent.verticalCenter
            text: card.goal ? card.goal.text : ""
            color: card.fg
            font.family: Style.font.family
            font.pixelSize: Style.font.bodySmall
            font.bold: true
            elide: Text.ElideRight
          }
        }

        MouseArea {
          anchors.fill: parent
          hoverEnabled: true
          cursorShape: Qt.PointingHandCursor
          onClicked: card.expanded = !card.expanded
        }
      }

      // Reserved slot: constant geometry, hover only fades the buttons in.
      Row {
        Layout.alignment: Qt.AlignVCenter
        spacing: Style.space(2)
        opacity: card.hovered ? 1 : 0
        enabled: card.canWrite

        Behavior on opacity { NumberAnimation { duration: 110; easing.type: Easing.OutQuad } }

        Button {
          anchors.verticalCenter: parent.verticalCenter
          width: Style.space(24)
          height: Style.space(24)
          horizontalPadding: 0
          verticalPadding: 0
          iconText: "󰏫"
          tooltipText: "Edit goal"
          fontSize: Style.font.bodySmall
          focusable: false
          onClicked: card.editRequested()
        }

        Button {
          anchors.verticalCenter: parent.verticalCenter
          width: Style.space(24)
          height: Style.space(24)
          horizontalPadding: 0
          verticalPadding: 0
          iconText: "󰆴"
          tooltipText: "Remove goal"
          fontSize: Style.font.bodySmall
          focusable: false
          onClicked: card.removeRequested()
        }
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

    Column {
      Layout.fillWidth: true
      visible: card.expanded && card.linkedCount > 0
      spacing: Style.space(4)

      Repeater {
        model: card.expanded ? card.tasks : []

        delegate: PravahTaskRow {
          required property var modelData

          task: modelData
          today: card.today
          pending: card.pendingTaskId === modelData.id && card.writeBusy
          canWrite: card.canWrite
          fg: card.fg
          accent: card.accent
          urgent: card.urgent
          width: parent.width
          onToggled: card.taskToggled(modelData)
          onEditRequested: card.taskEditRequested(modelData)
          onScheduleRequested: card.taskScheduleRequested(modelData)
          onUnscheduleRequested: card.taskUnscheduleRequested(modelData)
          onRemoveRequested: card.taskRemoveRequested(modelData)
        }
      }
    }
  }
}

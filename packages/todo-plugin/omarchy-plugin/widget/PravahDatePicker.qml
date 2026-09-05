import QtQuick
import qs.Commons
import qs.Ui

// Compact month-grid date picker shown as an overlay. Emits
// picked("YYYY-MM-DD") — or picked("") for the Clear preset — and
// canceled() on scrim click or Escape.
Item {
  id: root

  property string selectedDate: ""
  property color fg: Color.foreground
  property color accent: Color.accent
  property color urgent: Color.urgent
  property string today: Qt.formatDate(new Date(), "yyyy-MM-dd")

  signal picked(string date)
  signal canceled()

  readonly property color muted: Qt.rgba(fg.r, fg.g, fg.b, 0.55)

  readonly property real cardWidth: Style.space(252)
  readonly property real cellWidth: (cardWidth - Style.space(20)) / 7
  // Rebinding target: openFor() and the month navigation buttons assign
  // this directly, which intentionally breaks the initial binding.
  property date shownMonthDate: {
    if (selectedDate !== "") {
      var parsed = new Date(selectedDate + "T12:00:00")
      if (!isNaN(parsed.getTime())) return parsed
    }
    return new Date()
  }

  function iso(d) { return Qt.formatDate(d, "yyyy-MM-dd") }
  function tomorrowIso() {
    return iso(new Date(new Date(today + "T12:00:00").getTime() + 86400000))
  }

  function openFor(date) {
    selectedDate = date || ""
    var parsed = selectedDate !== "" ? new Date(selectedDate + "T12:00:00") : new Date()
    shownMonthDate = isNaN(parsed.getTime()) ? new Date() : parsed
    visible = true
    forceActiveFocus()
  }

  function close() { visible = false }

  visible: false
  focus: visible
  Keys.onEscapePressed: root.canceled()

  Rectangle {
    anchors.fill: parent
    color: Qt.rgba(Color.background.r, Color.background.g, Color.background.b, 0.72)

    MouseArea { anchors.fill: parent; onClicked: root.canceled() }
  }

  BorderSurface {
    id: card

    anchors.centerIn: parent
    width: root.cardWidth
    height: gridContent.implicitHeight + Style.space(20)
    color: Color.popups.background
    borderSpec: Border.flat(Color.popups.border, Style.normalBorderWidth)
    radius: Style.cornerRadius

    MouseArea { anchors.fill: parent; onClicked: {} }

    Column {
      id: gridContent

      anchors.centerIn: parent
      width: parent.width - Style.space(20)
      spacing: Style.space(6)

      Row {
        width: parent.width

        Button {
          iconText: "‹"
          focusable: false
          onClicked: root.shownMonthDate = new Date(root.shownMonthDate.getFullYear(), root.shownMonthDate.getMonth() - 1, 1)
        }

        Text {
          anchors.verticalCenter: parent.verticalCenter
          width: parent.width - Style.space(64)
          horizontalAlignment: Text.AlignHCenter
          text: Qt.formatDate(root.shownMonthDate, "MMMM yyyy")
          color: root.fg
          font.family: Style.font.family
          font.pixelSize: Style.font.bodySmall
          font.bold: true
        }

        Button {
          iconText: "›"
          focusable: false
          onClicked: root.shownMonthDate = new Date(root.shownMonthDate.getFullYear(), root.shownMonthDate.getMonth() + 1, 1)
        }
      }

      Row {
        width: parent.width

        Repeater {
          model: ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"]

          delegate: Text {
            required property string modelData

            width: root.cellWidth
            horizontalAlignment: Text.AlignHCenter
            text: modelData
            color: root.muted
            font.family: Style.font.family
            font.pixelSize: Style.font.caption
          }
        }
      }

      Grid {
        width: parent.width
        columns: 7

        Repeater {
          model: 42

          delegate: Item {
            id: dayCell

            required property int index

            readonly property int firstOffset: (new Date(root.shownMonthDate.getFullYear(), root.shownMonthDate.getMonth(), 1).getDay() + 6) % 7
            readonly property int dayNumber: index - firstOffset + 1
            readonly property bool valid: dayNumber >= 1 && dayNumber <= new Date(root.shownMonthDate.getFullYear(), root.shownMonthDate.getMonth() + 1, 0).getDate()
            readonly property string cellIso: valid ? root.iso(new Date(root.shownMonthDate.getFullYear(), root.shownMonthDate.getMonth(), dayNumber)) : ""
            readonly property bool isToday: cellIso === root.today
            readonly property bool isSelected: cellIso !== "" && cellIso === root.selectedDate

            width: root.cellWidth
            height: Style.space(26)

            Rectangle {
              anchors.centerIn: parent
              width: Style.space(22)
              height: Style.space(22)
              radius: Style.space(5)
              visible: dayCell.valid
              color: dayCell.isSelected ? Qt.rgba(root.fg.r, root.fg.g, root.fg.b, 0.18) : "transparent"
              border.width: dayCell.isToday && !dayCell.isSelected ? 1 : 0
              border.color: root.muted

              Text {
                anchors.centerIn: parent
                text: dayCell.dayNumber
                color: dayCell.isSelected ? root.fg : (dayCell.isToday ? root.accent : root.muted)
                font.family: Style.font.family
                font.pixelSize: Style.font.caption
                font.bold: dayCell.isToday
              }
            }

            MouseArea {
              anchors.fill: parent
              enabled: dayCell.valid
              cursorShape: Qt.PointingHandCursor
              onClicked: root.picked(dayCell.cellIso)
            }
          }
        }
      }

      Row {
        anchors.horizontalCenter: parent.horizontalCenter
        spacing: Style.space(6)

        Button {
          text: "Today"
          fontSize: Style.font.caption
          focusable: false
          selected: root.selectedDate === root.today
          onClicked: root.picked(root.today)
        }

        Button {
          text: "Tomorrow"
          fontSize: Style.font.caption
          focusable: false
          selected: root.selectedDate === root.tomorrowIso()
          onClicked: root.picked(root.tomorrowIso())
        }

        Button {
          text: "Clear"
          fontSize: Style.font.caption
          focusable: false
          selected: root.selectedDate === ""
          onClicked: root.picked("")
        }
      }
    }
  }
}

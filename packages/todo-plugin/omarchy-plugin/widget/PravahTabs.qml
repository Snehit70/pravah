import QtQuick
import qs.Commons
import qs.Ui

// Tab strip for the Pravah panel. The current tab uses the kit's selected
// state; counts render inline as part of the label.
Row {
  id: root

  property string activeTab: "today"
  property var tabs: []
  property color fg: Color.foreground

  signal tabSelected(string id)

  spacing: Style.space(2)

  Repeater {
    model: root.tabs

    delegate: Button {
      required property var modelData

      text: modelData.count > 0 ? modelData.label + "  " + modelData.count : modelData.label
      fontSize: Style.font.bodySmall
      selected: root.activeTab === modelData.id
      focusable: false
      onClicked: root.tabSelected(modelData.id)
    }
  }
}

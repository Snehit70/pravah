import { registerRootComponent } from 'expo';

import App from './App';
import { registerHomeWidgets } from './src/widget/widgetBridge';

// The widget's headless task must be registered at bundle start, because
// Android can boot this bundle just to draw a widget, without the app UI.
// No-op on iOS, web, and builds without the widget native module.
registerHomeWidgets();

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately
registerRootComponent(App);

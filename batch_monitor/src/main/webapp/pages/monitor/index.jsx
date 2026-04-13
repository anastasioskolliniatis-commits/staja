import layout from '@splunk/react-page';
import { SplunkThemeProvider } from '@splunk/themes';
import { defaultTheme, getThemeOptions } from '@splunk/splunk-utils/themes';
import App from './App';

const themeProviderSettings = getThemeOptions(defaultTheme() || 'enterprise');

layout(
  <SplunkThemeProvider {...themeProviderSettings}>
    <App />
  </SplunkThemeProvider>
);

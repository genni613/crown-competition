import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { App as AntdApp, ConfigProvider } from 'antd'
import zhCN from 'antd/locale/zh_CN'
import App from './App'
import { ErrorBoundary } from './components/ErrorBoundary'
import { AppCopilotProvider } from './components/copilot/AppCopilotProvider'
import '@copilotkit/react-core/v2/styles.css'
import './styles.css'
import './copilot-override.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
    <AppCopilotProvider>
      <ConfigProvider
        locale={zhCN}
        theme={{
          token: {
            colorPrimary: '#6366f1',
            colorPrimaryHover: '#818cf8',
            colorPrimaryActive: '#4f46e5',
            borderRadius: 8,
            fontFamily: "'Outfit', system-ui, -apple-system, sans-serif",
            colorBgLayout: '#f5f3ff',
            colorBgContainer: '#ffffff',
            colorBorder: '#e2e8f0',
            colorBorderSecondary: '#f1f5f9',
          },
          components: {
            Menu: {
              itemBg: 'transparent',
              itemSelectedBg: '#eef2ff',
              itemSelectedColor: '#4f46e5',
              itemHoverBg: '#eef2ff',
            },
            Table: {
              headerBg: '#eef2ff',
              headerColor: '#475569',
              rowHoverBg: '#f5f3ff',
            },
            Card: {
              borderRadiusLG: 12,
            },
          },
        }}
      >
        <BrowserRouter>
          <AntdApp>
            <App />
          </AntdApp>
        </BrowserRouter>
      </ConfigProvider>
    </AppCopilotProvider>
    </ErrorBoundary>
  </React.StrictMode>,
)

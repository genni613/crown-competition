import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { App as AntdApp, ConfigProvider } from 'antd'
import zhCN from 'antd/locale/zh_CN'
import App from './App'
import { AppCopilotProvider } from './components/copilot/AppCopilotProvider'
import '@copilotkit/react-core/v2/styles.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <AppCopilotProvider>
      <ConfigProvider locale={zhCN} theme={{ token: { colorPrimary: '#1677ff', borderRadius: 6 } }}>
        <BrowserRouter>
          <AntdApp>
            <App />
          </AntdApp>
        </BrowserRouter>
      </ConfigProvider>
    </AppCopilotProvider>
  </React.StrictMode>,
)

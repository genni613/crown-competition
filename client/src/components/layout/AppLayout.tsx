import { useState } from 'react'
import { Outlet } from 'react-router-dom'
import { Layout } from 'antd'
import Sidebar from './Sidebar'
import { AppCopilotPopup } from '../copilot/AppCopilotPopup'

const { Sider, Content } = Layout

export default function AppLayout() {
  const [collapsed, setCollapsed] = useState(false)

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Sider
        width={220}
        collapsedWidth={60}
        collapsed={collapsed}
        breakpoint="lg"
        onBreakpoint={(broken) => setCollapsed(broken)}
        theme="light"
        style={{
          borderRight: '1px solid #eef2ff',
          overflow: 'auto',
          height: '100vh',
          position: 'sticky',
          top: 0,
          background: '#ffffff',
        }}
      >
        <Sidebar />
      </Sider>
      <Layout>
        <Content style={{
          padding: '28px 32px',
          background: '#f5f3ff',
          minHeight: 'auto',
          backgroundImage: 'radial-gradient(circle, #e0e7ff 0.6px, transparent 0.6px)',
          backgroundSize: '32px 32px',
        }}>
          <Outlet />
        </Content>
        <AppCopilotPopup />
      </Layout>
    </Layout>
  )
}

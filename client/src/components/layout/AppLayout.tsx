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
        width={210}
        collapsedWidth={60}
        collapsed={collapsed}
        breakpoint="lg"
        onBreakpoint={(broken) => setCollapsed(broken)}
        theme="light"
        style={{ borderRight: '1px solid #f1f5f9', overflow: 'auto', height: '100vh', position: 'sticky', top: 0 }}
      >
        <Sidebar />
      </Sider>
      <Layout>
        <Content style={{ padding: '24px 28px', background: '#f8fafc', minHeight: 'auto' }}>
          <Outlet />
        </Content>
        <AppCopilotPopup />
      </Layout>
    </Layout>
  )
}

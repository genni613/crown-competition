import { useState } from 'react'
import { Outlet, useNavigate, useLocation } from 'react-router-dom'
import { Layout, Avatar, Dropdown, Typography, Tag } from 'antd'
import { LogoutOutlined, UserOutlined } from '@ant-design/icons'
import { useAuthStore } from '../../store/authStore'
import Sidebar from './Sidebar'
import { AppCopilotPopup } from '../copilot/AppCopilotPopup'

const { Header, Content, Sider } = Layout

export default function AppLayout() {
  const { user, setUser } = useAuthStore()
  const navigate = useNavigate()

  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' })
    setUser(null)
    window.location.href = '/'
  }

  const menuItems = [
    { key: 'logout', icon: <LogoutOutlined />, label: '退出登录', onClick: handleLogout },
  ]

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Sider width={200} theme="light" style={{ borderRight: '1px solid #f0f0f0' }}>
        <Sidebar />
      </Sider>
      <Layout>
        <Header style={{ background: '#fff', padding: '0 24px', display: 'flex', justifyContent: 'flex-end', alignItems: 'center', borderBottom: '1px solid #f0f0f0' }}>
          <Dropdown menu={{ items: menuItems }} placement="bottomRight">
            <div style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8 }}>
              <Avatar src={user?.avatar_url} icon={<UserOutlined />} size="small" />
              <Typography.Text>{user?.name}</Typography.Text>
              {(user as any)?.feishu_job_role && (
                <Tag color="blue" style={{ marginRight: 0 }}>
                  {({ product: '产品', design: '设计', tech: '研发' } as Record<string, string>)[(user as any).feishu_job_role] || (user as any).feishu_job_role}
                </Tag>
              )}
            </div>
          </Dropdown>
        </Header>
        <Content style={{ margin: 24, padding: 24, background: '#fff', borderRadius: 8, minHeight: 'auto' }}>
          <Outlet />
        </Content>
        <AppCopilotPopup />
      </Layout>
    </Layout>
  )
}

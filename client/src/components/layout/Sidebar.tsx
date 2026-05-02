import { useNavigate, useLocation } from 'react-router-dom'
import { Menu, Avatar, Dropdown, Tag } from 'antd'
import type { MenuProps } from 'antd'
import {
  DashboardOutlined, TrophyOutlined, FileTextOutlined,
  SettingOutlined, FormOutlined, AuditOutlined,
  TeamOutlined, CloudServerOutlined, ControlOutlined,
  LogoutOutlined, UserOutlined,
} from '@ant-design/icons'
import { useAuthStore } from '../../store/authStore'

const jobRoleMap: Record<string, string> = { product: '产品', design: '设计', tech: '研发' }

export default function Sidebar() {
  const navigate = useNavigate()
  const location = useLocation()
  const { user, setUser } = useAuthStore()
  const isAdmin = user?.role === 'ADMIN'

  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' })
    setUser(null)
    window.location.href = '/'
  }

  const items: MenuProps['items'] = [
    { key: '/', icon: <DashboardOutlined />, label: '我的成绩' },
    { key: '/evidence/submit', icon: <FileTextOutlined />, label: '提交举证' },
    { key: '/evidence/mine', icon: <FormOutlined />, label: '我的举证' },
  ]

  if (isAdmin) {
    items.push(
      { type: 'divider' as const },
      { label: '管理后台', type: 'group' as const, children: [
        { key: '/admin/seasons', icon: <SettingOutlined />, label: '赛季管理' },
        { key: '/admin/scoring', icon: <TeamOutlined />, label: '评分管理' },
        { key: '/admin/data-sync', icon: <CloudServerOutlined />, label: '数据同步' },
        { key: '/admin/dimensions', icon: <ControlOutlined />, label: '维度规则' },
        { key: '/admin/evidence', icon: <AuditOutlined />, label: '举证审核' },
      ]},
    )
  }

  function getSelectedKey(pathname: string) {
    if (pathname.startsWith('/admin/scores/') || pathname.startsWith('/admin/org-scores/') || pathname === '/admin/scoring') return '/admin/scoring'
    if (pathname.startsWith('/admin/feishu/') || pathname === '/admin/data-sync') return '/admin/data-sync'
    if (pathname.startsWith('/admin/dimensions')) return '/admin/dimensions'
    if (pathname.startsWith('/admin/seasons')) return '/admin/seasons'
    if (pathname.startsWith('/admin/evidence')) return '/admin/evidence'
    return pathname
  }

  const logoutMenu: MenuProps['items'] = [
    { key: 'logout', icon: <LogoutOutlined />, label: '退出登录', onClick: handleLogout },
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Logo */}
      <div style={{ height: 60, display: 'flex', alignItems: 'center', padding: '0 16px', gap: 10, borderBottom: '1px solid #f1f5f9' }}>
        <div style={{
          width: 30, height: 30, borderRadius: 8,
          background: 'linear-gradient(135deg, #0ea5e9, #06b6d4)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: '#fff', fontSize: 14, fontWeight: 700,
        }}>
          C
        </div>
        <span style={{ fontSize: 15, fontWeight: 600, color: '#0f172a' }}>皇冠赛</span>
      </div>

      {/* Menu */}
      <div style={{ flex: 1, overflow: 'auto' }}>
        <Menu
          mode="inline"
          selectedKeys={[getSelectedKey(location.pathname)]}
          items={items}
          onClick={({ key }) => navigate(key)}
          style={{ borderRight: 0 }}
        />
      </div>

      {/* User info */}
      {user && (
        <div style={{ padding: '12px 16px', borderTop: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', gap: 8 }}>
          <Dropdown menu={{ items: logoutMenu }} placement="topRight" trigger={['click']}>
            <Avatar src={user.avatar_url} icon={<UserOutlined />} size={28} style={{ background: '#e0f2fe', cursor: 'pointer', flexShrink: 0 }} />
          </Dropdown>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: 500, color: '#0f172a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{user.name}</div>
            {(user as any).feishu_job_role && (
              <Tag style={{ margin: 0, padding: '0 6px', fontSize: 10, lineHeight: '18px', borderRadius: 4, background: '#eff6ff', color: '#0284c7', border: 'none' }}>
                {jobRoleMap[(user as any).feishu_job_role] || (user as any).feishu_job_role}
              </Tag>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

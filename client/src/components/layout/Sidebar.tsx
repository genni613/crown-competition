import { useNavigate, useLocation } from 'react-router-dom'
import { Menu, Avatar, Dropdown, Tag } from 'antd'
import type { MenuProps } from 'antd'
import {
  DashboardOutlined, TrophyOutlined, FileTextOutlined,
  SettingOutlined, FormOutlined, AuditOutlined,
  TeamOutlined, CloudServerOutlined, ControlOutlined,
  LogoutOutlined, UserOutlined, CrownOutlined,
} from '@ant-design/icons'
import { useAuthStore } from '../../store/authStore'

const jobRoleMap: Record<string, string> = { product: '产品', design: '设计', tech: '研发', test: '测试' }

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
      {
        label: '管理后台',
        type: 'group' as const,
        children: [
          { key: '/admin/scoring', icon: <TeamOutlined />, label: '评分管理' },
          { key: '/admin/data-sync', icon: <CloudServerOutlined />, label: '数据同步' },
          { key: '/admin/evidence', icon: <AuditOutlined />, label: '举证审核' },
          { key: '/admin/members', icon: <TeamOutlined />, label: '成员管理' },
          { key: '/admin/seasons', icon: <SettingOutlined />, label: '赛季管理' },
          { key: '/admin/dimensions', icon: <ControlOutlined />, label: '维度规则' },
          { key: '/admin/member-directory', icon: <UserOutlined />, label: '同步人员目录' },
        ],
      },
    )
  }

  function getSelectedKey(pathname: string) {
    if (pathname.startsWith('/admin/scores/') || pathname.startsWith('/admin/org-scores/') || pathname.startsWith('/admin/ranking-detail/') || pathname === '/admin/scoring') return '/admin/scoring'
    if (pathname.startsWith('/admin/members')) return '/admin/members'
    if (pathname.startsWith('/admin/member-directory')) return '/admin/member-directory'
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
      <div style={{
        height: 64, display: 'flex', alignItems: 'center', padding: '0 16px', gap: 12,
        borderBottom: '1px solid #eef2ff',
      }}>
        <div style={{
          width: 34, height: 34, borderRadius: 10,
          background: 'linear-gradient(135deg, #6366f1, #a855f7)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: '#fff', fontSize: 16, fontWeight: 800,
          boxShadow: '0 2px 12px rgba(99, 102, 241, 0.35)',
          position: 'relative',
        }}>
          <CrownOutlined style={{ fontSize: 18 }} />
        </div>
        <div>
          <span style={{ fontSize: 16, fontWeight: 700, color: '#1e1b4b', lineHeight: '20px' }}>皇冠赛</span>
          <div style={{ fontSize: 10, color: '#a5b4fc', fontWeight: 500, letterSpacing: 1 }}>CROWN ARENA</div>
        </div>
      </div>

      {/* Menu */}
      <div style={{ flex: 1, overflow: 'auto', padding: '8px 0' }}>
        <Menu
          mode="inline"
          selectedKeys={[getSelectedKey(location.pathname)]}
          items={items}
          onClick={({ key }) => navigate(key)}
          style={{ borderRight: 0, background: 'transparent' }}
        />
      </div>

      {/* User info */}
      {user && (
        <Dropdown menu={{ items: logoutMenu }} placement="topRight" trigger={['click']}>
          <div className="sidebar-user-section" style={{
            padding: '14px 16px', cursor: 'pointer', transition: 'background 0.15s',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <Avatar
                src={user.avatar_url}
                icon={<UserOutlined />}
                size={36}
                style={{
                  background: 'linear-gradient(135deg, #c7d2fe, #e0e7ff)',
                  flexShrink: 0,
                  boxShadow: '0 0 0 2px #fff, 0 0 0 3px #a5b4fc',
                }}
              />
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: '#1e1b4b', lineHeight: '20px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{user.name}</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
                  {(user as any).feishu_job_role && (
                    <span style={{
                      fontSize: 11, lineHeight: 1, fontWeight: 600,
                      color: '#6366f1', background: '#eef2ff',
                      padding: '2px 8px', borderRadius: 6,
                    }}>
                      {jobRoleMap[(user as any).feishu_job_role] || (user as any).feishu_job_role}
                    </span>
                  )}
                  {user.title && (
                    <span style={{ fontSize: 11, lineHeight: 1, color: '#94a3b8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {user.title}
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>
        </Dropdown>
      )}
    </div>
  )
}

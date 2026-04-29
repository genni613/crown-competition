import { useNavigate, useLocation } from 'react-router-dom'
import { Menu } from 'antd'
import type { MenuProps } from 'antd'
import {
  DashboardOutlined, TrophyOutlined, FileTextOutlined,
  SettingOutlined, FormOutlined, AuditOutlined,
  TeamOutlined, CloudServerOutlined,
} from '@ant-design/icons'
import { useAuthStore } from '../../store/authStore'

export default function Sidebar() {
  const navigate = useNavigate()
  const location = useLocation()
  const { user } = useAuthStore()
  const isAdmin = user?.role === 'ADMIN'

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
        { key: '/admin/evidence', icon: <AuditOutlined />, label: '举证审核' },
      ]},
    )
  }

  return (
    <>
      <div style={{ height: 64, display: 'flex', alignItems: 'center', justifyContent: 'center', borderBottom: '1px solid #f0f0f0' }}>
        <TrophyOutlined style={{ fontSize: 24, marginRight: 8, color: '#faad14' }} />
        <span style={{ fontSize: 18, fontWeight: 600 }}>皇冠赛</span>
      </div>
      <Menu
        mode="inline"
        selectedKeys={[location.pathname]}
        items={items}
        onClick={({ key }) => navigate(key)}
        style={{ borderRight: 0 }}
      />
    </>
  )
}

import { useEffect, useState } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { Modal, Select, Space, Typography, message } from 'antd'
import { Spin } from 'antd'
import { CrownOutlined } from '@ant-design/icons'
import { useAuthStore } from './store/authStore'
import { updateMyJobRole } from './api/feishu'
import AppLayout from './components/layout/AppLayout'
import Dashboard from './pages/Dashboard'
import Rankings from './pages/Rankings'
import EvidenceSubmit from './pages/EvidenceSubmit'
import EvidenceList from './pages/EvidenceList'
import SeasonManager from './pages/admin/SeasonManager'
import ScoreEntry from './pages/admin/ScoreEntry'
import EvidenceReview from './pages/admin/EvidenceReview'
import OrgScoreManager from './pages/admin/OrgScoreManager'
import FeishuManager from './pages/admin/FeishuManager'
import AdminScoringHub from './pages/admin/AdminScoringHub'
import AdminDataSyncHub from './pages/admin/AdminDataSyncHub'
import DimensionManager from './pages/admin/DimensionManager'

const jobRoleOptions = [
  { label: '产品', value: 'product' },
  { label: '设计', value: 'design' },
  { label: '研发', value: 'tech' },
]

export default function App() {
  const { user, loading, fetchUser, setUser } = useAuthStore()
  const [jobRoleOpen, setJobRoleOpen] = useState(false)
  const [selectedRole, setSelectedRole] = useState<string>()
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    fetchUser()
  }, [])

  useEffect(() => {
    if (user && !(user as any).feishu_job_role) {
      setJobRoleOpen(true)
    }
  }, [user])

  async function onSaveJobRole() {
    if (!selectedRole) return
    setSaving(true)
    try {
      await updateMyJobRole(selectedRole)
      setUser({ ...user!, feishu_job_role: selectedRole } as any)
      setJobRoleOpen(false)
      message.success('岗位设置成功')
    } catch {
      message.error('设置失败，请重试')
    } finally {
      setSaving(false)
    }
  }

  if (loading) return (
    <div className="login-bg">
      <Spin size="large" />
    </div>
  )

  if (!user) return (
    <div className="login-bg">
      <div style={{
        maxWidth: 420, width: '100%', padding: '52px 44px', background: 'rgba(255,255,255,0.9)',
        backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)',
        borderRadius: 20, boxShadow: '0 8px 40px rgba(99, 102, 241, 0.12), 0 0 0 1px rgba(255,255,255,0.5)',
        textAlign: 'center', position: 'relative', zIndex: 1,
        animation: 'scaleIn 0.4s ease-out both',
      }}>
        <div style={{
          width: 56, height: 56, borderRadius: 16, margin: '0 auto 24px',
          background: 'linear-gradient(135deg, #6366f1, #a855f7)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: '#fff', fontSize: 26, boxShadow: '0 4px 20px rgba(99, 102, 241, 0.35)',
        }}>
          <CrownOutlined />
        </div>
        <div style={{
          fontSize: 28, fontWeight: 800, color: '#1e1b4b', marginBottom: 6,
          fontFamily: "'Outfit', system-ui, sans-serif",
        }}>皇冠赛</div>
        <div style={{
          fontSize: 13, color: '#a5b4fc', marginBottom: 36, fontWeight: 500,
          letterSpacing: 2, textTransform: 'uppercase',
        }}>团队绩效竞赛平台</div>
        <a
          href="/api/auth/login"
          style={{
            display: 'block', background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
            color: '#fff', fontSize: 15, fontWeight: 700, lineHeight: '48px',
            borderRadius: 12, textDecoration: 'none',
            boxShadow: '0 4px 16px rgba(99, 102, 241, 0.35)',
            transition: 'all 0.2s ease',
          }}
          onMouseEnter={e => {
            (e.currentTarget as HTMLElement).style.transform = 'translateY(-2px)'
            ;(e.currentTarget as HTMLElement).style.boxShadow = '0 6px 24px rgba(99, 102, 241, 0.45)'
          }}
          onMouseLeave={e => {
            (e.currentTarget as HTMLElement).style.transform = 'translateY(0)'
            ;(e.currentTarget as HTMLElement).style.boxShadow = '0 4px 16px rgba(99, 102, 241, 0.35)'
          }}
        >
          飞书扫码登录
        </a>
      </div>
    </div>
  )

  return (
    <>
      <Modal
        open={jobRoleOpen}
        title={<span style={{ fontWeight: 700, color: '#1e1b4b' }}>选择你的岗位</span>}
        confirmLoading={saving}
        okButtonProps={{ disabled: !selectedRole }}
        onOk={onSaveJobRole}
        onCancel={undefined}
        closable={false}
        maskClosable={false}
      >
        <Typography.Paragraph type="secondary" style={{ marginBottom: 16 }}>
          首次登录需要选择你的岗位信息，用于皇冠赛评分分组。选择后管理员添加你为赛季成员时将自动带入岗位。
        </Typography.Paragraph>
        {selectedRole && (
          <Typography.Text style={{ color: '#6366f1', fontWeight: 600 }}>
            你选择的岗位是：{jobRoleOptions.find(o => o.value === selectedRole)?.label}
          </Typography.Text>
        )}
        <Select
          value={selectedRole}
          onChange={setSelectedRole}
          placeholder="请选择岗位"
          style={{ width: '100%' }}
          options={jobRoleOptions}
        />
      </Modal>
      <Routes>
      <Route element={<AppLayout />}>
        <Route path="/" element={<Dashboard />} />
        <Route path="/rankings/:seasonId" element={<Rankings />} />
        <Route path="/evidence/submit" element={<EvidenceSubmit />} />
        <Route path="/evidence/mine" element={<EvidenceList />} />
        {user.role === 'ADMIN' && (
          <>
            <Route path="/admin/seasons" element={<SeasonManager />} />
            <Route path="/admin/scoring" element={<AdminScoringHub />} />
            <Route path="/admin/scores/:seasonId" element={<ScoreEntry />} />
            <Route path="/admin/evidence" element={<EvidenceReview />} />
            <Route path="/admin/org-scores/:seasonId" element={<OrgScoreManager />} />
            <Route path="/admin/data-sync" element={<AdminDataSyncHub />} />
            <Route path="/admin/dimensions" element={<DimensionManager />} />
            <Route path="/admin/feishu/:seasonId" element={<FeishuManager />} />
          </>
        )}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
    </>
  )
}

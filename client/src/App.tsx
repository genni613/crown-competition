import { useEffect, useState } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { Modal, Select, Space, Typography, message } from 'antd'
import { Spin } from 'antd'
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

  if (loading) return <div style={{ display: 'flex', justifyContent: 'center', marginTop: 200 }}><Spin size="large" /></div>
  if (!user) return <div style={{ textAlign: 'center', marginTop: 200 }}><h2>请先登录</h2><a href="/api/auth/login">飞书扫码登录</a></div>

  return (
    <>
      <Modal
        open={jobRoleOpen}
        title="选择你的岗位"
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
          <Typography.Text type="success">
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

import { useEffect } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { Spin } from 'antd'
import { useAuthStore } from './store/authStore'
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

export default function App() {
  const { user, loading, fetchUser } = useAuthStore()

  useEffect(() => {
    fetchUser()
  }, [])

  if (loading) return <div style={{ display: 'flex', justifyContent: 'center', marginTop: 200 }}><Spin size="large" /></div>
  if (!user) return <div style={{ textAlign: 'center', marginTop: 200 }}><h2>请先登录</h2><a href="/api/auth/login">飞书扫码登录</a></div>

  return (
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
            <Route path="/admin/feishu/:seasonId" element={<FeishuManager />} />
          </>
        )}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  )
}

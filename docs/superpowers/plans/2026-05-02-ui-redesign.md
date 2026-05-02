# UI Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade the entire frontend UI to a modern sky-blue/cyan design language with improved layout, navigation, and component polish.

**Architecture:** Pure frontend changes — Ant Design theme override, CSS-in-JS inline style updates across all components, sidebar/header restructuring. No backend or routing changes.

**Tech Stack:** React 19, Ant Design 5, TypeScript, Vite

---

### Task 1: Ant Design Theme Override

**Files:**
- Modify: `client/src/main.tsx`

- [ ] **Step 1: Update ConfigProvider theme**

In `client/src/main.tsx`, change the ConfigProvider theme token:

```tsx
// Before (line 13):
<ConfigProvider locale={zhCN} theme={{ token: { colorPrimary: '#1677ff', borderRadius: 6 } }}>

// After:
<ConfigProvider locale={zhCN} theme={{ token: { colorPrimary: '#0ea5e9', borderRadius: 8, fontFamily: 'Inter, system-ui, -apple-system, sans-serif' } }}>
```

- [ ] **Step 2: Add Inter font to index.html**

In `client/index.html`, add before the existing `<script>` tag:

```html
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet" />
```

- [ ] **Step 3: Verify**

Run: `npm run dev:client`
Expected: All buttons, links, switches, and active states change from `#1677ff` blue to `#0ea5e9` sky blue. Border radius on all Ant components increases to 8px. Font changes to Inter.

- [ ] **Step 4: Commit**

```bash
git add client/src/main.tsx client/index.html
git commit -m "feat(ui): apply sky-blue theme override and Inter font"
```

---

### Task 2: Redesign Sidebar

**Files:**
- Modify: `client/src/components/layout/Sidebar.tsx`

- [ ] **Step 1: Rewrite Sidebar component**

Replace the entire content of `client/src/components/layout/Sidebar.tsx` with:

```tsx
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
```

- [ ] **Step 2: Verify**

Run: `npm run dev:client`
Expected: Sidebar shows gradient "C" icon + "皇冠赛" title. Active menu item has light blue highlight. User info at bottom with avatar, name, and role tag. Logout on avatar click.

- [ ] **Step 3: Commit**

```bash
git add client/src/components/layout/Sidebar.tsx
git commit -m "feat(ui): redesign sidebar with gradient logo and bottom user info"
```

---

### Task 3: Remove Header, Update Layout

**Files:**
- Modify: `client/src/components/layout/AppLayout.tsx`

- [ ] **Step 1: Rewrite AppLayout**

Replace the entire content of `client/src/components/layout/AppLayout.tsx` with:

```tsx
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
```

- [ ] **Step 2: Verify**

Run: `npm run dev:client`
Expected: No top header bar. Content area has `#f8fafc` background (no white wrapper). User info only in sidebar. Sidebar collapses to icon mode when window width < 992px.

- [ ] **Step 3: Commit**

```bash
git add client/src/components/layout/AppLayout.tsx
git commit -m "feat(ui): remove header, move content to flat background, add sidebar collapse"
```

---

### Task 4: Redesign Login Page

**Files:**
- Modify: `client/src/App.tsx`

- [ ] **Step 1: Update login/loading states in App.tsx**

In `client/src/App.tsx`, find these two lines (around line 58-59):

```tsx
  if (loading) return <div style={{ display: 'flex', justifyContent: 'center', marginTop: 200 }}><Spin size="large" /></div>
  if (!user) return <div style={{ textAlign: 'center', marginTop: 200 }}><h2>请先登录</h2><a href="/api/auth/login">飞书扫码登录</a></div>
```

Replace with:

```tsx
  if (loading) return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh', background: '#f8fafc' }}>
      <Spin size="large" />
    </div>
  )

  if (!user) return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh', background: '#f8fafc' }}>
      <div style={{
        maxWidth: 400, width: '100%', padding: '48px 40px', background: '#fff',
        borderRadius: 16, boxShadow: '0 8px 30px rgba(0,0,0,0.08)', textAlign: 'center',
      }}>
        <div style={{
          width: 48, height: 48, borderRadius: 12, margin: '0 auto 20px',
          background: 'linear-gradient(135deg, #0ea5e9, #06b6d4)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: '#fff', fontSize: 22, fontWeight: 700,
        }}>C</div>
        <div style={{ fontSize: 24, fontWeight: 700, color: '#0f172a', marginBottom: 8 }}>皇冠赛</div>
        <div style={{ fontSize: 14, color: '#94a3b8', marginBottom: 32 }}>团队绩效竞赛平台</div>
        <a
          href="/api/auth/login"
          style={{
            display: 'block', background: 'linear-gradient(135deg, #0ea5e9, #06b6d4)',
            color: '#fff', fontSize: 15, fontWeight: 600, lineHeight: '44px',
            borderRadius: 10, textDecoration: 'none',
          }}
        >
          飞书扫码登录
        </a>
      </div>
    </div>
  )
```

- [ ] **Step 2: Verify**

Run: `npm run dev:client` (without being logged in)
Expected: Centered white card with gradient C icon, "皇冠赛" title, subtitle, and blue gradient login button on `#f8fafc` background.

- [ ] **Step 3: Commit**

```bash
git add client/src/App.tsx
git commit -m "feat(ui): redesign login page with centered card"
```

---

### Task 5: Redesign Dashboard

**Files:**
- Modify: `client/src/pages/Dashboard.tsx`

This is the largest single-file change. The key modifications:

1. Update color constants to sky-blue palette
2. Replace score hero card with gradient background version
3. Update dimension cards with new styling
4. Update radar chart colors
5. Replace `<Spin />` loading with `<Skeleton />`

- [ ] **Step 1: Update color constants**

In `client/src/pages/Dashboard.tsx`, replace the `distConfig` and `scoreColor`/`scoreGradient` functions (lines 20-40):

```tsx
const distConfig: Record<string, { label: string; color: string; bg: string; icon: React.ReactNode }> = {
  '2': { label: '优秀', color: '#22c55e', bg: '#f0fdf4', icon: <CrownOutlined /> },
  '7': { label: '达标', color: '#0ea5e9', bg: '#eff6ff', icon: <CheckCircleOutlined /> },
  '1': { label: '待改进', color: '#f59e0b', bg: '#fffbeb', icon: <WarningOutlined /> },
}

const dimIcons: Record<string, React.ReactNode> = {
  交付效率: <FireOutlined />,
  需求价值: <BulbOutlined />,
  创新突破: <RiseOutlined />,
  交付质量: <CheckCircleOutlined />,
  协作贡献: <TeamOutlined />,
}

const scoreColor = (v: number) => (v >= 85 ? '#0ea5e9' : v >= 70 ? '#0ea5e9' : v >= 60 ? '#f59e0b' : '#ef4444')

const dimGradient = (v: number) => {
  if (v >= 85) return 'linear-gradient(90deg, #0ea5e9, #38bdf8)'
  if (v >= 70) return 'linear-gradient(90deg, #06b6d4, #22d3ee)'
  if (v >= 60) return 'linear-gradient(90deg, #f59e0b, #fbbf24)'
  return 'linear-gradient(90deg, #ef4444, #f87171)'
}
```

- [ ] **Step 2: Replace loading state**

Replace line 163:

```tsx
  if (loading) return <Spin />
```

With:

```tsx
  if (loading) return (
    <div style={{ maxWidth: 1100 }}>
      <div style={{ height: 140, borderRadius: 14, marginBottom: 20, background: '#e0f2fe' }} />
      <div style={{ display: 'flex', gap: 16, marginBottom: 20 }}>
        <div style={{ flex: 1, height: 200, borderRadius: 12, background: '#f1f5f9' }} />
        <div style={{ width: 200, height: 200, borderRadius: 12, background: '#f1f5f9' }} />
      </div>
    </div>
  )
```

Also remove `Spin` from the imports if no longer used elsewhere in this file. Keep it if still used in copilot action render.

- [ ] **Step 3: Replace score hero card**

Replace the entire first `<Card>` block (lines 184-243) with:

```tsx
      {/* Score Hero */}
      <div
        style={{
          background: 'linear-gradient(135deg, #0ea5e9, #06b6d4)',
          borderRadius: 14,
          padding: '26px 28px',
          color: '#fff',
          marginBottom: 20,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <div>
          <div style={{ fontSize: 13, opacity: 0.8 }}>综合总分</div>
          <div style={{ fontSize: 48, fontWeight: 700, letterSpacing: -0.5 }}>{totalScore.toFixed(1)}</div>
          <div style={{ fontSize: 12, opacity: 0.7, marginTop: 2 }}>岗位分 {positionScore.toFixed(1)} + 组织分 {orgScore.toFixed(1)}</div>
        </div>
        <div style={{ textAlign: 'right' }}>
          {rank && (
            <div style={{ background: 'rgba(255,255,255,0.2)', borderRadius: 20, padding: '7px 16px', fontSize: 14, marginBottom: 8 }}>
              #{rank} / {myMember.total_members ?? '-'}
            </div>
          )}
          {dist && (
            <div style={{ background: '#fff', borderRadius: 10, padding: '4px 14px', fontSize: 12, fontWeight: 600, color: '#0284c7', display: 'inline-block' }}>
              {dist.icon} {dist.label}
            </div>
          )}
        </div>
      </div>
```

- [ ] **Step 4: Update dimension card styling**

In the dimension progress section (the `<Space direction="vertical">` block, lines 254-290), update the dimension item to use the new gradient progress bar. Replace the `<Progress>` component with a custom div:

For each dimension item, change the `<Progress>` to:

```tsx
<div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
  <Space size={8}>
    <span style={{
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      width: 28, height: 28, borderRadius: 8,
      background: '#eff6ff', color: '#0ea5e9', fontSize: 14,
    }}>
      {dimIcons[g.name] ?? <FireOutlined />}
    </span>
    <Text strong style={{ color: '#0f172a' }}>{g.name}</Text>
    <Text style={{ fontSize: 11, color: '#cbd5e1' }}>{(g.weight * 100).toFixed(0)}%</Text>
  </Space>
  <Text style={{ fontWeight: 700, fontSize: 16, color: '#0f172a', fontVariantNumeric: 'tabular-nums' }}>
    {dimScore?.toFixed(1) ?? '-'}
  </Text>
</div>
<div style={{ background: '#e0f2fe', borderRadius: 4, height: 6 }}>
  <div style={{ background: dimGradient(normalized), borderRadius: 4, height: '100%', width: `${pct}%` }} />
</div>
```

Remove the `<Progress>` import if no longer used in this file.

- [ ] **Step 5: Update radar chart colors**

In the `<Radar>` component (around line 303-306), change:

```tsx
stroke="#0ea5e9" fill="#0ea5e9" fillOpacity={0.15} strokeWidth={2}
dot={{ r: 3, fill: '#0ea5e9', fillOpacity: 1 }}
```

And `<PolarGrid stroke="#e2e8f0" />`, `<PolarAngleAxis tick={{ fontSize: 12, fill: '#94a3b8' }} />`.

- [ ] **Step 6: Update the wrapper div**

Change the root div (line 182):

```tsx
<div style={{ maxWidth: 1100 }}>
```

To:

```tsx
<div style={{ maxWidth: 1100, margin: '0 auto' }}>
```

- [ ] **Step 7: Verify**

Run: `npm run dev:client`
Expected: Dashboard shows blue gradient hero card with score, dimension cards with sky-blue gradient progress bars, radar chart in blue theme, loading skeleton placeholders.

- [ ] **Step 8: Commit**

```bash
git add client/src/pages/Dashboard.tsx
git commit -m "feat(ui): redesign dashboard with gradient hero, sky-blue progress bars, skeleton loading"
```

---

### Task 6: Update Rankings Page

**Files:**
- Modify: `client/src/pages/Rankings.tsx`

- [ ] **Step 1: Update page styling**

In `client/src/pages/Rankings.tsx`, make these changes:

1. Page title: use `<Typography.Title level={4} style={{ margin: 0, color: '#0f172a' }}>排名看板</Typography.Title>`
2. Top 3 rank display: add color to rank numbers
   - Rank 1: `<span style={{ color: '#d4a017', fontWeight: 700 }}>1</span>`
   - Rank 2: `<span style={{ color: '#94a3b8', fontWeight: 700 }}>2</span>`
   - Rank 3: `<span style={{ color: '#b45309', fontWeight: 700 }}>3</span>`
3. Current user row: add `style={{ background: '#eff6ff' }}` to the row when `record.user_key === user?.user_key`
4. 271 distribution tag colors:
   - `'2'`: `color="#22c55e"` with pill style
   - `'7'`: `color="#0ea5e9"` with pill style
   - `'1'`: `color="#f59e0b"` with pill style

- [ ] **Step 2: Verify**

Run: `npm run dev:client`, navigate to rankings
Expected: Updated title, colored rank numbers for top 3, highlighted current user row, updated distribution tags.

- [ ] **Step 3: Commit**

```bash
git add client/src/pages/Rankings.tsx
git commit -m "feat(ui): update rankings page with colored ranks and highlighted user row"
```

---

### Task 7: Update Evidence Pages

**Files:**
- Modify: `client/src/pages/EvidenceSubmit.tsx`
- Modify: `client/src/pages/EvidenceList.tsx`

- [ ] **Step 1: Update EvidenceSubmit styling**

In `client/src/pages/EvidenceSubmit.tsx`:

1. AI draft alert: change to `<Alert type="info" style={{ background: '#eff6ff', border: '1px solid #bae6fd', borderRadius: 10 }} />`
2. Form card: add `style={{ borderRadius: 12, boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}`
3. Page title: `<Typography.Title level={4} style={{ margin: '0 0 16px', color: '#0f172a' }}>提交举证</Typography.Title>`
4. Submit button: add `style={{ background: 'linear-gradient(135deg, #0ea5e9, #06b6d4)', border: 'none', borderRadius: 8 }}`

- [ ] **Step 2: Update EvidenceList styling**

In `client/src/pages/EvidenceList.tsx`:

1. Page title: `<Typography.Title level={4} style={{ margin: '0 0 16px', color: '#0f172a' }}>我的举证</Typography.Title>`
2. Replace `<Empty>` with styled version: `<Empty description={<span style={{ color: '#94a3b8' }}>暂无举证记录，<a href="/evidence/submit" style={{ color: '#0ea5e9' }}>去提交第一条</a></span>} />`
3. Table: add props `rowClassName={(record, index) => index % 2 === 1 ? 'zebra-row' : ''}` and add a `<style>` tag or className for `.zebra-row { background: #fafbfc; }`
4. Image thumbnails: `borderRadius: 8` instead of default

- [ ] **Step 3: Verify**

Run: `npm run dev:client`, navigate to evidence submit and list pages
Expected: Updated alert, form, button styling on submit page. Updated table and empty state on list page.

- [ ] **Step 4: Commit**

```bash
git add client/src/pages/EvidenceSubmit.tsx client/src/pages/EvidenceList.tsx
git commit -m "feat(ui): update evidence pages with new theme styling"
```

---

### Task 8: Update Admin Pages Header Standardization

**Files:**
- Modify: `client/src/pages/admin/SeasonManager.tsx`
- Modify: `client/src/pages/admin/AdminScoringHub.tsx`
- Modify: `client/src/pages/admin/ScoreEntry.tsx`
- Modify: `client/src/pages/admin/OrgScoreManager.tsx`
- Modify: `client/src/pages/admin/EvidenceReview.tsx`
- Modify: `client/src/pages/admin/AdminDataSyncHub.tsx`
- Modify: `client/src/pages/admin/DimensionManager.tsx`

- [ ] **Step 1: Standardize page header pattern**

For each admin page, replace the existing title/header area with this pattern:

```tsx
<div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
  <div>
    <Typography.Title level={4} style={{ margin: 0, color: '#0f172a' }}>页面标题</Typography.Title>
    <Typography.Text style={{ fontSize: 13, color: '#94a3b8' }}>页面描述</Typography.Text>
  </div>
  <div>{/* action buttons */}</div>
</div>
```

Apply to each file:
- `SeasonManager.tsx`: title "赛季管理", description "创建和管理竞赛赛季"
- `AdminScoringHub.tsx`: title "评分管理", description "岗位分与组织分录入"
- `ScoreEntry.tsx`: title "岗位分录入", description null
- `OrgScoreManager.tsx`: title "组织分录入", description null
- `EvidenceReview.tsx`: title "举证审核", description null
- `AdminDataSyncHub.tsx`: title "数据同步", description "飞书项目数据同步管理"
- `DimensionManager.tsx`: title "维度规则", description "配置各岗位评分维度和指标"

- [ ] **Step 2: Update card styling in admin pages**

For cards in these pages, ensure:
- `borderRadius: 12`
- `boxShadow: '0 1px 3px rgba(0,0,0,0.04)'`
- Data entry cards: `borderLeft: '3px solid #0ea5e9'`
- Interactive hub cards: add hover effect via `className` or inline `onMouseEnter`/`onMouseLeave` for shadow elevation

- [ ] **Step 3: Verify**

Run: `npm run dev:client`, navigate to admin pages
Expected: Consistent headers across all admin pages with title + description on left, actions on right. Cards have unified border radius and shadow.

- [ ] **Step 4: Commit**

```bash
git add client/src/pages/admin/
git commit -m "feat(ui): standardize admin page headers and card styling"
```

---

### Task 9: Final Verification

- [ ] **Step 1: Run full build**

Run: `npm run build`
Expected: No TypeScript errors, build succeeds.

- [ ] **Step 2: Run dev server and visually verify all pages**

Run: `npm run dev`

Check each page:
- Login page: centered card, gradient login button
- Dashboard: gradient hero, blue progress bars, radar chart
- Rankings: colored ranks, highlighted user row
- Evidence Submit: blue alert, styled form
- Evidence List: styled table, updated empty state
- All admin pages: consistent headers, styled cards
- Sidebar: gradient logo, bottom user info, collapse below 992px

- [ ] **Step 3: Run server tests**

Run: `npm run test`
Expected: All existing tests pass (no backend changes made).

- [ ] **Step 4: Commit any remaining fixes**

```bash
git add -A
git commit -m "fix(ui): final adjustments from visual verification"
```

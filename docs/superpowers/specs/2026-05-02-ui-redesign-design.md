# UI Redesign Design Spec

> Date: 2026-05-02

## Summary

对皇冠赛前端做一轮整体 UI 升级，涵盖视觉主题、布局导航、组件规范和页面细节。风格方向：柔蓝科技风（参考 Linear / Stripe 等 SaaS 产品），浅色背景、天蓝/青绿渐变点缀、轻阴影卡片。

---

## 1. Visual Theme

### 1.1 Color System

| Token | Value | Usage |
|-------|-------|-------|
| `colorPrimary` | `#0ea5e9` | Ant Design primary, buttons, links, active states |
| `colorPrimaryHover` | `#38bdf8` | Hover state |
| `gradientPrimary` | `linear-gradient(135deg, #0ea5e9, #06b6d4)` | Score hero card, key accent areas |
| `bgPage` | `#f8fafc` | Page background |
| `bgCard` | `#ffffff` | Card background |
| `textTitle` | `#0f172a` | Headings, large numbers |
| `textBody` | `#475569` | Body text, labels |
| `textMuted` | `#94a3b8` | Secondary info, timestamps |
| `borderLight` | `#f1f5f9` | Sidebar divider, subtle borders |
| `borderDefault` | `#e2e8f0` | Card borders |
| `shadowCard` | `0 1px 3px rgba(0,0,0,0.04)` | Default card shadow |
| `shadowHover` | `0 4px 12px rgba(0,0,0,0.08)` | Hover elevation |

Semantic colors (unchanged from current):
- Success: `#22c55e` / `#16a34a`
- Warning: `#f59e0b` / `#d97706`
- Error: `#ef4444` / `#dc2626`

Progress bar gradient: `linear-gradient(90deg, #0ea5e9, #38bdf8)` through `#06b6d4` → `#22d3ee` range.

### 1.2 Typography

- Font stack: `Inter, system-ui, -apple-system, sans-serif`
- Page title: 20px, font-weight 600, color `textTitle`
- Section heading: 14px, font-weight 600
- Body text: 13-14px
- Auxiliary text: 11-12px, color `textMuted`

### 1.3 Ant Design ConfigProvider Override

```tsx
<ConfigProvider
  locale={zhCN}
  theme={{
    token: {
      colorPrimary: '#0ea5e9',
      borderRadius: 8,
      fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
    },
  }}
>
```

---

## 2. Layout & Navigation

### 2.1 Sidebar

- Width: 210px (expanded), 60px (collapsed icon mode)
- Collapsible: `breakpoint="lg"`, auto-collapse below 992px
- Logo area: gradient icon (30x30, border-radius 8) + "皇冠赛" text, 28px gap
- Active menu item: `#eff6ff` background + `#0284c7` text + 3px left border in `#0ea5e9`
- Inactive menu item: `#64748b` text, no background
- Admin section separator: 1px border `#f1f5f9`
- Bottom: user avatar (28px circle, `#e0f2fe` bg) + name + role tag

### 2.2 Content Area

- Background: `#f8fafc` (no white container wrapper)
- Padding: `24px 28px`
- Dashboard: `maxWidth: 1100px`, centered
- Admin pages: full width within content area

### 2.3 Header Removal

- Remove the top Header bar entirely
- User info moves to sidebar bottom
- Page title occupies the top of content area

### 2.4 Login Page

- Centered card on `#f8fafc` background
- Logo + "皇冠赛" title (24px/700) + subtitle
- Login button: gradient primary background, white text, `border-radius: 10px`, hover darken
- Card: `max-width: 400px`, `border-radius: 16px`, `box-shadow: 0 8px 30px rgba(0,0,0,0.08)`

---

## 3. Shared Components

### 3.1 Card

All cards follow:
- Background: `#fff`
- Border radius: `12px`
- Shadow: `0 1px 3px rgba(0,0,0,0.04)`
- Padding: `18-20px`
- Hover state for interactive cards: `box-shadow: 0 4px 12px rgba(0,0,0,0.08)`, `transform: translateY(-1px)`

### 3.2 Dimension Card (Dashboard)

- Label: 12px, `#475569`
- Score: 28px/600, `#0f172a`
- Progress bar: 6px height, `#e0f2fe` track, gradient fill
- Weight badge: 11px, `#cbd5e1`

### 3.3 Stats Card (Admin pages)

- Centered layout: label (12px muted) + value (32px/700 primary color)
- For 271 distribution: pill badge `#eff6ff` bg + `#0284c7` text

### 3.4 Table

- Header: `#f8fafc` background, 12px text, `#64748b`
- Row height: 52px
- Zebra stripe: `#fafbfc` on even rows
- Status tags: Ant Design Tag with rounded pill shape

### 3.5 Form

- Input border radius: 8px
- Focus border: `#0ea5e9`
- Label: 13px/500, `#475569`
- Helper text: 11px, `#94a3b8`
- Submit button: gradient primary background

### 3.6 Loading State

- Replace bare `<Spin />` with Ant Design `<Skeleton />`
- Dashboard hero card: `<Skeleton.Input active block />` matching card dimensions
- Dimension grid: `<Skeleton paragraph={{ rows: 4 }} />`

### 3.7 Empty State

- Use Ant Design `<Empty />` with contextual description
- Example: "暂无举证记录，去提交第一条吧" with link to submit page

### 3.8 Error State

- Use Ant Design `<Result status="error" />` with retry button
- Display error message from API response

---

## 4. Page Changes

### 4.1 Dashboard

- **Score Hero Card**: gradient primary background, left: "综合总分" label + large score + breakdown, right: rank pill + 271 badge (white bg + primary text)
- **Dimension Grid**: 2x2 white cards with progress bars, right side: radar chart in white card
- **Indicator Detail**: white card with inline table, rows: indicator name / rule / raw value / score (score colored with primary)

### 4.2 Rankings

- Tabs: Ant Design `Tabs` with primary theme
- Current user row highlight: `#eff6ff` background
- Top 3 rank numbers: gold `#d4a017` / silver `#94a3b8` / bronze `#b45309`
- 271 tag colors: 2 = green pill, 7 = blue pill, 1 = amber pill

### 4.3 Evidence Submit

- AI draft alert: `<Alert type="info" />` with primary blue theme
- Image upload area: dashed border `#cbd5e1`, `border-radius: 12px`
- Visual step flow: season/indicator selection → content form → image upload (no actual step component, just visual grouping with dividers)

### 4.4 Evidence List

- Switch from pure table to card list (each evidence = one card)
- Status tag: pending (orange), approved (green), rejected (red)
- Image thumbnails: grid layout, `border-radius: 8px`, click to preview

### 4.5 Admin Pages (Common)

- Page header: left (title + description text), right (action buttons)
- Data entry cards: `border-left: 3px solid #0ea5e9`
- FeishuManager: extract shared `SyncTab` component to reduce 1745 lines of repetition
- ScoreEntry: add AI draft support (parity with OrgScoreManager)

### 4.6 Sidebar Collapse

- Below 992px: auto-collapse to 60px icon-only mode
- Icons: use existing Ant Design icons from menu items
- Hover/click: overlay full menu panel

---

## 5. Scope & Priority

### Phase 1 (Core visual upgrade)
1. Ant Design theme override (ConfigProvider)
2. Sidebar redesign with collapse
3. Remove Header, move user to sidebar
4. Login page redesign
5. Content area background change
6. Dashboard layout with new cards

### Phase 2 (Component polish)
7. Shared card/skeleton/empty components
8. Table styling update
9. Form styling update
10. Rankings page polish
11. Evidence pages card layout

### Phase 3 (Admin & cleanup)
12. Admin pages header standardization
13. FeishuManager SyncTab extraction
14. ScoreEntry AI draft parity
15. Responsive sidebar collapse

---

## 6. Out of Scope

- No new features or business logic changes
- No backend changes
- No routing changes
- CopilotKit chat popup styling left as-is (third-party component)
- Mobile-specific layouts beyond sidebar collapse (future work)

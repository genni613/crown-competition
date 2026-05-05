# 电子宠物（Desktop Pet）实现指南

本指南从 Open Design 的宠物系统中提取出可复用的实现模式，帮助你在任何 React 项目中实现相同的效果：一个浮在页面上的可拖拽精灵宠物，拥有多状态动画、交互反馈和气泡对话。

---

## 目录

1. [整体架构](#1-整体架构)
2. [精灵图集规范](#2-精灵图集规范)
3. [类型定义](#3-类型定义)
4. [核心组件](#4-核心组件)
   - 4.1 [PetSpriteFace — 精灵渲染器](#41-petspriteface--精灵渲染器)
   - 4.2 [PetOverlay — 浮动叠加层](#42-petoverlay--浮动叠加层)
5. [状态机与交互逻辑](#5-状态机与交互逻辑)
6. [环境动画编排](#6-环境动画编排)
7. [CSS 样式](#7-css-样式)
8. [图片处理](#8-图片处理)
9. [状态持久化](#9-状态持久化)
10. [接入方式](#10-接入方式)

---

## 1. 整体架构

```
┌─────────────────────────────────────────────────────┐
│  App 根节点                                          │
│  ┌─────────────────────────────────────────────────┐ │
│  │  你的应用内容                                     │ │
│  └─────────────────────────────────────────────────┘ │
│  ┌──────────────────┐                                │
│  │  PetOverlay       │  ← fixed 定位，浮在右下角      │
│  │  ┌──────────────┐ │                                │
│  │  │ PetBubble    │ │  ← 气泡对话                    │
│  │  └──────────────┘ │                                │
│  │  ┌──────────────┐ │                                │
│  │  │ PetSpriteFace│ │  ← 精灵渲染（emoji/图集/条带） │
│  │  │   + shadow   │ │                                │
│  │  └──────────────┘ │                                │
│  └──────────────────┘                                │
└─────────────────────────────────────────────────────┘
```

**核心思路**：

- `PetOverlay` 是一个 `position: fixed` 的容器，渲染在 App 根节点最外层
- 精灵使用 `background-image` + `background-position` 实现，不需要 `<canvas>` 或 `<img>`
- 交互状态机驱动图集行切换，不修改图片源
- 所有配置（宠物选择、位置坐标）存 `localStorage`

---

## 2. 精灵图集规范

采用 Codex 标准的 **8 列 × 9 行** 精灵图集格式：

```
总尺寸: 1536 × 1872 px
单元格: 192 × 208 px
格式: PNG 或 WebP（透明背景）
```

9 行动画定义：

| 行索引 | id | 帧数 | FPS | 含义 |
|--------|-----|------|-----|------|
| 0 | `idle` | 6 | 6 | 静止/呼吸 |
| 1 | `running-right` | 8 | 8 | 向右跑 |
| 2 | `running-left` | 8 | 8 | 向左跑 |
| 3 | `waving` | 4 | 6 | 挥手 |
| 4 | `jumping` | 5 | 7 | 跳跃 |
| 5 | `failed` | 8 | 7 | 失败/伤心 |
| 6 | `waiting` | 6 | 6 | 等待/无聊 |
| 7 | `running` | 6 | 8 | 原地跑 |
| 8 | `review` | 6 | 6 | 审视/张望 |

渲染原理：

```
background-size: 800% 900%          ← 整张图缩放到 8 倍宽、9 倍高
background-position-x: frame/(cols-1)*100%   ← 水平选帧
background-position-y: row/(rows-1)*100%     ← 垂直选行
```

如果你的宠物不需要这么多动画，可以自行定义行列数，只需保证 `PetAtlasLayout` 中的 `cols`/`rows` 与实际图集匹配。

---

## 3. 类型定义

```typescript
// 图集中一行的定义
interface PetAtlasRowDef {
  index: number;   // 行索引（从上到下）
  id: string;      // 稳定 id：'idle' | 'waving' | 'running-right' 等
  frames: number;  // 该行实际使用的帧数
  fps: number;     // 播放帧率
}

// 图集布局
interface PetAtlasLayout {
  cols: number;            // 列数
  rows: number;            // 行数
  rowsDef: PetAtlasRowDef[];
}

// 宠物配置
interface PetConfig {
  adopted: boolean;   // 是否已领养
  enabled: boolean;   // 是否显示
  petId: string;      // 'custom' 或内置宠物 id
  custom: PetCustom;
}

interface PetCustom {
  name: string;           // 显示名
  glyph: string;          // emoji（无图时用）
  accent: string;         // 主题色（#hex）
  greeting: string;       // 气泡问候语
  imageUrl?: string;      // 精灵图 data URL
  frames?: number;        // 单行条带模式帧数
  fps?: number;           // 条带帧率
  atlas?: PetAtlasLayout; // 图集模式（优先于条带）
}
```

渲染优先级：`atlas` > `frames > 1`（条带动画）> `imageUrl`（静态图）> `glyph`（纯 emoji）

---

## 4. 核心组件

### 4.1 PetSpriteFace — 精灵渲染器

四种渲染模式，优先级从高到低：

**模式 1：纯 emoji**
```tsx
// 无 imageUrl 时，直接渲染 glyph emoji
<span style={{ fontSize: size * 0.85 }}>{active.glyph}</span>
```

**模式 2：完整图集（Atlas）— 核心模式**
```tsx
// 用 JS setInterval 驱动帧切换（而非 CSS steps()）
// 这样切换行（idle → waving）时可以即时生效

function AtlasSprite({ imageUrl, cols, rows, rowsDef, rowId }) {
  const def = rowsDef.find(r => r.id === rowId) ?? rowsDef[0];
  const [frame, setFrame] = useState(0);

  useEffect(() => {
    setFrame(0); // 切行时重置帧
    const intervalMs = Math.max(16, Math.round(1000 / def.fps));
    const id = setInterval(() => setFrame(f => (f + 1) % def.frames), intervalMs);
    return () => clearInterval(id);
  }, [def.id, def.frames, def.fps]);

  const xPct = cols > 1 ? (frame / (cols - 1)) * 100 : 0;
  const yPct = rows > 1 ? (def.index / (rows - 1)) * 100 : 0;

  return (
    <span style={{
      backgroundImage: `url(${imageUrl})`,
      backgroundSize: `${cols * 100}% ${rows * 100}%`,
      backgroundPosition: `${xPct}% ${yPct}%`,
    }} />
  );
}
```

关键点：
- `setInterval` 驱动而非 CSS `animation`，方便即时切换行
- `background-size` 设为 `${cols * 100}% ${rows * 100}%` 使每个格子精确填充容器
- `background-position` 用百分比偏移选帧/选行

**模式 3：水平条带**
```tsx
// 旧版兼容：一张横排 N 帧图，用 CSS steps() 动画
const durationMs = Math.round((frames / fps) * 1000);
<span style={{
  backgroundImage: `url(${imageUrl})`,
  backgroundSize: `${frames * 100}% 100%`,
  animation: `pet-frames ${durationMs}ms steps(${frames}, jump-none) infinite`,
}} />
```

**模式 4：静态图片**
```tsx
// 单帧 imageUrl，配合 CSS float 动画
<span style={{ backgroundImage: `url(${imageUrl})`, backgroundSize: 'contain' }} />
```

### 4.2 PetOverlay — 浮动叠加层

```
┌─────────────────────────┐
│  PetBubble（气泡对话）    │  ← 点击宠物切换显隐
│  ┌───────────────────┐  │
│  │ 名字 + 台词        │  │
│  │ [设置] [收起]      │  │
│  └───────────────────┘  │
│         ┌─────┐         │
│         │精灵图│         │  ← 96×96px，可拖拽
│         │     │         │
│         └──┬──┘         │
│          阴影            │
└─────────────────────────┘
```

核心职责：
1. **拖拽定位** — `position: fixed` + `right/bottom` 偏移，存 localStorage
2. **交互状态机** — 根据指针事件驱动 `PetInteraction` 状态
3. **环境编排** — 空闲时随机切动画行，保持"活着"的感觉
4. **气泡管理** — 首次出现自动打招呼，点击切换，4 秒自动收起

---

## 5. 状态机与交互逻辑

交互状态定义：

```typescript
type PetInteraction =
  | 'idle'        // 默认
  | 'hover'       // 鼠标悬停
  | 'drag-right'  // 向右拖拽
  | 'drag-left'   // 向左拖拽
  | 'drag-up'     // 向上拖拽
  | 'drag-down'   // 向下拖拽
  | 'waiting';    // 长时间无操作
```

状态到图集行的映射：

```typescript
const INTERACTION_ROW_ID: Record<PetInteraction, string> = {
  idle: 'idle',
  hover: 'waving',
  'drag-right': 'running-right',
  'drag-left': 'running-left',
  'drag-up': 'jumping',
  'drag-down': 'waving',
  waiting: 'waiting',
};
```

行回退链（当图集缺少某行时按顺序降级）：

```typescript
const ROW_FALLBACK_ORDER = ['idle', 'waiting', 'waving', 'running', 'running-right'];
```

### 拖拽方向识别

```typescript
const DRAG_GESTURE_MIN_PX = 14;  // 抖动过滤阈值
const DRAG_AXIS_BIAS = 1.18;     // 主轴占比阈值

function classifyDirection(dx: number, dy: number): Direction | null {
  const absX = Math.abs(dx);
  const absY = Math.abs(dy);
  if (absX < DRAG_GESTURE_MIN_PX && absY < DRAG_GESTURE_MIN_PX) return null;

  if (absX >= absY * DRAG_AXIS_BIAS) {
    return dx > 0 ? 'right' : 'left';
  } else if (absY >= absX * DRAG_AXIS_BIAS) {
    return dy < 0 ? 'up' : 'down';
  }
  return null;  // 斜向拖拽，不切换
}
```

### 状态转换时机

```
pointerdown → 开始记录拖拽数据，重置 waiting 计时
pointermove → 方向超过阈值 → 设为 drag-*
pointerup   → tap(无移动) → 切气泡；有拖拽 → 回到 hover 或 idle
mouseenter  → idle/hover（不覆盖正在拖拽的状态）
mouseleave  → idle（不覆盖正在拖拽的状态）
45 秒无操作  → idle → waiting
```

---

## 6. 环境动画编排

空闲时的"自主行为"，让宠物看起来有生命感：

```
时间线：
[初始等待 4~7s] → [随机动画 1.4~2.3s] → [休息 9~18s] → [随机动画] → [休息] → ...
```

环境动画池（排除 idle/waiting/failed）：

```typescript
const AMBIENT_ROW_POOL = [
  'waving',         // 平静
  'review',         // 平静
  'jumping',        // 活跃
  'running',        // 活跃
  'running-right',  // 活跃
  'running-left',   // 活跃
];
```

关键设计：
- **初始延迟** 4~7 秒，不会一出现就乱动
- **播放时长** 1.4~2.3 秒，够看一个完整循环
- **休息间隔** 9~18 秒，保持"安静"基调，不显得焦躁
- **避免连续重复**：上次播了 `waving`，下次优先选别的
- 用户任何交互（hover/drag）立即取消环境动画，交互结束后重新开始编排

---

## 7. CSS 样式

### 叠加层容器

```css
.pet-overlay {
  position: fixed;
  z-index: 90;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 10px;
  pointer-events: none;  /* 容器不挡点击 */
}
.pet-overlay > * { pointer-events: auto; }  /* 子元素可交互 */
```

### 精灵容器

```css
.pet-sprite {
  width: 96px;
  height: 96px;
  cursor: grab;
  user-select: none;
  touch-action: none;     /* 阻止浏览器默认手势 */
  transition: transform 160ms ease;
}
.pet-sprite:hover {
  transform: translateY(-2px);  /* 微妙上浮 */
}
.pet-sprite:active { cursor: grabbing; }
```

### 精灵动画（emoji / 静态图用）

```css
.pet-sprite-glyph {
  font-size: 52px;
  line-height: 1;
  animation: var(--pet-anim, pet-float) 3.4s ease-in-out infinite;
  filter: drop-shadow(0 1px 0 rgba(0,0,0,0.08));
}

/* 四种可选动画，通过 CSS 变量 --pet-anim 切换 */
@keyframes pet-bounce {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-6px); }
}
@keyframes pet-sway {
  0%, 100% { transform: rotate(-4deg); }
  50% { transform: rotate(4deg); }
}
@keyframes pet-float {
  0%, 100% { transform: translateY(0) rotate(0); }
  50% { transform: translateY(-4px) rotate(2deg); }
}
@keyframes pet-wiggle {
  0%, 100% { transform: rotate(0); }
  25% { transform: rotate(-6deg); }
  75% { transform: rotate(6deg); }
}
```

### 阴影

```css
.pet-sprite-shadow {
  position: absolute;
  bottom: -12px;
  left: 50%;
  width: 64px;
  height: 8px;
  background: rgba(0, 0, 0, 0.18);
  border-radius: 50%;
  filter: blur(4px);
  transform: translateX(-50%);
  animation: pet-shadow 3.4s ease-in-out infinite;
}

@keyframes pet-shadow {
  0%, 100% { transform: translateX(-50%) scale(1); opacity: 0.18; }
  50% { transform: translateX(-50%) scale(0.85); opacity: 0.12; }
}
```

### 图片/图集通用样式

```css
.pet-image {
  display: inline-block;
  background-repeat: no-repeat;
  width: 100%;
  height: 100%;
  image-rendering: pixelated;            /* 像素风友好 */
  image-rendering: -moz-crisp-edges;
}

/* 图集模式的行切换过渡 */
.pet-image.atlas {
  transition: background-position-y 220ms ease;
}

/* 条带模式的关键帧 */
@keyframes pet-frames {
  from { background-position-x: 0%; }
  to { background-position-x: 100%; }
}
```

### 气泡

```css
.pet-bubble {
  max-width: 240px;
  background: var(--bg-panel);
  border: 1px solid var(--pet-accent);
  border-radius: 12px;
  padding: 10px 12px 8px;
  box-shadow: var(--shadow-md);
  font-size: 12.5px;
  position: relative;
  animation: pet-bubble-in 200ms ease-out;
}

/* 气泡小三角 */
.pet-bubble::after {
  content: '';
  position: absolute;
  right: 18px;
  bottom: -6px;
  width: 12px;
  height: 12px;
  background: var(--bg-panel);
  border-right: 1px solid var(--pet-accent);
  border-bottom: 1px solid var(--pet-accent);
  transform: rotate(45deg);
}

@keyframes pet-bubble-in {
  from { opacity: 0; transform: translateY(6px) scale(0.96); }
  to { opacity: 1; transform: translateY(0) scale(1); }
}
```

### 无障碍

```css
@media (prefers-reduced-motion: reduce) {
  .pet-sprite-glyph,
  .pet-sprite-shadow { animation: none !important; }
  .pet-image.frames,
  .pet-image.atlas { animation: none !important; background-position-x: 0% !important; }
}
```

---

## 8. 图片处理

上传图片时的处理策略：

```
文件类型判断：
├── GIF / SVG / 动态 WebP → 直接转 data URL（保留动画帧）
│   └── 检查大小 < 800KB
└── PNG / JPG / 静态 WebP → Canvas 重绘
    └── 最长边缩放到 384px 以内
    └── 导出为 PNG data URL
    └── 检查大小 < 800KB
```

800KB 限制是为了兼容 `localStorage` 的 ~5MB 配额。

### 图集导入处理

当用户上传一张完整图集时：

```typescript
async function prepareCodexAtlas(dataUrl: string): Promise<PreparedAtlas> {
  const img = await loadImage(dataUrl);
  const cellWidth = img.naturalWidth / 8;
  const cellHeight = img.naturalHeight / 9;

  // 缩放到目标单元格高度（默认 80px → 整张图 ~640×720）
  const targetCellHeight = 80;
  const scale = targetCellHeight / cellHeight;

  // 逐格绘制，避免源图 gutter 导致错位
  ctx.imageSmoothingEnabled = false;  // 像素风保持锐利
  for (let r = 0; r < 9; r++) {
    for (let c = 0; c < 8; c++) {
      ctx.drawImage(img,
        c * cellWidth, r * cellHeight, cellWidth, cellHeight,  // 源
        c * targetCellWidth, r * targetCellHeight, targetCellWidth, targetCellHeight  // 目标
      );
    }
  }

  return { dataUrl: canvas.toDataURL('image/png'), layout: CODEX_ATLAS_LAYOUT };
}
```

---

## 9. 状态持久化

### 宠物配置

```typescript
// 存储结构（localStorage）
interface PetConfig {
  adopted: boolean;    // 是否已领养
  enabled: boolean;    // 是否显示
  petId: string;       // 宠物 id
  custom: PetCustom;   // 自定义宠物数据（含 data URL）
}
```

### 拖拽位置

```typescript
// 用 right/bottom 存储而不是 left/top
// 这样窗口缩放时宠物始终贴着右下角
const STORAGE_KEY = 'pet-position';
interface Position {
  right: number;
  bottom: number;
}
```

---

## 10. 接入方式

在 React 项目中接入只需 3 步：

### Step 1: 在 App 根节点渲染

```tsx
// App.tsx
function App() {
  const [petConfig, setPetConfig] = useState<PetConfig>(() =>
    JSON.parse(localStorage.getItem('pet-config') || 'null') ?? DEFAULT_CONFIG
  );

  return (
    <>
      <YourAppContent />
      {petConfig?.adopted && petConfig?.enabled && (
        <PetOverlay
          pet={petConfig}
          onTuck={() => setPetConfig(prev => ({ ...prev, enabled: false }))}
          onOpenSettings={() => { /* 打开设置面板 */ }}
        />
      )}
    </>
  );
}
```

### Step 2: 准备精灵资源

你可以：

1. **用 AI 生成** — 参考 `skills/hatch-pet/` 的 SKILL.md，用图像生成 API 逐行生成精灵，再用 Python 脚本合成图集
2. **手绘/拼贴** — 按上面的 8×9 规范制作 PNG/WebP
3. **最简方案** — 只用 emoji + CSS 动画，不需要任何图片

### Step 3: 最小可用版本

如果你想最快跑起来，以下是纯 emoji 版本的核心代码：

```tsx
function MiniPetOverlay() {
  const [pos, setPos] = useState({ right: 24, bottom: 24 });
  const [bubbleOpen, setBubbleOpen] = useState(true);
  const dragRef = useRef(null);

  useEffect(() => {
    const t = setTimeout(() => setBubbleOpen(false), 4000);
    return () => clearTimeout(t);
  }, []);

  return (
    <div className="pet-overlay" style={{ right: pos.right, bottom: pos.bottom }}>
      {bubbleOpen && (
        <div className="pet-bubble">
          <div className="pet-bubble-name">Buddy</div>
          <div>Hi! I am here whenever you need me.</div>
        </div>
      )}
      <div
        className="pet-sprite"
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          dragRef.current = { startX: e.clientX, startY: e.clientY, startRight: pos.right, startBottom: pos.bottom };
        }}
        onPointerMove={(e) => {
          const drag = dragRef.current;
          if (!drag) return;
          setPos({
            right: Math.max(8, drag.startRight - (e.clientX - drag.startX)),
            bottom: Math.max(8, drag.startBottom - (e.clientY - drag.startY)),
          });
        }}
        onPointerUp={() => {
          const drag = dragRef.current;
          dragRef.current = null;
          if (!drag?.moved) setBubbleOpen(v => !v);
        }}
        onClick={() => setBubbleOpen(v => !v)}
      >
        <span className="pet-sprite-glyph">🦄</span>
        <span className="pet-sprite-shadow" />
      </div>
    </div>
  );
}
```

配合上面的 CSS 即可运行。后续再逐步加入图集动画、状态机、环境编排等高级功能。

---

## 附：设计决策总结

| 决策 | 原因 |
|------|------|
| `background-image` 而非 `<img>` | 图集模式下精确控制帧偏移，不需要裁剪 |
| JS `setInterval` 而非 CSS `steps()` | 图集行切换时能即时生效，不中断动画 |
| `right/bottom` 定位 | 窗口缩放时贴角，不会跑到视口外 |
| `pointer-events: none` 容器 | 不阻挡背后内容的点击 |
| 逐格绘制图集 | 源图可能有 1px gutter，整张绘制会导致错位 |
| `imageSmoothingEnabled = false` | 像素风精灵缩放后保持锐利 |
| 环境动画用 `setTimeout` 而非 `setInterval` | 每次间隔随机化，避免机械感 |
| 800KB data URL 限制 | localStorage ~5MB 配额，留空间给其他配置 |
| `touch-action: none` | 阻止移动端浏览器拦截拖拽手势 |

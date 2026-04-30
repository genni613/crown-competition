# 皇冠赛权限控制说明

## 1. 当前实现

项目当前采用的是一套轻量 RBAC:

- 认证: 飞书 OAuth 登录 + `iron-session`
- 角色: `users.role`，当前只有 `ADMIN` / `MEMBER`
- 服务端校验: `authMiddleware`、`adminMiddleware`
- 前端控制: 根据 `user.role` 决定是否展示后台路由

这套模型适合当前项目阶段，优点是实现简单、成本低、链路清晰。真正的授权判断目前以后端为准，前端只负责页面可见性控制。

## 2. 本次修复

### 修复点

修复了 `GET /api/evidence/:id` 的越权读取问题。

修复前，这个接口只要求“已登录”，没有校验当前登录人是否是该举证的提交者，也没有要求管理员权限。结果是任意已登录用户只要知道举证 ID，就可以读取其他人的举证详情。

### 修复后规则

`GET /api/evidence/:id` 现在要求满足以下任一条件:

- 当前用户是 `ADMIN`
- 当前用户是该条举证所属成员本人

否则返回 `403`.

### 影响范围

- 不影响管理员审核流
- 不影响成员查看自己的举证
- 收紧了成员之间的横向访问权限

## 3. 当前权限边界

### 3.1 已有能力

- `MEMBER`
  - 登录系统
  - 查看排名
  - 提交自己的举证
  - 查看自己的举证
  - 查看自己的分数拆解

- `ADMIN`
  - 拥有全部成员能力
  - 赛季管理
  - 成员管理
  - 分数录入
  - 举证审核
  - 飞书数据同步与查看
  - 组织分管理

### 3.2 当前模型的局限

当前 `ADMIN` / `MEMBER` 两级模型能跑通业务，但扩展性一般，后续会遇到这些问题:

- 无法拆分职责，比如“只审举证”和“只录分”
- 无法限定某个管理员只管理某个赛季
- 无法表达更细的读写边界
- 前端和后端容易继续散落 `role === 'ADMIN'` 判断，后面重构成本会上升

## 4. 推荐的后续演进

建议采用“三层权限模型”:

### 4.1 全局角色

用于系统级能力:

- `SUPER_ADMIN`: 系统配置、管理员提权
- `OPS_ADMIN`: 赛季运营、成员维护、分数录入
- `REVIEWER`: 仅负责举证审核
- `MEMBER`: 普通参赛成员

### 4.2 赛季内角色

单独建表，例如:

```sql
CREATE TABLE season_user_roles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  season_id INTEGER NOT NULL REFERENCES seasons(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL,
  UNIQUE(season_id, user_id, role)
);
```

用于解决“谁能管理哪个赛季”的问题。

### 4.3 资源归属

即 ownership 校验，用来约束成员只能操作自己的数据。

适用对象包括:

- 举证详情
- 举证撤回
- 分数拆解详情
- 未来如果开放“我的组织分申请”，也要走同样规则

## 5. 落地建议

不建议你现在直接上 Casbin 或复杂 ACL。这个项目更适合先做下面这版:

1. 保留现有登录体系
2. 保留数据库中的用户角色字段
3. 把后端权限判断从“是否 ADMIN”逐步改成“是否具备某项能力”
4. 所有成员态资源接口统一补 ownership 校验
5. 前端只做展示控制，后端始终做最终授权

推荐逐步抽出这些通用方法:

- `requireLogin`
- `requireAdmin`
- `requirePermission`
- `requireOwnership`

## 6. 下一步建议

按投入产出比，建议优先做这两步:

1. 统一梳理所有“已登录即可访问”的接口，检查是否需要补本人归属校验
2. 将 `ADMIN/MEMBER` 升级成可扩展的 permission map，避免业务代码继续直接写死角色判断

这样做的好处是改动可控，不会打断你现在的业务，同时为后续细粒度权限留出结构空间。

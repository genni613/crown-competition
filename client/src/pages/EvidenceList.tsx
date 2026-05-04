import { useEffect, useState } from 'react'
import { Card, Empty, Image, Space, Table, Tag, Timeline, Typography, message } from 'antd'
import { FormOutlined, ClockCircleOutlined, CheckCircleOutlined, CloseCircleOutlined } from '@ant-design/icons'
import { useCopilotAction } from '@copilotkit/react-core'
import { getEvidenceDetail, getMyEvidence } from '../api/evidence'
import { copilotConfig } from '../components/copilot/config'
import type { EvidenceReview, EvidenceSubmission } from '../types/models'
import { formatDateTime } from '../utils/datetime'

const statusMap: Record<string, { color: string; label: string; icon: React.ReactNode }> = {
  pending: { color: '#f59e0b', label: '待审核', icon: <ClockCircleOutlined /> },
  approved: { color: '#10b981', label: '已通过', icon: <CheckCircleOutlined /> },
  rejected: { color: '#f43f5e', label: '已驳回', icon: <CloseCircleOutlined /> },
}

export default function EvidenceList() {
  const [data, setData] = useState<EvidenceSubmission[]>([])
  const [detailMap, setDetailMap] = useState<Record<number, EvidenceSubmission>>({})
  const [loading, setLoading] = useState(false)
  const [detailLoadingId, setDetailLoadingId] = useState<number | null>(null)
  const [previewImage, setPreviewImage] = useState<string>('')
  const [previewOpen, setPreviewOpen] = useState(false)

  useCopilotAction(
    copilotConfig.enabled ? {
      name: 'query_my_evidence',
      description: '查询当前用户的所有举证提交及其审核状态，返回汇总统计和详细列表',
      parameters: [],
      handler: async () => {
        try {
          const res = await getMyEvidence()
          return { evidence: res.data }
        } catch (e: any) {
          return { error: e.message || '查询举证失败' }
        }
      },
      render: ({ status, result }: { status: string; result: any }) => {
        if (status === 'executing') return <Typography.Text type="secondary">正在查询举证...</Typography.Text>
        if (!result) return null
        if (result.error) return <Typography.Text type="danger">{result.error}</Typography.Text>

        const list: EvidenceSubmission[] = result.evidence
        if (!list?.length) return <Typography.Text type="secondary">暂无举证记录</Typography.Text>

        const counts = { total: list.length, pending: 0, approved: 0, rejected: 0 }
        list.forEach(e => { if (counts[e.status as keyof typeof counts] !== undefined) (counts as any)[e.status]++ })

        return (
          <Card size="small" style={{ maxWidth: 440, borderRadius: 12 }}>
            <div style={{ display: 'flex', gap: 12, marginBottom: 8 }}>
              <Tag color="#6366f1" style={{ color: '#fff', border: 'none' }}>共 {counts.total} 条</Tag>
              <Tag color="#f59e0b" style={{ color: '#fff', border: 'none' }}>待审核 {counts.pending}</Tag>
              <Tag color="#10b981" style={{ color: '#fff', border: 'none' }}>已通过 {counts.approved}</Tag>
              <Tag color="#f43f5e" style={{ color: '#fff', border: 'none' }}>已驳回 {counts.rejected}</Tag>
            </div>
            <div style={{ maxHeight: 240, overflow: 'auto' }}>
              {list.map(e => (
                <div key={e.id} style={{ padding: '6px 0', borderBottom: '1px solid #f5f3ff', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <Typography.Text style={{ fontSize: 13 }}>{e.title}</Typography.Text>
                    <Typography.Text type="secondary" style={{ fontSize: 11, marginLeft: 8 }}>{e.season_name}</Typography.Text>
                  </div>
                  <Tag color={statusMap[e.status]?.color} style={{ margin: 0, color: '#fff', border: 'none' }}>{statusMap[e.status]?.label}</Tag>
                </div>
              ))}
            </div>
          </Card>
        )
      },
    } : null as any,
  )

  useEffect(() => {
    void loadInitial()
  }, [])

  async function loadInitial() {
    setLoading(true)
    try {
      const evidenceRes = await getMyEvidence()
      setData(evidenceRes.data)
    } catch (error: any) {
      message.error(error.response?.data?.error || '加载举证记录失败')
    } finally {
      setLoading(false)
    }
  }

  async function loadDetail(id: number) {
    if (detailMap[id]) return
    setDetailLoadingId(id)
    try {
      const res = await getEvidenceDetail(id)
      setDetailMap(prev => ({ ...prev, [id]: res.data }))
    } catch (error: any) {
      message.error(error.response?.data?.error || '加载举证详情失败')
    } finally {
      setDetailLoadingId(current => current === id ? null : current)
    }
  }

  const columns = [
    {
      title: '赛季',
      dataIndex: 'season_name',
      render: (value: string | null | undefined) => value || <Typography.Text type="secondary">未知赛季</Typography.Text>,
    },
    { title: '标题', dataIndex: 'title', render: (v: string) => <span style={{ fontWeight: 600, color: '#1e1b4b' }}>{v}</span> },
    { title: '描述', dataIndex: 'description', ellipsis: true, render: (v: string) => <span style={{ color: '#64748b' }}>{v}</span> },
    {
      title: '状态',
      dataIndex: 'status',
      render: (s: string) => {
        const m = statusMap[s]
        return (
          <Tag color={m.color} style={{ color: '#fff', border: 'none', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            {m.icon} {m.label}
          </Tag>
        )
      },
    },
    {
      title: '最新审核意见',
      dataIndex: 'review_comment',
      render: (value: string | null, record: EvidenceSubmission) => {
        if (!value) return <Typography.Text type="secondary">无</Typography.Text>
        return (
          <Typography.Text style={{ fontSize: 13 }}>
            {record.status === 'rejected' ? '驳回原因：' : '通过说明：'}
            {value}
          </Typography.Text>
        )
      },
    },
  ]

  function renderReviewHistory(history: EvidenceReview[] = []) {
    if (history.length === 0) {
      return <Typography.Text type="secondary">暂无审核记录</Typography.Text>
    }

    return (
      <Timeline
        items={history.map(item => ({
          color: item.action === 'approved' ? '#10b981' : '#f43f5e',
          children: (
            <div>
              <Typography.Text strong style={{ color: '#1e1b4b' }}>
                {item.action === 'approved' ? '审核通过' : '审核驳回'}
              </Typography.Text>
              <Typography.Text type="secondary"> {item.reviewer_name || item.reviewer_id}</Typography.Text>
              <div style={{ color: '#475569' }}>
                {item.comment
                  ? (item.action === 'rejected' ? `驳回原因：${item.comment}` : `通过说明：${item.comment}`)
                  : '无审核意见'}
              </div>
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>{formatDateTime(item.created_at)}</Typography.Text>
            </div>
          ),
        }))}
      />
    )
  }

  function renderExpandedRow(record: EvidenceSubmission) {
    const detail = detailMap[record.id] || record
    return (
      <Space direction="vertical" size="middle" style={{ width: '100%' }}>
        <Card size="small" title="举证图片" style={{ borderRadius: 12 }}>
          {detail.attachment_urls?.length ? (
            <Space size={12} wrap>
              {detail.attachment_urls.map((src, index) => (
                <Image
                  key={`${record.id}-${index}`}
                  src={src}
                  width={88}
                  height={88}
                  style={{ objectFit: 'cover', borderRadius: 10, border: '2px solid #eef2ff' }}
                  preview={false}
                  onClick={() => {
                    setPreviewImage(src)
                    setPreviewOpen(true)
                  }}
                />
              ))}
            </Space>
          ) : (
            <Typography.Text type="secondary">未上传图片</Typography.Text>
          )}
        </Card>

        <Card size="small" title="审核历史" loading={detailLoadingId === record.id && !detailMap[record.id]} style={{ borderRadius: 12 }}>
          {renderReviewHistory(detail.review_history)}
        </Card>
      </Space>
    )
  }

  return (
    <div className="anim-fade-in-up">
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
        <div style={{
          width: 36, height: 36, borderRadius: 10,
          background: 'linear-gradient(135deg, #8b5cf6, #ec4899)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: '#fff', fontSize: 18,
          boxShadow: '0 2px 12px rgba(139, 92, 246, 0.3)',
        }}>
          <FormOutlined />
        </div>
        <Typography.Title level={4} style={{ margin: 0, color: '#1e1b4b' }}>我的举证</Typography.Title>
      </div>
      {data.length === 0 ? (
        <Card style={{ borderRadius: 14, border: 'none', padding: '40px 0' }}>
          <Empty description={
            <span style={{ color: '#94a3b8' }}>暂无举证记录，<a href="/evidence/submit" style={{ color: '#6366f1', fontWeight: 600 }}>去提交第一条</a></span>
          } />
        </Card>
      ) : (
        <Card style={{ borderRadius: 14, border: 'none', overflow: 'hidden' }} styles={{ body: { padding: 0 } }}>
          <Table
            dataSource={data}
            columns={columns}
            rowKey="id"
            size="middle"
            loading={loading}
            onRow={() => ({ onMouseEnter: (e) => { (e.currentTarget as HTMLTableRowElement).style.background = '#f5f3ff' }, onMouseLeave: (e) => { (e.currentTarget as HTMLTableRowElement).style.background = '' } })}
            expandable={{
              onExpand: (expanded, record) => {
                if (expanded) {
                  void loadDetail(record.id)
                }
              },
              expandedRowRender: renderExpandedRow,
            }}
          />
        </Card>
      )}

      <Image
        style={{ display: 'none' }}
        preview={{
          visible: previewOpen,
          src: previewImage,
          onVisibleChange: visible => setPreviewOpen(visible),
        }}
      />
    </div>
  )
}

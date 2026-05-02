import { useEffect, useState } from 'react'
import { Button, Card, Image, Input, Modal, Space, Table, Tag, Typography, message } from 'antd'
import { useCopilotAction, useCopilotReadable } from '@copilotkit/react-core'
import { getPendingEvidence, getReviewedEvidence, reviewEvidence } from '../../api/evidence'
import { copilotConfig } from '../../components/copilot/config'
import type { EvidenceSubmission } from '../../types/models'

const statusMap: Record<string, { color: string; label: string }> = {
  pending: { color: 'orange', label: '待审核' },
  approved: { color: 'green', label: '已通过' },
  rejected: { color: 'red', label: '已驳回' },
}

export default function EvidenceReview() {
  const [data, setData] = useState<EvidenceSubmission[]>([])
  const [tab, setTab] = useState<'pending' | 'reviewed'>('pending')
  const [loading, setLoading] = useState(false)
  const [previewImage, setPreviewImage] = useState<string>('')
  const [previewOpen, setPreviewOpen] = useState(false)
  const [rejectOpen, setRejectOpen] = useState(false)
  const [rejectReason, setRejectReason] = useState('')
  const [rejectTargetId, setRejectTargetId] = useState<number | null>(null)
  const [rejectSubmitting, setRejectSubmitting] = useState(false)
  const [resultOpen, setResultOpen] = useState(false)
  const [resultTitle, setResultTitle] = useState('审核结果')
  const [resultContent, setResultContent] = useState('')

  useCopilotAction(
    copilotConfig.enabled ? {
      name: 'query_pending_evidence',
      description: '查询所有待审核的举证提交（仅管理员可用），返回待审核数量和详细信息',
      parameters: [],
      handler: async () => {
        try {
          const res = await getPendingEvidence()
          return { pending: res.data }
        } catch (e: any) {
          return { error: e.message || '查询待审核举证失败' }
        }
      },
      render: ({ status, result }: { status: string; result: any }) => {
        if (status === 'executing') return <Typography.Text type="secondary">正在查询...</Typography.Text>
        if (!result) return null
        if (result.error) return <Typography.Text type="danger">{result.error}</Typography.Text>

        const list: EvidenceSubmission[] = result.pending
        if (!list?.length) return <Typography.Text type="secondary">当前没有待审核的举证</Typography.Text>

        return (
          <Card size="small" style={{ maxWidth: 460 }}>
            <div style={{ marginBottom: 8 }}>
              <Tag color="orange" style={{ fontSize: 13 }}>{list.length} 条待审核</Tag>
            </div>
            <div style={{ maxHeight: 280, overflow: 'auto' }}>
              {list.map(e => (
                <div key={e.id} style={{ padding: '8px 0', borderBottom: '1px solid #fafafa' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Typography.Text strong style={{ fontSize: 13 }}>{e.title}</Typography.Text>
                    <Typography.Text type="secondary" style={{ fontSize: 11 }}>{e.season_name}</Typography.Text>
                  </div>
                  <Typography.Text type="secondary" style={{ fontSize: 12 }}>提交人：{e.user_name || '-'}</Typography.Text>
                  {e.description && (
                    <div><Typography.Text style={{ fontSize: 12 }}>{e.description.length > 60 ? e.description.slice(0, 60) + '...' : e.description}</Typography.Text></div>
                  )}
                </div>
              ))}
            </div>
          </Card>
        )
      },
    } : null as any,
  )

  useEffect(() => {
    void load(tab)
  }, [tab])

  useCopilotReadable(
    copilotConfig.enabled ? {
      description: '用户当前在举证审核页面。如果用户问"有什么要处理的"、"今天要做什么"之类的问题，请优先关注待审核举证',
      value: {
        currentTab: tab,
        pendingCount: tab === 'pending' ? data.length : data.filter(d => d.status === 'pending').length,
      },
    } : null as any,
    [tab, data],
  )

  async function load(view: 'pending' | 'reviewed') {
    setLoading(true)
    try {
      const res = view === 'pending'
        ? await getPendingEvidence()
        : await getReviewedEvidence()
      setData(res.data)
    } catch (error: any) {
      message.error(error.response?.data?.error || (view === 'pending' ? '加载待审核举证失败' : '加载审核记录失败'))
    } finally {
      setLoading(false)
    }
  }

  async function handleReview(id: number, status: 'approved' | 'rejected') {
    if (status === 'approved') {
      try {
        await reviewEvidence(id, 'approved')
        setResultTitle('审核结果')
        setResultContent('已通过')
        setResultOpen(true)
        await load(tab)
      } catch (error: any) {
        message.error(error.response?.data?.error || '审核失败')
      }
      return
    }
  }

  function openRejectModal(id: number) {
    setRejectTargetId(id)
    setRejectReason('')
    setRejectOpen(true)
  }

  async function submitReject() {
    if (!rejectTargetId) return
    const comment = rejectReason.trim()
    if (!comment) {
      message.error('请填写驳回原因')
      return
    }

    setRejectSubmitting(true)
      try {
        await reviewEvidence(rejectTargetId, 'rejected', comment)
        setResultTitle('审核结果')
        setResultContent('已驳回')
        setResultOpen(true)
        await load(tab)
        setRejectOpen(false)
        setRejectTargetId(null)
        setRejectReason('')
    } catch (error: any) {
      message.error(error.response?.data?.error || '审核失败')
    } finally {
      setRejectSubmitting(false)
    }
  }

  const columns = [
    { title: '提交人', dataIndex: 'user_name' },
    { title: '赛季', dataIndex: 'season_name' },
    { title: '标题', dataIndex: 'title' },
    {
      title: '关联指标',
      render: (_: unknown, r: EvidenceSubmission) => {
        const snap = r.snapshot_json as Record<string, unknown> | null
        if (!snap?.target_id || r.target_type !== 'indicator') return <Typography.Text type="secondary">-</Typography.Text>
        const rawVal = snap.raw_value != null ? `（举证值: ${snap.raw_value}）` : ''
        return <Typography.Text style={{ fontSize: 12 }}>{r.title || '指标举证'} {rawVal}</Typography.Text>
      },
    },
    { title: '描述', dataIndex: 'description', ellipsis: true },
    {
      title: '图片',
      dataIndex: 'attachment_urls',
      render: (images: string[] = []) => images.length > 0 ? (
        <Space size={8} wrap>
          {images.map((src, index) => (
            <Image
              key={`${src}-${index}`}
              src={src}
              width={56}
              height={56}
              style={{ objectFit: 'cover', borderRadius: 8 }}
              preview={false}
              onClick={() => {
                setPreviewImage(src)
                setPreviewOpen(true)
              }}
            />
          ))}
        </Space>
      ) : (
        '-'
      ),
    },
    {
      title: '审核意见',
      dataIndex: 'review_comment',
      render: (value: string | null) => value ? value : <Typography.Text type="secondary">无</Typography.Text>,
    },
    { title: '审核人', dataIndex: 'reviewer_name', render: (value: string | null) => value || <Typography.Text type="secondary">-</Typography.Text> },
    {
      title: '审核时间',
      dataIndex: 'reviewed_at',
      render: (value: string | null) => value ? new Date(value).toLocaleString() : <Typography.Text type="secondary">-</Typography.Text>,
    },
    { title: '状态', dataIndex: 'status', render: (s: string) => <Tag color={statusMap[s]?.color}>{statusMap[s]?.label}</Tag> },
    {
      title: '操作',
      render: (_: unknown, r: EvidenceSubmission) => tab === 'pending' && r.status === 'pending' ? (
        <Space>
          <Button size="small" type="primary" onClick={() => { void handleReview(r.id, 'approved') }}>通过</Button>
          <Button size="small" danger onClick={() => openRejectModal(r.id)}>驳回</Button>
        </Space>
      ) : '-',
    },
  ]

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <Typography.Title level={4} style={{ margin: 0, color: '#0f172a' }}>举证审核</Typography.Title>
        </div>
        <Space>
          <Button type={tab === 'pending' ? 'primary' : 'default'} onClick={() => setTab('pending')}>待审核</Button>
          <Button type={tab === 'reviewed' ? 'primary' : 'default'} onClick={() => setTab('reviewed')}>审核记录</Button>
        </Space>
      </div>
      <Table dataSource={data} columns={columns} rowKey="id" loading={loading} size="middle" />
      <Image
        style={{ display: 'none' }}
        preview={{
          visible: previewOpen,
          src: previewImage,
          onVisibleChange: visible => setPreviewOpen(visible),
        }}
      />
      <Modal
        title={(
          <span>
            <span style={{ color: '#ff4d4f', marginRight: 4 }}>*</span>
            驳回原因
          </span>
        )}
        open={rejectOpen}
        onCancel={() => {
          setRejectOpen(false)
          setRejectTargetId(null)
          setRejectReason('')
        }}
        onOk={() => { void submitReject() }}
        okText="驳回"
        cancelText="取消"
        confirmLoading={rejectSubmitting}
      >
        <Input.TextArea
          rows={4}
          autoSize={{ minRows: 4, maxRows: 8 }}
          placeholder="请填写驳回原因"
          value={rejectReason}
          onChange={e => setRejectReason(e.target.value)}
        />
      </Modal>
      <Modal
        title={resultTitle}
        open={resultOpen}
        onOk={() => setResultOpen(false)}
        onCancel={() => setResultOpen(false)}
        okText="确定"
        cancelButtonProps={{ style: { display: 'none' } }}
      >
        {resultContent}
      </Modal>
    </div>
  )
}

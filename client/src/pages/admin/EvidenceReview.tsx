import { useEffect, useState } from 'react'
import { Button, Image, Input, Modal, Space, Table, Tag, Typography, message } from 'antd'
import { getPendingEvidence, getReviewedEvidence, reviewEvidence } from '../../api/evidence'
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

  useEffect(() => {
    void load(tab)
  }, [tab])

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
      <Typography.Title level={4}>举证审核</Typography.Title>
      <Space style={{ marginBottom: 16 }}>
        <Button type={tab === 'pending' ? 'primary' : 'default'} onClick={() => setTab('pending')}>待审核</Button>
        <Button type={tab === 'reviewed' ? 'primary' : 'default'} onClick={() => setTab('reviewed')}>审核记录</Button>
      </Space>
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

import { useEffect, useState } from 'react'
import { Button, Image, Input, Modal, Space, Table, Tag, Typography, message } from 'antd'
import { getPendingEvidence, reviewEvidence } from '../../api/evidence'
import type { EvidenceSubmission } from '../../types/models'

const statusMap: Record<string, { color: string; label: string }> = {
  pending: { color: 'orange', label: '待审核' },
  approved: { color: 'green', label: '已通过' },
  rejected: { color: 'red', label: '已驳回' },
}

export default function EvidenceReview() {
  const [data, setData] = useState<EvidenceSubmission[]>([])
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

  useEffect(() => { void load() }, [])

  async function load() {
    setLoading(true)
    try {
      const res = await getPendingEvidence()
      setData(res.data)
    } catch (error: any) {
      message.error(error.response?.data?.error || '加载待审核举证失败')
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
        await load()
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
      await load()
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
    { title: '状态', dataIndex: 'status', render: (s: string) => <Tag color={statusMap[s]?.color}>{statusMap[s]?.label}</Tag> },
    {
      title: '操作',
      render: (_: unknown, r: EvidenceSubmission) => r.status === 'pending' ? (
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

import { useEffect, useState } from 'react'
import { Card, Empty, Image, Space, Table, Tag, Timeline, Typography, message } from 'antd'
import { getEvidenceDetail, getMyEvidence } from '../api/evidence'
import type { EvidenceReview, EvidenceSubmission } from '../types/models'
import { formatDateTime } from '../utils/datetime'

const statusMap: Record<string, { color: string; label: string }> = {
  pending: { color: 'orange', label: '待审核' },
  approved: { color: 'green', label: '已通过' },
  rejected: { color: 'red', label: '已驳回' },
}

export default function EvidenceList() {
  const [data, setData] = useState<EvidenceSubmission[]>([])
  const [detailMap, setDetailMap] = useState<Record<number, EvidenceSubmission>>({})
  const [loading, setLoading] = useState(false)
  const [detailLoadingId, setDetailLoadingId] = useState<number | null>(null)
  const [previewImage, setPreviewImage] = useState<string>('')
  const [previewOpen, setPreviewOpen] = useState(false)

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
    { title: '标题', dataIndex: 'title' },
    { title: '描述', dataIndex: 'description', ellipsis: true },
    {
      title: '状态',
      dataIndex: 'status',
      render: (s: string) => {
        const m = statusMap[s]
        return <Tag color={m.color}>{m.label}</Tag>
      },
    },
    {
      title: '最新审核意见',
      dataIndex: 'review_comment',
      render: (value: string | null, record: EvidenceSubmission) => {
        if (!value) return <Typography.Text type="secondary">无</Typography.Text>
        return (
          <Typography.Text>
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
          color: item.action === 'approved' ? 'green' : 'red',
          children: (
            <div>
              <Typography.Text strong>
                {item.action === 'approved' ? '审核通过' : '审核驳回'}
              </Typography.Text>
              <Typography.Text type="secondary"> {item.reviewer_name || item.reviewer_id}</Typography.Text>
              <div>
                {item.comment
                  ? (item.action === 'rejected' ? `驳回原因：${item.comment}` : `通过说明：${item.comment}`)
                  : '无审核意见'}
              </div>
              <Typography.Text type="secondary">{formatDateTime(item.created_at)}</Typography.Text>
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
        <Card size="small" title="举证图片">
          {detail.attachment_urls?.length ? (
            <Space size={12} wrap>
              {detail.attachment_urls.map((src, index) => (
                <Image
                  key={`${record.id}-${index}`}
                  src={src}
                  width={88}
                  height={88}
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
            <Typography.Text type="secondary">未上传图片</Typography.Text>
          )}
        </Card>

        <Card size="small" title="审核历史" loading={detailLoadingId === record.id && !detailMap[record.id]}>
          {renderReviewHistory(detail.review_history)}
        </Card>
      </Space>
    )
  }

  return (
    <div>
      <Typography.Title level={4}>我的举证</Typography.Title>
      {data.length === 0 ? (
        <Empty description="暂无举证记录" />
      ) : (
        <Table
          dataSource={data}
          columns={columns}
          rowKey="id"
          size="middle"
          loading={loading}
          expandable={{
            onExpand: (expanded, record) => {
              if (expanded) {
                void loadDetail(record.id)
              }
            },
            expandedRowRender: renderExpandedRow,
          }}
        />
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

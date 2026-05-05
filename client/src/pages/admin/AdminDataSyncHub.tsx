import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button, Card, Empty, Select, Space, Tag, Typography, message } from 'antd'
import { CloudSyncOutlined } from '@ant-design/icons'
import { getSeasons } from '../../api/seasons'
import type { Season } from '../../types/models'
import { formatDate } from '../../utils/datetime'

const statusColors: Record<Season['status'], string> = {
  draft: 'default',
  active: 'green',
  ended: 'red',
}

const statusLabels: Record<Season['status'], string> = {
  draft: '草稿',
  active: '进行中',
  ended: '已结束',
}

export default function AdminDataSyncHub() {
  const navigate = useNavigate()
  const [seasons, setSeasons] = useState<Season[]>([])
  const [selectedSeasonId, setSelectedSeasonId] = useState<number>()

  useEffect(() => {
    void loadData()
  }, [])

  async function loadData() {
    try {
      const res = await getSeasons()
      setSeasons(res.data)
      const activeSeason = res.data.find(item => item.status === 'active')
      setSelectedSeasonId(activeSeason?.id ?? res.data[0]?.id)
    } catch (e) {
      message.error('加载赛季失败')
      console.error(e)
    }
  }

  const selectedSeason = useMemo(
    () => seasons.find(item => item.id === selectedSeasonId),
    [seasons, selectedSeasonId],
  )

  if (seasons.length === 0) {
    return (
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <div>
            <Typography.Title level={4} style={{ margin: 0, color: '#0f172a' }}>数据同步</Typography.Title>
            <Typography.Text style={{ fontSize: 13, color: '#94a3b8' }}>飞书项目数据同步管理</Typography.Text>
          </div>
        </div>
        <Empty description="还没有赛季，先去赛季管理创建赛季" />
      </div>
    )
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <Typography.Title level={4} style={{ margin: 0, color: '#0f172a' }}>数据同步</Typography.Title>
          <Typography.Text style={{ fontSize: 13, color: '#94a3b8' }}>飞书项目数据同步管理</Typography.Text>
        </div>
        <Space wrap>
          <Select
            size="middle"
            value={selectedSeasonId}
            onChange={setSelectedSeasonId}
            options={seasons.map(season => ({
              value: season.id,
              label: season.name,
            }))}
            style={{ width: 180 }}
          />
          {selectedSeason && (
            <Space wrap>
              <Tag
                color={statusColors[selectedSeason.status]}
                style={{ marginInlineEnd: 0, paddingInline: 10, height: 32, lineHeight: '30px', borderRadius: 8 }}
              >
                {statusLabels[selectedSeason.status]}
              </Tag>
              <Tag style={{ marginInlineEnd: 0, paddingInline: 10, height: 32, lineHeight: '30px', borderRadius: 8 }}>
                {formatDate(selectedSeason.start_date)} ~ {formatDate(selectedSeason.end_date)}
              </Tag>
            </Space>
          )}
          <Button onClick={() => navigate('/admin/seasons')}>去赛季管理</Button>
        </Space>
      </div>

      <Card
        hoverable
        size="small"
        title="飞书数据同步"
        extra={<CloudSyncOutlined />}
        style={{ borderRadius: 12, boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}
      >
        <Typography.Paragraph type="secondary" style={{ marginBottom: 12 }}>
          这里进入飞书同步页，处理工时、项目、用户等赛季相关数据同步，不再混在赛季维护动作里。
        </Typography.Paragraph>
        <Button type="primary" onClick={() => selectedSeasonId && navigate(`/admin/feishu/${selectedSeasonId}`)}>
          进入同步页
        </Button>
      </Card>
    </div>
  )
}

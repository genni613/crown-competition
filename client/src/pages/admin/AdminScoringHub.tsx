import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button, Card, Col, Empty, Row, Select, Space, Tag, Typography, message } from 'antd'
import { EditOutlined, CalculatorOutlined } from '@ant-design/icons'
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

export default function AdminScoringHub() {
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
            <Typography.Title level={4} style={{ margin: 0, color: '#0f172a' }}>评分管理</Typography.Title>
            <Typography.Text style={{ fontSize: 13, color: '#94a3b8' }}>岗位分与组织分录入</Typography.Text>
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
          <Typography.Title level={4} style={{ margin: 0, color: '#0f172a' }}>评分管理</Typography.Title>
          <Typography.Text style={{ fontSize: 13, color: '#94a3b8' }}>岗位分与组织分录入</Typography.Text>
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

      <Row gutter={[16, 16]}>
        <Col xs={24} lg={12}>
          <Card
            hoverable
            size="small"
            title="岗位分录入"
            extra={<EditOutlined />}
            style={{ height: '100%', borderRadius: 12, boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}
          >
            <Typography.Paragraph type="secondary" style={{ marginBottom: 12 }}>
              处理产品、设计、研发的管理员录分项。页面内按岗位切换，适合批量录入和重新计算。
            </Typography.Paragraph>
            <Button type="primary" onClick={() => selectedSeasonId && navigate(`/admin/scores/${selectedSeasonId}`)}>
              进入录入
            </Button>
          </Card>
        </Col>
        <Col xs={24} lg={12}>
          <Card
            hoverable
            size="small"
            title="组织分录入"
            extra={<CalculatorOutlined />}
            style={{ height: '100%', borderRadius: 12, boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}
          >
            <Typography.Paragraph type="secondary" style={{ marginBottom: 12 }}>
              给个人录入组织分加减项。页面内先选成员，再点具体规则，适合按人处理。
            </Typography.Paragraph>
            <Button type="primary" onClick={() => selectedSeasonId && navigate(`/admin/org-scores/${selectedSeasonId}`)}>
              进入录入
            </Button>
          </Card>
        </Col>
      </Row>
    </div>
  )
}

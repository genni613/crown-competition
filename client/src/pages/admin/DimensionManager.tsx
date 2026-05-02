import { useEffect, useState } from 'react'
import {
  App,
  Button,
  Card,
  Collapse,
  Form,
  InputNumber,
  Modal,
  Select,
  Space,
  Table,
  Tabs,
  Tag,
  Typography,
} from 'antd'
import { EditOutlined } from '@ant-design/icons'
import { useCopilotAction } from '@copilotkit/react-core'
import { getDimensions, updateDimension } from '../../api/dimensions'
import { copilotConfig } from '../../components/copilot/config'
import type { ScoringDimension } from '../../types/models'

const roleLabels: Record<string, string> = { product: '产品', design: '设计', tech: '技术' }
const sourceColors: Record<string, string> = { feishu: 'green', admin: 'orange', evidence: 'blue' }
const sourceLabels: Record<string, string> = { feishu: '飞书', admin: '录入', evidence: '举证' }

export default function DimensionManager() {
  const { message } = App.useApp()
  const [data, setData] = useState<ScoringDimension[]>([])
  const [loading, setLoading] = useState(true)
  const [editItem, setEditItem] = useState<ScoringDimension | null>(null)
  const [editOpen, setEditOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form] = Form.useForm()

  useEffect(() => { loadData() }, [])

  useCopilotAction(
    copilotConfig.enabled ? {
      name: 'query_dimensions',
      description: '查询评分维度规则，可按岗位筛选，包括维度名、指标名、权重、阈值和扣分规则',
      parameters: [
        { name: 'jobRole', type: 'string', required: false, description: '岗位筛选：product/design/tech，不传则显示全部' },
      ],
      handler: async ({ jobRole }: { jobRole?: string }) => {
        try {
          const res = await getDimensions()
          const filtered = jobRole ? res.data.filter((d: ScoringDimension) => d.job_role === jobRole) : res.data
          return { dimensions: filtered }
        } catch (e: any) {
          return { error: e.message || '查询维度失败' }
        }
      },
      render: ({ status, result }: { status: string; result: any }) => {
        if (status === 'executing') return <Typography.Text type="secondary">正在查询...</Typography.Text>
        if (!result) return null
        if (result.error) return <Typography.Text type="danger">{result.error}</Typography.Text>
        const dims: ScoringDimension[] = result.dimensions
        if (!dims?.length) return <Typography.Text type="secondary">暂无维度规则</Typography.Text>
        const grouped = new Map<string, ScoringDimension[]>()
        dims.forEach(d => {
          const list = grouped.get(d.dimension_name) || []
          list.push(d)
          grouped.set(d.dimension_name, list)
        })
        return (
          <Card size="small" style={{ maxWidth: 480, maxHeight: 320, overflow: 'auto' }}>
            {Array.from(grouped.entries()).map(([dimName, items]) => (
              <div key={dimName} style={{ marginBottom: 8 }}>
                <Typography.Text strong style={{ fontSize: 13 }}>{dimName}</Typography.Text>
                <Tag color="blue" style={{ marginLeft: 6 }}>{(items[0].dimension_weight * 100).toFixed(0)}%</Tag>
                <div style={{ paddingLeft: 8 }}>
                  {items.map(item => (
                    <div key={item.id} style={{ display: 'flex', gap: 8, padding: '2px 0', fontSize: 12 }}>
                      <span>{item.indicator_name}</span>
                      <Tag style={{ margin: 0, fontSize: 11 }}>{(item.indicator_weight * 100).toFixed(0)}%</Tag>
                      <Tag color={sourceColors[item.data_source]} style={{ margin: 0, fontSize: 11 }}>{sourceLabels[item.data_source]}</Tag>
                      {item.threshold_100 != null && <span style={{ color: '#8c8c8c' }}>≥{item.threshold_100}=100</span>}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </Card>
        )
      },
    } : null as any,
  )

  async function loadData() {
    setLoading(true)
    try {
      const res = await getDimensions()
      setData(res.data)
    } catch (err: any) {
      message.error(err?.response?.data?.error || '加载维度失败')
    } finally {
      setLoading(false)
    }
  }

  function openEdit(item: ScoringDimension) {
    setEditItem(item)
    form.setFieldsValue({
      dimension_weight: item.dimension_weight,
      indicator_weight: item.indicator_weight,
      threshold_100: item.threshold_100,
      threshold_60: item.threshold_60,
      deduction_per_unit: item.deduction_per_unit,
      deduction_cap: item.deduction_cap,
      deduction_divisor: item.deduction_divisor,
      sort_order: item.sort_order,
    })
    setEditOpen(true)
  }

  async function onSave() {
    if (!editItem) return
    const values = await form.validateFields()
    const newWeight = values.indicator_weight ?? editItem.indicator_weight

    if (editItem.score_type !== 'deduction' && newWeight != null) {
      const siblings = data.filter(
        d => d.dimension_name === editItem.dimension_name
          && d.job_role === editItem.job_role
          && d.score_type !== 'deduction'
          && d.id !== editItem.id
      )
      const dimWeight = editItem.dimension_weight
      const siblingSum = siblings.reduce((s, d) => s + d.indicator_weight, 0)
      const total = siblingSum + newWeight
      if (Math.abs(total - dimWeight) > 0.01) {
        message.warning(`「${editItem.dimension_name}」指标权重之和应等于纬度权重（${(dimWeight * 100).toFixed(0)}%），当前合计 ${(total * 100).toFixed(0)}%，请调整`)
        return
      }
    }

    setSaving(true)
    try {
      await updateDimension(editItem.id, values)
      message.success('保存成功')
      setEditOpen(false)
      loadData()
    } catch (err: any) {
      message.error(err?.response?.data?.error || '保存失败')
    } finally {
      setSaving(false)
    }
  }

  function buildTab(jobRole: string) {
    const items = data.filter(d => d.job_role === jobRole)
    const dimMap = new Map<string, ScoringDimension[]>()
    for (const item of items) {
      const list = dimMap.get(item.dimension_name) || []
      list.push(item)
      dimMap.set(item.dimension_name, list)
    }

    const panels = Array.from(dimMap.entries()).map(([dimName, indicators]) => ({
      key: dimName,
      label: (
        <span>
          {dimName}
          <Tag color="blue" style={{ marginLeft: 8 }}>
            纬度权重 {(indicators[0].dimension_weight * 100).toFixed(0)}%
          </Tag>
          <Typography.Text type="secondary" style={{ marginLeft: 8, fontSize: 12 }}>
            {indicators.length} 个指标
          </Typography.Text>
        </span>
      ),
      children: (
        <Table
          rowKey="id"
          dataSource={indicators}
          pagination={false}
          size="small"
          columns={[
            {
              title: '指标',
              dataIndex: 'indicator_name',
              width: 220,
            },
            {
              title: '权重',
              dataIndex: 'indicator_weight',
              width: 80,
              render: (v: number) => `${(v * 100).toFixed(0)}%`,
            },
            {
              title: '来源',
              dataIndex: 'data_source',
              width: 70,
              render: (v: string) => <Tag color={sourceColors[v]}>{sourceLabels[v]}</Tag>,
            },
            {
              title: '类型',
              dataIndex: 'score_type',
              width: 80,
              render: (v: string) => (
                <Tag color={v === 'threshold' ? 'default' : 'red'}>
                  {v === 'threshold' ? '阈值' : '扣分'}
                </Tag>
              ),
            },
            {
              title: '100分阈值',
              dataIndex: 'threshold_100',
              width: 100,
              render: (v: number | null) => v ?? <Typography.Text type="secondary">-</Typography.Text>,
            },
            {
              title: '60分阈值',
              dataIndex: 'threshold_60',
              width: 100,
              render: (v: number | null) => v ?? <Typography.Text type="secondary">-</Typography.Text>,
            },
            {
              title: '扣分/单位',
              dataIndex: 'deduction_per_unit',
              width: 90,
              render: (v: number | null) => v ?? <Typography.Text type="secondary">-</Typography.Text>,
            },
            {
              title: '扣分上限',
              dataIndex: 'deduction_cap',
              width: 90,
              render: (v: number | null) => v ?? <Typography.Text type="secondary">-</Typography.Text>,
            },
            {
              title: '排序',
              dataIndex: 'sort_order',
              width: 60,
            },
            {
              title: '操作',
              width: 60,
              render: (_: unknown, record: ScoringDimension) => (
                <Button type="link" size="small" icon={<EditOutlined />} onClick={() => openEdit(record)} />
              ),
            },
          ]}
        />
      ),
    }))

    return <Collapse items={panels} defaultActiveKey={Array.from(dimMap.keys())} />
  }

  const scoreType = Form.useWatch('score_type', form) || editItem?.score_type

  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <Typography.Title level={4} style={{ margin: 0, color: '#0f172a' }}>维度规则</Typography.Title>
          <Typography.Text style={{ fontSize: 13, color: '#94a3b8' }}>配置各岗位评分维度和指标</Typography.Text>
        </div>
      </div>

      <Tabs
        items={['product', 'design', 'tech'].map(role => ({
          key: role,
          label: roleLabels[role],
          children: buildTab(role),
        }))}
      />

      <Modal
        open={editOpen}
        title={editItem ? `编辑: ${editItem.indicator_name}` : ''}
        confirmLoading={saving}
        onOk={onSave}
        onCancel={() => setEditOpen(false)}
        width={520}
      >
        <Form form={form} layout="vertical">
          <Space size={16} style={{ width: '100%' }}>
            <Form.Item name="dimension_weight" label="维度权重" style={{ width: 200 }}>
              <InputNumber min={0} max={1} step={0.05} style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item name="indicator_weight" label="指标权重（纬度内占比）" style={{ width: 200 }}>
              <InputNumber min={0} max={1} step={0.05} style={{ width: '100%' }} />
            </Form.Item>
          </Space>
          <Form.Item name="sort_order" label="排序">
            <InputNumber min={0} style={{ width: 200 }} />
          </Form.Item>

          {(editItem?.score_type === 'threshold' || (!editItem?.deduction_per_unit && editItem?.threshold_100 != null) || (!editItem?.threshold_100 && !editItem?.deduction_per_unit)) && (
            <>
              <Typography.Text strong style={{ display: 'block', marginBottom: 8 }}>阈值评分</Typography.Text>
              <Space size={16}>
                <Form.Item name="threshold_100" label="100分阈值">
                  <InputNumber style={{ width: 200 }} />
                </Form.Item>
                <Form.Item name="threshold_60" label="60分阈值">
                  <InputNumber style={{ width: 200 }} />
                </Form.Item>
              </Space>
            </>
          )}

          {(editItem?.score_type === 'deduction' || editItem?.deduction_per_unit != null) && (
            <>
              <Typography.Text strong style={{ display: 'block', marginBottom: 8 }}>扣分规则</Typography.Text>
              <Space size={16} wrap>
                <Form.Item name="deduction_per_unit" label="每单位扣分">
                  <InputNumber min={0} style={{ width: 140 }} />
                </Form.Item>
                <Form.Item name="deduction_cap" label="扣分上限">
                  <InputNumber min={0} style={{ width: 140 }} />
                </Form.Item>
                <Form.Item name="deduction_divisor" label="除数">
                  <InputNumber min={1} style={{ width: 140 }} />
                </Form.Item>
              </Space>
            </>
          )}
        </Form>
      </Modal>
    </Space>
  )
}

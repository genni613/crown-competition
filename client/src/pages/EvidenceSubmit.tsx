import { useState, useEffect } from 'react'
import { Form, Input, Select, Button, message, Card, Typography } from 'antd'
import { getSeasons, getMembers } from '../api/seasons'
import { submitEvidence } from '../api/evidence'
import { useAuthStore } from '../store/authStore'
import type { Season, SeasonMember } from '../types/models'

export default function EvidenceSubmit() {
  const { user } = useAuthStore()
  const [seasons, setSeasons] = useState<Season[]>([])
  const [members, setMembers] = useState<SeasonMember[]>([])
  const [membershipReady, setMembershipReady] = useState(false)
  const [form] = Form.useForm()
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    getSeasons().then(res => setSeasons(res.data))
  }, [])

  async function onSeasonChange(seasonId: number) {
    const res = await getMembers(seasonId)
    setMembers(res.data)
    const me = res.data.find((m: SeasonMember) => m.user_id === user?.id)
    if (me) {
      form.setFieldValue('season_member_id', me.id)
      setMembershipReady(true)
      return
    }

    form.setFieldValue('season_member_id', undefined)
    setMembershipReady(false)
    message.warning('你还没有加入这个赛季，当前不能提交举证')
  }

  async function onFinish(values: any) {
    if (!values.season_member_id) {
      message.error('你还不是该赛季成员，无法提交举证')
      return
    }
    setLoading(true)
    try {
      await submitEvidence(values)
      message.success('提交成功')
      form.resetFields()
      setMembershipReady(false)
    } catch (error: any) {
      message.error(error.response?.data?.error || '提交失败')
    } finally {
      setLoading(false)
    }
  }

  const activeSeason = seasons.find(s => s.status === 'active')

  return (
    <Card title="提交举证">
      <Form form={form} layout="vertical" onFinish={onFinish}>
        <Form.Item label="赛季" name="season_id" rules={[{ required: true }]}>
          <Select onChange={onSeasonChange} placeholder="选择赛季">
            {seasons.filter(s => s.status === 'active').map(s => (
              <Select.Option key={s.id} value={s.id}>{s.name}</Select.Option>
            ))}
          </Select>
        </Form.Item>
        <Form.Item name="season_member_id" hidden><Input /></Form.Item>
        <Form.Item label="目标类型" name="target_type" initialValue="indicator">
          <Select>
            <Select.Option value="indicator">指标举证</Select.Option>
            <Select.Option value="org_score">组织分举证</Select.Option>
          </Select>
        </Form.Item>
        <Form.Item label="标题" name="title" rules={[{ required: true }]}>
          <Input placeholder="举证标题" />
        </Form.Item>
        <Form.Item label="一句话描述" name="description" rules={[{ required: true, message: '请用一句话概括你的成果，方便系统自动匹配得分点' }]}>
          <Input.TextArea rows={2} placeholder="例如：本季度完成了3个AI工具——自动日报生成器、代码review机器人、数据看板自动刷新" maxLength={200} showCount />
        </Form.Item>
        <Form.Item>
          <Button type="primary" htmlType="submit" loading={loading} disabled={!membershipReady}>
            提交
          </Button>
        </Form.Item>
      </Form>
    </Card>
  )
}

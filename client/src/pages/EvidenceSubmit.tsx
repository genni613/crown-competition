import { useEffect, useMemo, useState } from 'react'
import { Button, Card, Form, Image, Input, InputNumber, Modal, Select, Space, Upload, message } from 'antd'
import type { RcFile, UploadFile } from 'antd/es/upload/interface'
import { PlusOutlined } from '@ant-design/icons'
import { getSeasons, getMembers } from '../api/seasons'
import { submitEvidence, uploadEvidenceAttachment } from '../api/evidence'
import { getDimensions } from '../api/scoring'
import { useAuthStore } from '../store/authStore'
import type { Season, SeasonMember, ScoringDimension } from '../types/models'

const supportedImageMimeTypes = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
])

const supportedImageExtensions = ['.jpg', '.jpeg', '.png', '.webp', '.gif']

function readFileAsDataUrl(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result || ''))
    reader.onerror = () => reject(new Error('图片读取失败'))
    reader.readAsDataURL(file)
  })
}

function isSupportedPreviewImage(file: RcFile) {
  const fileName = file.name.toLowerCase()
  return supportedImageMimeTypes.has(file.type) || supportedImageExtensions.some(ext => fileName.endsWith(ext))
}

export default function EvidenceSubmit() {
  const { user } = useAuthStore()
  const [seasons, setSeasons] = useState<Season[]>([])
  const [membershipReady, setMembershipReady] = useState(false)
  const [fileList, setFileList] = useState<UploadFile[]>([])
  const [previewImage, setPreviewImage] = useState<string>('')
  const [previewOpen, setPreviewOpen] = useState(false)
  const [resultOpen, setResultOpen] = useState(false)
  const [resultTitle, setResultTitle] = useState('提交结果')
  const [resultContent, setResultContent] = useState('')
  const [form] = Form.useForm()
  const [loading, setLoading] = useState(false)
  const [evidenceDimensions, setEvidenceDimensions] = useState<ScoringDimension[]>([])
  const [memberJobRole, setMemberJobRole] = useState<string | null>(null)
  const [selectedDimensionId, setSelectedDimensionId] = useState<number | undefined>()

  useEffect(() => {
    getSeasons().then(res => setSeasons(res.data))
  }, [])

  async function onSeasonChange(seasonId: number) {
    const res = await getMembers(seasonId)
    const me = res.data.find((m: SeasonMember) => m.user_key === user?.user_key)
    if (me) {
      form.setFieldValue('season_member_id', me.id)
      setMembershipReady(true)
      setMemberJobRole(me.job_role || null)
      if (me.job_role) {
        try {
          const dimRes = await getDimensions(me.job_role)
          setEvidenceDimensions(dimRes.data.filter((d: ScoringDimension) => d.data_source === 'evidence'))
        } catch { setEvidenceDimensions([]) }
      }
      return
    }

    form.setFieldValue('season_member_id', undefined)
    setMembershipReady(false)
    setMemberJobRole(null)
    setEvidenceDimensions([])
    setResultTitle('提示')
    setResultContent('你还没有加入这个赛季，当前不能提交举证。')
    setResultOpen(true)
  }

  async function handlePreview(file: UploadFile) {
    if (file.url) {
      setPreviewImage(file.url)
      setPreviewOpen(true)
      return
    }

    if (file.thumbUrl) {
      setPreviewImage(file.thumbUrl)
      setPreviewOpen(true)
      return
    }

    const origin = file.originFileObj
    if (!origin) return
    const dataUrl = await readFileAsDataUrl(origin)
    setPreviewImage(dataUrl)
    setPreviewOpen(true)
  }

  async function handleFileListChange(nextFileList: UploadFile[]) {
    const normalized = await Promise.all(
      nextFileList.slice(0, 5).map(async (file) => {
        if (file.url || file.thumbUrl || !file.originFileObj) {
          return file
        }

        const dataUrl = await readFileAsDataUrl(file.originFileObj)
        return {
          ...file,
          thumbUrl: dataUrl,
        }
      })
    )

    setFileList(normalized)
  }

  async function onFinish(values: {
    season_member_id: number
    target_type: string
    target_id?: number
    raw_value?: number
    title: string
    description: string
  }) {
    if (!values.season_member_id) {
      setResultTitle('提交失败')
      setResultContent('你还不是该赛季成员，无法提交举证。')
      setResultOpen(true)
      return
    }

    if (fileList.length === 0) {
      message.warning('请至少上传一张举证图片')
      return
    }

    setLoading(true)
    try {
      const attachmentUrls = await Promise.all(
        fileList
          .map(file => file.originFileObj)
          .filter((file): file is RcFile => Boolean(file))
          .map(async (file) => {
            const res = await uploadEvidenceAttachment(file)
            return res.data.url
          })
      )

      await submitEvidence({
        ...values,
        attachment_urls: attachmentUrls,
      })

      setResultTitle('提交结果')
      setResultContent('举证已提交，等待管理员审核。')
      setResultOpen(true)
      form.resetFields()
      setFileList([])
      setMembershipReady(false)
    } catch (error: any) {
      setResultTitle('提交失败')
      setResultContent(error.response?.data?.error || '提交失败')
      setResultOpen(true)
    } finally {
      setLoading(false)
    }
  }

  const activeSeasons = useMemo(() => seasons.filter(s => s.status === 'active'), [seasons])

  return (
    <Card title="提交举证">
      <Space direction="vertical" size="middle" style={{ width: '100%' }}>
        <Form form={form} layout="vertical" onFinish={onFinish}>
          <Form.Item label="赛季" name="season_id" rules={[{ required: true, message: '请选择赛季' }]}>
            <Select onChange={onSeasonChange} placeholder="选择赛季">
              {activeSeasons.map(s => (
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
          {evidenceDimensions.length > 0 && (
            <Form.Item label="关联指标" name="target_id" rules={[{ required: true, message: '请选择举证指标' }]}>
              <Select placeholder="选择要举证的指标" onChange={(val: number) => setSelectedDimensionId(val)}>
                {evidenceDimensions.map(d => (
                  <Select.Option key={d.id} value={d.id}>
                    {d.dimension_name} — {d.indicator_name}
                    {d.threshold_100 != null && d.threshold_60 != null && (
                      <span style={{ color: '#999', marginLeft: 8 }}>
                        (满分≥{d.threshold_100}，及格≥{d.threshold_60})
                      </span>
                    )}
                  </Select.Option>
                ))}
              </Select>
            </Form.Item>
          )}
          {evidenceDimensions.length > 0 && (() => {
            const selectedDim = evidenceDimensions.find(d => d.id === selectedDimensionId)
            const indicatorName = selectedDim?.indicator_name || ''
            const isLikes = indicatorName.includes('点赞')
            return (
              <>
                <Form.Item label="举证数值" name="raw_value" rules={[{ required: true, message: '请输入举证数值' }]}>
                  <InputNumber min={0} style={{ width: '100%' }} placeholder={isLikes ? '例如：获得 10 个赞，填 10' : '例如：解决了 3 个问题，填 3'} />
                </Form.Item>
                <Form.Item label="标题" name="title" rules={[{ required: true, message: '请输入标题' }]}>
                  <Input placeholder="举证标题" />
                </Form.Item>
                <Form.Item
                  label="一句话描述"
                  name="description"
                  rules={[{ required: true, message: '请用一句话概括你的成果，方便系统自动匹配得分点' }]}
                >
                  <Input.TextArea
                    rows={2}
                    placeholder={isLikes
                      ? '例如：本季度在微社区因日常协作互助获得同事点赞，累计 10 个'
                      : '例如：本季度完成了3个AI工具——自动日报生成器、代码review机器人、数据看板自动刷新'}
                    maxLength={200}
                    showCount
                  />
                </Form.Item>
              </>
            )
          })()}
          <Form.Item
            label="举证图片"
            required
            extra="仅支持 JPG、PNG、WEBP、GIF，最多 5 张，单张不超过 5MB。"
          >
            <Upload
              accept="image/*"
              listType="picture-card"
              fileList={fileList}
              openFileDialogOnClick
              style={{ pointerEvents: 'auto' }}
              customRequest={({ onSuccess }) => { onSuccess?.('ok') }}
              beforeUpload={(file) => {
                const isImage = file.type.startsWith('image/')
                if (!isImage) {
                  message.error('只能上传图片文件')
                  return Upload.LIST_IGNORE
                }
                const isSupported = isSupportedPreviewImage(file)
                if (!isSupported) {
                  message.error('当前仅支持 JPG、PNG、WEBP、GIF。HEIC 请先转换后再上传。')
                  return Upload.LIST_IGNORE
                }
                const isLt5M = file.size / 1024 / 1024 < 5
                if (!isLt5M) {
                  message.error('图片不能超过 5MB')
                  return Upload.LIST_IGNORE
                }
                return true
              }}
              onPreview={handlePreview}
              onChange={({ fileList: nextFileList }) => {
                void handleFileListChange(nextFileList)
              }}
            >
              {fileList.length >= 5 ? null : (
                <div>
                  <PlusOutlined />
                  <div style={{ marginTop: 8 }}>上传</div>
                </div>
              )}
            </Upload>
          </Form.Item>
          <Form.Item>
            <Button type="primary" htmlType="submit" loading={loading} disabled={!membershipReady || fileList.length === 0}>
              提交
            </Button>
          </Form.Item>
        </Form>
      </Space>

      <Image
        style={{ display: 'none' }}
        preview={{
          visible: previewOpen,
          src: previewImage,
          onVisibleChange: visible => setPreviewOpen(visible),
        }}
      />
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
    </Card>
  )
}

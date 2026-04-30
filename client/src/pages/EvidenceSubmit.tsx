import { useEffect, useMemo, useState } from 'react'
import { Button, Card, Form, Image, Input, Modal, Select, Space, Upload, message } from 'antd'
import type { RcFile, UploadFile } from 'antd/es/upload/interface'
import { PlusOutlined } from '@ant-design/icons'
import { getSeasons, getMembers } from '../api/seasons'
import { submitEvidence, uploadEvidenceAttachment } from '../api/evidence'
import { useAuthStore } from '../store/authStore'
import type { Season, SeasonMember } from '../types/models'

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

  useEffect(() => {
    getSeasons().then(res => setSeasons(res.data))
  }, [])

  async function onSeasonChange(seasonId: number) {
    const res = await getMembers(seasonId)
    const me = res.data.find((m: SeasonMember) => m.user_id === user?.id)
    if (me) {
      form.setFieldValue('season_member_id', me.id)
      setMembershipReady(true)
      return
    }

    form.setFieldValue('season_member_id', undefined)
    setMembershipReady(false)
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
    title: string
    description: string
  }) {
    if (!values.season_member_id) {
      setResultTitle('提交失败')
      setResultContent('你还不是该赛季成员，无法提交举证。')
      setResultOpen(true)
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
              placeholder="例如：本季度完成了3个AI工具——自动日报生成器、代码review机器人、数据看板自动刷新"
              maxLength={200}
              showCount
            />
          </Form.Item>
          <Form.Item
            label="举证图片"
            extra="仅支持 JPG、PNG、WEBP、GIF，最多 5 张，单张不超过 5MB。"
          >
            <Upload
              accept="image/*"
              listType="picture-card"
              fileList={fileList}
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
                return false
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
            <Button type="primary" htmlType="submit" loading={loading} disabled={!membershipReady}>
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

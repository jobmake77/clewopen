import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Form, Input, Select, Upload, Button, Tag, message } from 'antd'
import { UploadOutlined, PlusOutlined } from '@ant-design/icons'
import { uploadAgent } from '../../services/agentService'
import './index.css'

const { TextArea } = Input
const { Option } = Select

const UploadAgent = () => {
  const navigate = useNavigate()
  const [form] = Form.useForm()
  const [loading, setLoading] = useState(false)
  const [fileList, setFileList] = useState([])
  const [tags, setTags] = useState([])
  const [inputTag, setInputTag] = useState('')

  const categories = [
    { value: 'development', label: '开发工具' },
    { value: 'data-analysis', label: '数据分析' },
    { value: 'automation', label: '自动化' },
    { value: 'content', label: '内容创作' },
    { value: 'business', label: '商业分析' },
    { value: 'education', label: '教育培训' },
    { value: 'other', label: '其他' }
  ]

  const handleFileChange = ({ fileList: newFileList }) => {
    if (newFileList.length > 0) {
      const file = newFileList[0].originFileObj || newFileList[0]
      if (file.size > 50 * 1024 * 1024) {
        message.error('文件大小不能超过 50MB')
        return
      }
    }
    setFileList(newFileList)
  }

  const handleAddTag = () => {
    if (inputTag && !tags.includes(inputTag)) {
      setTags([...tags, inputTag])
      setInputTag('')
    }
  }

  const handleRemoveTag = (removedTag) => {
    setTags(tags.filter(tag => tag !== removedTag))
  }

  const handleSubmit = async (values) => {
    if (fileList.length === 0) {
      message.error('请上传 Agent 包文件')
      return
    }

    setLoading(true)

    try {
      const formData = new FormData()
      formData.append('package', fileList[0].originFileObj)
      formData.append('name', values.name)
      formData.append('description', values.description)
      formData.append('category', values.category)
      formData.append('version', values.version)
      formData.append('publish_mode', values.publish_mode)

      // 处理标签
      formData.append('tags', JSON.stringify(tags))

      const response = await uploadAgent(formData)

      if (response.success) {
        message.success(response.message || 'Agent 上传成功，等待审核')
        navigate('/user')
      }
    } catch (error) {
      message.error(error.response?.data?.error || '上传失败')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="upload-agent-container">
      <div className="upload-agent-content">
        <p className="section-label">Publish Agent</p>
        <h1>发布 Agent</h1>
        <p className="subtitle">将您的专业能力打包为 Agent，分享给更多用户</p>

        <Form
          form={form}
          layout="vertical"
          onFinish={handleSubmit}
          initialValues={{ publish_mode: 'open' }}
        >
          <Form.Item
            label="Agent 名称"
            name="name"
            rules={[{ required: true, message: '请输入 Agent 名称' }]}
          >
            <Input placeholder="例如：Python 代码审查助手" />
          </Form.Item>

          <Form.Item
            label="Agent 描述"
            name="description"
            rules={[{ required: true, message: '请输入 Agent 描述' }]}
          >
            <TextArea
              rows={4}
              placeholder="详细描述您的 Agent 功能、特点和使用场景"
            />
          </Form.Item>

          <Form.Item
            label="分类"
            name="category"
            rules={[{ required: true, message: '请选择分类' }]}
          >
            <Select placeholder="选择 Agent 分类">
              {categories.map(cat => (
                <Option key={cat.value} value={cat.value}>
                  {cat.label}
                </Option>
              ))}
            </Select>
          </Form.Item>

          <Form.Item
            label="版本号"
            name="version"
            rules={[{ required: true, message: '请输入版本号' }]}
          >
            <Input placeholder="例如：1.0.0" />
          </Form.Item>

          <Form.Item
            label="发布模式"
            name="publish_mode"
            rules={[{ required: true, message: '请选择发布模式' }]}
            extra="公开分发可直接安装；商业分发将通过受控安装命令分发。"
          >
            <Select>
              <Option value="open">公开分发</Option>
              <Option value="commercial">商业分发</Option>
            </Select>
          </Form.Item>

          <Form.Item label="标签">
            <div className="tags-input">
              <div className="tags-list">
                {tags.map(tag => (
                  <Tag
                    key={tag}
                    closable
                    onClose={() => handleRemoveTag(tag)}
                  >
                    {tag}
                  </Tag>
                ))}
              </div>
              <div className="tag-input-group">
                <Input
                  value={inputTag}
                  onChange={(e) => setInputTag(e.target.value)}
                  onPressEnter={handleAddTag}
                  placeholder="输入标签后按回车"
                  style={{ width: 200 }}
                />
                <Button
                  type="dashed"
                  onClick={handleAddTag}
                  icon={<PlusOutlined />}
                >
                  添加标签
                </Button>
              </div>
            </div>
          </Form.Item>

          <Form.Item
            label="Agent 包文件"
            required
            extra="请上传 .zip 格式的 Agent 包，大小不超过 50MB"
          >
            <Upload
              fileList={fileList}
              onChange={handleFileChange}
              beforeUpload={() => false}
              accept=".zip"
              maxCount={1}
            >
              <Button icon={<UploadOutlined />}>选择文件</Button>
            </Upload>
          </Form.Item>

          <Form.Item>
            <Button
              type="primary"
              htmlType="submit"
              loading={loading}
              size="large"
              block
            >
              提交审核
            </Button>
          </Form.Item>
        </Form>
      </div>
    </div>
  )
}

export default UploadAgent

import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Form, Input, Select, Upload, Button, Tag, message } from 'antd'
import { UploadOutlined, PlusOutlined } from '@ant-design/icons'
import { uploadMcp } from '../../services/mcpService'
import '../UploadAgent/index.css'

const { TextArea } = Input
const { Option } = Select

const UploadMcp = () => {
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
      message.error('请上传 MCP 包文件')
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
      formData.append('tags', JSON.stringify(tags))

      const response = await uploadMcp(formData)
      if (response.success) {
        message.success('MCP 上传成功，等待审核')
        navigate('/mcps')
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
        <p className="section-label">Publish MCP</p>
        <h1>发布 MCP</h1>
        <p className="subtitle">将您的 MCP 服务包发布到 MCP 库，供 Agent 接入外部能力</p>

      <Form form={form} layout="vertical" onFinish={handleSubmit}>
        <Form.Item label="MCP 名称" name="name" rules={[{ required: true, message: '请输入 MCP 名称' }]}>
          <Input placeholder="例如：github-mcp-server" />
        </Form.Item>

        <Form.Item label="MCP 描述" name="description" rules={[{ required: true, message: '请输入 MCP 描述' }]}>
          <TextArea rows={4} placeholder="详细描述您的 MCP 服务功能、特点和使用场景" />
        </Form.Item>

        <Form.Item label="分类" name="category" rules={[{ required: true, message: '请选择分类' }]}>
          <Select placeholder="选择 MCP 分类">
            {categories.map(cat => <Option key={cat.value} value={cat.value}>{cat.label}</Option>)}
          </Select>
        </Form.Item>

        <Form.Item label="版本号" name="version" rules={[{ required: true, message: '请输入版本号' }]}>
          <Input placeholder="例如：1.0.0" />
        </Form.Item>

        <Form.Item label="标签">
          <div className="tags-input">
            <div className="tags-list">
              {tags.map(tag => <Tag key={tag} closable onClose={() => handleRemoveTag(tag)}>{tag}</Tag>)}
            </div>
            <div className="tag-input-group">
              <Input value={inputTag} onChange={(e) => setInputTag(e.target.value)} onPressEnter={handleAddTag} placeholder="输入标签后按回车" style={{ width: 200 }} />
              <Button type="dashed" onClick={handleAddTag} icon={<PlusOutlined />}>添加标签</Button>
            </div>
          </div>
        </Form.Item>

        <Form.Item label="MCP 包文件" required extra="请上传 .zip 格式的 MCP 包，大小不超过 50MB">
          <Upload fileList={fileList} onChange={handleFileChange} beforeUpload={() => false} accept=".zip" maxCount={1}>
            <Button icon={<UploadOutlined />}>选择文件</Button>
          </Upload>
        </Form.Item>

        <Form.Item>
          <Button type="primary" htmlType="submit" loading={loading} size="large" block>提交审核</Button>
        </Form.Item>
      </Form>
      </div>
    </div>
  )
}

export default UploadMcp

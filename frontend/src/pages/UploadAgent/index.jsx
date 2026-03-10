import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Form, Input, Select, Upload, Button, InputNumber, Tag, message } from 'antd'
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

  const priceTypes = [
    { value: 'free', label: '免费' },
    { value: 'one-time', label: '一次性购买' },
    { value: 'subscription', label: '订阅制' }
  ]

  const handleFileChange = ({ fileList: newFileList }) => {
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

      // 处理价格
      const price = {
        type: values.priceType,
        amount: values.priceType === 'free' ? 0 : values.amount || 0
      }
      formData.append('price', JSON.stringify(price))

      // 处理标签
      formData.append('tags', JSON.stringify(tags))

      const response = await uploadAgent(formData)

      if (response.success) {
        message.success('Agent 上传成功，等待审核')
        navigate('/user-center')
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
        <h1>发布 Agent</h1>
        <p className="subtitle">将您的专业能力打包为 Agent，分享给更多用户</p>

        <Form
          form={form}
          layout="vertical"
          onFinish={handleSubmit}
          initialValues={{ priceType: 'free' }}
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
            label="定价类型"
            name="priceType"
            rules={[{ required: true, message: '请选择定价类型' }]}
          >
            <Select>
              {priceTypes.map(type => (
                <Option key={type.value} value={type.value}>
                  {type.label}
                </Option>
              ))}
            </Select>
          </Form.Item>

          <Form.Item
            noStyle
            shouldUpdate={(prevValues, currentValues) =>
              prevValues.priceType !== currentValues.priceType
            }
          >
            {({ getFieldValue }) =>
              getFieldValue('priceType') !== 'free' ? (
                <Form.Item
                  label="价格（元）"
                  name="amount"
                  rules={[{ required: true, message: '请输入价格' }]}
                >
                  <InputNumber
                    min={0}
                    precision={2}
                    style={{ width: '100%' }}
                    placeholder="输入价格"
                  />
                </Form.Item>
              ) : null
            }
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


# AI 智能助手

一个简洁的 AI 聊天界面前端，直接连接你的 Flask 后端接口。

## 文件结构

```
├── index.html      # 主页面
├── styles.css      # 样式文件
├── app.js          # 应用逻辑
├── config.js       # API配置
└── README.md       # 说明文档
```

## 快速开始

### 1. 配置后端 API

编辑 `config.js`：
```javascript
const API_CONFIG = {
    baseUrl: 'http://your-flask-api.com/chat',  // 替换为你的接口地址
    timeout: 60000
};
```

### 2. 启动前端

```bash
# Python 方式
python -m http.server 8000

# 然后访问 http://localhost:8000
```

## 后端接口要求

### 请求格式 (POST)
```json
{
    "messages": [
        {"role": "user", "content": "你好"},
        {"role": "assistant", "content": "你好，有什么帮助？"}
    ]
}
```

### 支持的响应格式

**格式一（OpenAI兼容）：**
```json
{"choices": [{"message": {"content": "回复内容"}}]}
```

**格式二：**
```json
{"content": "回复内容"}
```

**格式三：**
```json
{"text": "回复内容"}
```

**格式四：**
```json
{"result": "回复内容"}
```

**格式五（直接返回文本）：**
```json
"回复内容"
```

## 功能特点

- 🌙 自动适应亮色/暗色模式
- 📱 响应式设计，支持移动端
- 💾 本地保存对话历史
- 📋 代码高亮和复制功能
- ⌨️ Shift+Enter 换行，Enter 发送

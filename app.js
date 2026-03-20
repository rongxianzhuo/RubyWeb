/**
 * AI 聊天应用主逻辑
 * 支持 Markdown 渲染
 */

class ChatApp {
    constructor() {
        // DOM 元素
        this.chatMessages = document.getElementById('chatMessages');
        this.chatInput = document.getElementById('chatInput');
        this.sendBtn = document.getElementById('sendBtn');
        this.toast = document.getElementById('toast');
        this.toastMessage = document.getElementById('toastMessage');
        this.welcomeContainer = document.querySelector('.welcome-container');

        // 应用状态
        this.isLoading = false;
        this.messageHistory = [];

        // 初始化
        this.init();
    }

    init() {
        this.bindEvents();
        this.loadHistory();
    }

    // 绑定事件
    bindEvents() {
        this.sendBtn.addEventListener('click', () => this.sendMessage());
        this.chatInput.addEventListener('keydown', (e) => this.handleKeyDown(e));
        this.chatInput.addEventListener('input', () => this.autoResizeTextarea());
    }

    handleKeyDown(e) {
        // Shift + Enter 发送，Enter 换行
        if (e.key === 'Enter' && e.shiftKey) {
            e.preventDefault();
            this.sendMessage();
        }
    }

    autoResizeTextarea() {
        this.chatInput.style.height = 'auto';
        this.chatInput.style.height = Math.min(this.chatInput.scrollHeight, 150) + 'px';
    }

    // 发送消息
    async sendMessage() {
        const message = this.chatInput.value.trim();
        if (!message || this.isLoading) return;

        if (this.welcomeContainer) {
            this.welcomeContainer.remove();
            this.welcomeContainer = null;
        }

        // 添加用户消息（不解析 Markdown）
        this.addUserMessage(message);
        this.messageHistory.push({ role: 'user', content: message });

        this.chatInput.value = '';
        this.autoResizeTextarea();

        this.setLoading(true);
        this.addLoadingIndicator();

        try {
            const response = await this.callAPI(message);
            this.removeLoadingIndicator();
            this.addBotMessage(response);
            this.messageHistory.push({ role: 'assistant', content: response });
            this.saveHistory();
        } catch (error) {
            this.removeLoadingIndicator();
            this.showToast(error.message || '请求失败', 'error');
            this.messageHistory.pop();
        }

        this.setLoading(false);
    }

    // 调用 API
    async callAPI(message) {
        if (API_CONFIG.mockMode) {
            return this.getMockResponse();
        }

        const requestBody = {
            name: API_CONFIG.userName || 'user',
            content: message
        };

        if (API_CONFIG.debug) {
            console.log('发送请求:', requestBody);
        }

        const response = await fetch(API_CONFIG.baseUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(requestBody)
        });

        if (!response.ok) throw new Error(`请求失败 (${response.status})`);

        const data = await response.json();
        
        if (API_CONFIG.debug) {
            console.log('收到响应:', data);
        }

        return data.content || data.text || data.result || data.response || 
               (data.choices?.[0]?.message?.content) || String(data);
    }

    // 模拟响应
    getMockResponse() {
        return new Promise(resolve => {
            setTimeout(() => {
                const response = `# 欢迎使用智能助手

很高兴为你服务！这是一个简单的 **Markdown** 示例：

## 功能特点

- 🔍 智能问答
- 💻 代码编写
- 📝 文案撰写

## 代码示例

\`\`\`python
def hello():
    print("Hello, World!")
\`\`\`

## 温馨提示

> 提示：后端开发完成后，修改 \`config.js\` 中的 \`baseUrl\` 即可连接真实接口。

还有什么可以帮你的吗？`;
                resolve(response);
            }, 800 + Math.random() * 700);
        });
    }

    // 添加用户消息
    addUserMessage(content) {
        const div = document.createElement('div');
        div.className = 'message user';
        div.innerHTML = `
            <div class="message-avatar"><i class="fas fa-user"></i></div>
            <div class="message-content">
                <div class="message-text">${this.escapeHtml(content)}</div>
            </div>
        `;
        this.chatMessages.appendChild(div);
        this.scrollToBottom();
    }

    // 添加机器人消息（解析 Markdown）
    addBotMessage(content) {
        const div = document.createElement('div');
        div.className = 'message assistant';
        div.innerHTML = `
            <div class="message-avatar"><i class="fas fa-robot"></i></div>
            <div class="message-content">
                <div class="message-text">${this.parseMarkdown(content)}</div>
            </div>
        `;
        this.chatMessages.appendChild(div);
        this.scrollToBottom();
    }

    // HTML 转义
    escapeHtml(text) {
        return text
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
    }

    // 解析 Markdown
    parseMarkdown(text) {
        let html = this.escapeHtml(text);

        // 代码块 ```...``` (无复制按钮)
        html = html.replace(/```(\w*)\n?([\s\S]*?)```/g, (match, lang, code) => {
            return `<pre><code class="lang-${lang}">${code.trim()}</code></pre>`;
        });

        // 行内代码 `...`
        html = html.replace(/`([^`]+)`/g, '<code>$1</code>');

        // 引用 > 引用
        html = html.replace(/^&gt; (.+)$/gm, '<blockquote>$1</blockquote>');

        // 标题 ### 三级标题
        html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>');
        // 标题 ## 二级标题
        html = html.replace(/^## (.+)$/gm, '<h2>$1</h2>');
        // 标题 # 一级标题
        html = html.replace(/^# (.+)$/gm, '<h1>$1</h1>');

        // 加粗 **text**
        html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');

        // 斜体 *text*
        html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');

        // 链接 [text](url)
        html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');

        // 无序列表 - item
        html = html.replace(/^- (.+)$/gm, '<li>$1</li>');
        html = html.replace(/(<li>.*<\/li>\n?)+/g, '<ul>$&</ul>');

        // 有序列表 1. item
        html = html.replace(/^\d+\. (.+)$/gm, '<li>$1</li>');

        // 水平线 ---
        html = html.replace(/^---$/gm, '<hr>');

        // 处理段落：把连续的空行（两个以上换行）转换为段落
        // 单个换行保留，多个连续换行合并
        html = html.replace(/\n{3,}/g, '</p><p>');
        html = html.replace(/\n\n/g, '</p><p>');
        html = '<p>' + html + '</p>';
        
        // 段落标签内的单个换行转为 <br>
        html = html.replace(/<p>([^<]*)\n([^<]*)<\/p>/g, '<p>$1<br>$2</p>');
        
        // 清理空的段落
        html = html.replace(/<p>\s*<\/p>/g, '');
        html = html.replace(/<p><\/p>/g, '');

        return html;
    }

    // 添加加载指示器
    addLoadingIndicator() {
        const div = document.createElement('div');
        div.className = 'message assistant';
        div.id = 'loadingIndicator';
        div.innerHTML = `
            <div class="message-avatar"><i class="fas fa-robot"></i></div>
            <div class="message-content">
                <div class="message-text typing-indicator">
                    <span class="dot"></span>
                    <span class="dot"></span>
                    <span class="dot"></span>
                </div>
            </div>
        `;
        this.chatMessages.appendChild(div);
        this.scrollToBottom();
    }

    removeLoadingIndicator() {
        const el = document.getElementById('loadingIndicator');
        if (el) el.remove();
    }

    setLoading(loading) {
        this.isLoading = loading;
        this.sendBtn.disabled = loading;
        this.chatInput.disabled = loading;
        this.sendBtn.classList.toggle('loading', loading);
    }

    scrollToBottom() {
        this.chatMessages.scrollTop = this.chatMessages.scrollHeight;
    }

    loadHistory() {
        try {
            const saved = localStorage.getItem('chatHistory');
            if (saved) {
                this.messageHistory = JSON.parse(saved);
                this.renderHistory();
            }
        } catch (e) {
            this.messageHistory = [];
        }
    }

    renderHistory() {
        if (this.messageHistory.length === 0) return;
        if (this.welcomeContainer) {
            this.welcomeContainer.remove();
            this.welcomeContainer = null;
        }
        this.messageHistory.forEach(msg => {
            if (msg.role === 'user') {
                this.addUserMessage(msg.content);
            } else {
                this.addBotMessage(msg.content);
            }
        });
    }

    saveHistory() {
        try {
            localStorage.setItem('chatHistory', JSON.stringify(this.messageHistory));
        } catch (e) {}
    }

    showToast(message, type = 'info') {
        this.toastMessage.textContent = message;
        this.toast.className = `toast ${type} show`;
        setTimeout(() => this.toast.classList.remove('show'), 3000);
    }
}

// 初始化
document.addEventListener('DOMContentLoaded', () => {
    window.chatApp = new ChatApp();
});

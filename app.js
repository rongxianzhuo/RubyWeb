/**
 * AI 聊天应用主逻辑
 * 支持 Markdown 渲染和可扩展指令系统
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
        this.settingsBtn = document.getElementById('settingsBtn');

        // 应用状态
        this.isLoading = false;
        this.messageHistory = [];
        this.userId = null; // 用户唯一标识

        // 初始化指令系统
        this.initCommands();

        // 初始化
        this.init();
    }

    // ============================================
    // 指令系统 - 可扩展设计
    // ============================================

    /**
     * 初始化所有指令
     * 格式：{ name: 指令名, description: 描述, handler: 处理函数 }
     * handler 接收参数 (args: string, rawInput: string)
     * 返回 true 表示已处理，返回 false 表示需要继续执行默认行为
     */
    initCommands() {
        this.commands = new Map();

        // /clear - 清空聊天记录
        this.registerCommand({
            name: 'clear',
            description: '清空当前聊天记录',
            handler: (args, rawInput) => {
                this.clearChat();
                return true;
            }
        });

        // /help - 显示帮助信息
        this.registerCommand({
            name: 'help',
            description: '显示所有可用指令',
            handler: (args, rawInput) => {
                this.showHelp();
                return true;
            }
        });

        // /status - 显示状态信息
        this.registerCommand({
            name: 'status',
            description: '显示当前连接状态',
            handler: (args, rawInput) => {
                this.showStatus();
                return true;
            }
        });

        // /last - 查询Ruby最后回复消息
        this.registerCommand({
            name: 'last',
            description: '查询Ruby最后一条回复消息及思考状态',
            handler: (args, rawInput) => {
                this.showLastMessage(false);
                return true;
            }
        });

        // /logout - 退出登录
        this.registerCommand({
            name: 'logout',
            description: '退出当前登录',
            handler: (args, rawInput) => {
                this.logout();
                return true;
            }
        });
    }

    /**
     * 注册新指令
     * @param {Object} command - 指令对象
     * @param {string} command.name - 指令名称（不含斜杠）
     * @param {string} command.description - 指令描述
     * @param {Function} command.handler - 处理函数，接收 (args, rawInput)
     */
    registerCommand(command) {
        if (!command.name || !command.handler) {
            console.error('指令注册失败：缺少 name 或 handler');
            return;
        }
        this.commands.set(command.name, command);
    }

    /**
     * 移除指令
     * @param {string} name - 指令名称
     */
    removeCommand(name) {
        this.commands.delete(name);
    }

    /**
     * 检查输入是否为指令并执行
     * @param {string} input - 用户输入
     * @returns {boolean} - 是否已处理（为已知指令），返回 false 表示按普通消息处理
     */
    executeCommand(input) {
        const trimmed = input.trim();
        
        // 检查是否以 / 开头
        if (!trimmed.startsWith('/')) {
            return false;
        }

        // 解析指令名称和参数
        // 格式: /command arg1 arg2 或 /command
        const parts = trimmed.slice(1).split(/\s+/);
        const commandName = parts[0].toLowerCase();
        const args = parts.slice(1).join(' ');
        const rawInput = trimmed;

        // 查找并执行指令
        const command = this.commands.get(commandName);
        if (command) {
            try {
                return command.handler(args, rawInput);
            } catch (error) {
                console.error(`指令 ${commandName} 执行出错:`, error);
                this.showToast(`指令执行出错: ${error.message}`, 'error');
                return true; // 已处理，只是出错了
            }
        } else {
            // 未知指令，不拦截，按普通消息发给后端处理
            return false;
        }
    }

    /**
     * 清空聊天记录
     */
    clearChat() {
        this.messageHistory = [];
        localStorage.removeItem('chatHistory');
        
        // 清空页面上的消息
        this.chatMessages.innerHTML = '';
        
        // 重新显示欢迎页
        this.welcomeContainer = document.createElement('div');
        this.welcomeContainer.className = 'welcome-container';
        this.welcomeContainer.innerHTML = `
            <div class="welcome-icon">
                <i class="fas fa-comments"></i>
            </div>
            <h2>欢迎使用 Ruby</h2>
            <p>输入您的问题，我会尽力为您解答</p>
        `;
        this.chatMessages.appendChild(this.welcomeContainer);
        
        this.showToast('聊天记录已清空', 'success');
    }

    /**
     * 显示帮助信息
     */
    showHelp() {
        let helpText = '## 📋 可用指令\n\n';
        
        for (const [name, command] of this.commands) {
            helpText += `- **/${name}** - ${command.description}\n`;
        }
        
        helpText += '\n---\n\n💡 直接输入内容即可与 AI 对话';
        
        this.addBotMessage(helpText);
    }

    /**
     * 显示状态信息
     */
    showStatus() {
        const apiUrl = API_CONFIG.baseUrl;
        const mockMode = API_CONFIG.mockMode ? '开启' : '关闭';
        const historyCount = this.messageHistory.length;
        const username = localStorage.getItem('username') || '未设置';
        
        let statusText = `## 🔧 当前状态\n\n`;
        statusText += `| 项目 | 状态 |\n`;
        statusText += `|------|------|\n`;
        statusText += `| 登录用户 | ${username} |\n`;
        statusText += `| API 地址 | ${apiUrl} |\n`;
        statusText += `| 模拟模式 | ${mockMode} |\n`;
        statusText += `| 历史记录 | ${historyCount} 条 |\n`;
        
        this.addBotMessage(statusText);
    }

    /**
     * 获取 messageHistory 中最后一条 assistant 消息
     */
    getLastAssistantMessageFromHistory() {
        for (let i = this.messageHistory.length - 1; i >= 0; i--) {
            if (this.messageHistory[i].role === 'assistant') {
                return this.messageHistory[i].content;
            }
        }
        return '';
    }

    /**
     * 显示Ruby最后回复消息
     * @param {boolean} silent - 静默模式，true时不显示toast
     */
    async showLastMessage(silent) {
        if (API_CONFIG.mockMode) {
            if (!silent) {
                this.showToast('模拟模式下无法查询');
            }
            return;
        }

        try {
            // 从 baseUrl 提取基础路径，拼接 /last_message/<userId>
            // baseUrl 格式: http://xxx:port/chat/<userId>
            const baseUrl = API_CONFIG.baseUrl.replace(/\/chat\/.*$/, '');
            const url = `${baseUrl}/last_message/${this.userId}`;
            
            if (API_CONFIG.debug) {
                console.log('查询最后消息:', url);
            }

            const response = await fetch(url, {
                headers: this.getAuthHeaders()
            });
            
            if (response.status === 401) {
                this.handleAuthError();
                return;
            }

            if (!response.ok) {
                throw new Error(`请求失败 (${response.status})`);
            }

            const data = await response.json();
            
            if (API_CONFIG.debug) {
                console.log('收到响应:', data);
            }

            const content = data.content || '';
            
            // 获取 messageHistory 中最后一条 assistant 消息
            const lastHistoryMsg = this.getLastAssistantMessageFromHistory();
            
            // 如果消息相同或为空
            if (content === lastHistoryMsg || !content) {
                if (!silent) {
                    if (data.think === 1) {
                        this.showToast('Ruby 正在思考中...');
                    } else {
                        this.showToast('暂无新消息');
                    }
                }
                return;
            }
            
            // 消息不同且不为空，更新聊天列表
            if (this.welcomeContainer) {
                this.welcomeContainer.remove();
                this.welcomeContainer = null;
            }
            
            this.addBotMessage(content);
            this.messageHistory.push({ role: 'assistant', content: content });
            this.saveHistory();
            
        } catch (error) {
            console.error('查询最后消息失败:', error);
            if (!silent) {
                this.showToast('查询失败', 'error');
            }
        }
    }

    // ============================================
    // 原有应用逻辑
    // ============================================

    init() {
        // 检查登录状态
        if (!this.checkLoginStatus()) {
            return;
        }

        this.initUserId(); // 初始化用户 UUID
        this.bindEvents();
        this.loadHistory();
        
        // 静默模式查询最后消息（页面加载时自动同步，防止消息丢失）
        this.showLastMessage(true);
    }

    // 检查登录状态
    checkLoginStatus() {
        const token = localStorage.getItem('auth_token');
        if (!token) {
            // 未登录，跳转到登录页
            window.location.href = 'login.html';
            return false;
        }
        return true;
    }

    // 初始化用户 UUID
    initUserId() {
        const storageKey = 'user_id';
        let userId = localStorage.getItem(storageKey);
        
        if (!userId) {
            // 生成新的 UUID
            userId = this.generateUUID();
            localStorage.setItem(storageKey, userId);
            console.log('生成新用户 ID:', userId);
        } else {
            console.log('使用已有用户 ID:', userId);
        }
        
        this.userId = userId;
    }

    // 生成 UUID v4
    generateUUID() {
        if (typeof crypto !== 'undefined' && crypto.randomUUID) {
            return crypto.randomUUID();
        }
        // 兼容不支持 crypto.randomUUID 的浏览器
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
            const r = Math.random() * 16 | 0;
            const v = c === 'x' ? r : (r & 0x3 | 0x8);
            return v.toString(16);
        });
    }

    // 获取认证头
    getAuthHeaders() {
        const token = localStorage.getItem('auth_token');
        const headers = {
            'Content-Type': 'application/json'
        };
        if (token) {
            headers['Authorization'] = `Bearer ${token}`;
        }
        return headers;
    }

    // 处理认证错误
    handleAuthError() {
        localStorage.removeItem('auth_token');
        localStorage.removeItem('user_id');
        localStorage.removeItem('username');
        this.showToast('登录已过期，请重新登录', 'error');
        setTimeout(() => {
            window.location.href = 'login.html';
        }, 1500);
    }

    // 退出登录
    logout() {
        localStorage.removeItem('auth_token');
        localStorage.removeItem('user_id');
        localStorage.removeItem('username');
        this.showToast('已退出登录', 'success');
        setTimeout(() => {
            window.location.href = 'login.html';
        }, 500);
    }

    // 绑定事件
    bindEvents() {
        this.sendBtn.addEventListener('click', () => this.sendMessage());
        this.chatInput.addEventListener('keydown', (e) => this.handleKeyDown(e));
        this.chatInput.addEventListener('input', () => this.autoResizeTextarea());
    }

    handleKeyDown(e) {
        // Ctrl + Enter 发送，Enter 换行
        if (e.key === 'Enter' && e.ctrlKey) {
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

        // ========== 指令系统处理 ==========
        // 返回 true 表示已处理（内置指令），返回 false 表示按普通消息发给后端
        if (this.executeCommand(message)) {
            this.chatInput.value = '';
            this.autoResizeTextarea();
            return;
        }
        // ========== 指令系统处理结束 ==========

        if (this.welcomeContainer) {
            this.welcomeContainer.remove();
            this.welcomeContainer = null;
        }

        // 添加用户消息（不解析 Markdown）
        this.addUserMessage(message);
        this.messageHistory.push({ role: 'user', content: message });
        this.saveHistory();  // 立即保存，防止消息丢失

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
            
            // 检查是否是认证错误
            if (error.message.includes('401') || error.message.includes('Unauthorized')) {
                this.handleAuthError();
            } else {
                this.showToast(error.message || '请求失败', 'error');
            }
        }

        this.setLoading(false);
    }

    // 调用 API
    async callAPI(message) {
        if (API_CONFIG.mockMode) {
            return this.getMockResponse();
        }

        const requestBody = {
            name: this.userId,  // 使用用户 UUID
            content: message
        };

        // 从 baseUrl 提取基础路径，拼接 /chat/<userId>
        // baseUrl 格式: http://xxx:port/chat/<userId>
        const baseUrl = API_CONFIG.baseUrl.replace(/\/chat\/.*$/, '');
        const url = `${baseUrl}/chat/${this.userId}`;

        if (API_CONFIG.debug) {
            console.log('发送请求:', url, requestBody);
        }

        const response = await fetch(url, {
            method: 'POST',
            headers: this.getAuthHeaders(),
            body: JSON.stringify(requestBody)
        });

        if (response.status === 401) {
            throw new Error('Unauthorized');
        }

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
            const langLabel = lang ? `<span class="code-lang">${lang}</span>` : '';
            return `<div class="code-block">${langLabel}<pre><code class="lang-${lang}">${code.trim()}</code></pre></div>`;
        });

        // 表格解析（需要在段落处理之前）
        html = this.parseTable(html);

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

    // 解析表格
    parseTable(html) {
        // 匹配表格：多行以 | 开头和结尾的行
        // 分隔符行允许空格：| --- | :---: | ---: |
        const tableRegex = /^(\|.+\|\n)((?:\|\s*[-:]+\s*\|\n)?)((?:\|.+\|\n?)+)/gm;
        
        return html.replace(tableRegex, (match, headerLine, alignLine, bodyLines) => {
            // 解析表头
            const headers = headerLine.trim().split('|').filter(cell => cell.trim() !== '');
            
            // 解析对齐行（可选）
            let align = [];
            if (alignLine && alignLine.includes('-')) {
                const aligns = alignLine.trim().split('|').filter(cell => cell.trim() !== '');
                align = aligns.map(cell => {
                    const trimmed = cell.trim();
                    if (trimmed.startsWith(':') && trimmed.endsWith(':')) {
                        return ' style="text-align:center"';
                    } else if (trimmed.endsWith(':')) {
                        return ' style="text-align:right"';
                    } else if (trimmed.startsWith(':')) {
                        return ' style="text-align:left"';
                    }
                    return '';
                });
            }
            
            // 解析表体 - 过滤掉可能是分隔符的行
            const rows = bodyLines.trim().split('\n').filter(row => {
                // 过滤掉纯分隔符行（如 |---|---| 或 | - | - |）
                return !/^\|\s*[-:]+\s*(?:\|\s*[-:]+\s*)*\|$/.test(row.trim());
            });
            
            let bodyHtml = '';
            for (const row of rows) {
                const cells = row.split('|').filter(cell => cell.trim() !== '');
                bodyHtml += '<tr>';
                for (let i = 0; i < cells.length; i++) {
                    const alignAttr = align[i] || '';
                    bodyHtml += `<td${alignAttr}>${cells[i].trim()}</td>`;
                }
                bodyHtml += '</tr>';
            }
            
            // 构建表头
            let headerHtml = '<thead><tr>';
            for (let i = 0; i < headers.length; i++) {
                const alignAttr = align[i] || '';
                headerHtml += `<th${alignAttr}>${headers[i].trim()}</th>`;
            }
            headerHtml += '</tr></thead>';
            
            return `<table class="markdown-table">${headerHtml}<tbody>${bodyHtml}</tbody></table>`;
        });
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

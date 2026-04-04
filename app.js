/**
 * AI 聊天应用主逻辑
 * 支持 Markdown 渲染和可扩展指令系统
 * 基于 WebSocket 长连接
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

        // WebSocket 连接
        this.ws = null;
        this.wsConnected = false;
        this.wsReconnecting = false;
        this.manualDisconnect = false; // 是否是主动断开

        // 初始化指令系统
        this.initCommands();

        // 初始化
        this.init();
    }

    // ============================================
    // WebSocket 连接管理
    // ============================================

    getWebSocketUrl() {
        const baseUrl = API_CONFIG.baseUrl.replace(/^http/, 'ws').replace(/\/chat\/.*$/, '');
        const token = localStorage.getItem('auth_token');
        return `${baseUrl}/ws/chat/${this.userId}?token=${token}`;
    }

    connectWebSocket() {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            return;
        }

        const wsUrl = this.getWebSocketUrl();
        
        if (API_CONFIG.debug) {
            console.log('正在连接 WebSocket:', wsUrl);
        }

        try {
            this.ws = new WebSocket(wsUrl);

            this.ws.onopen = () => {
                if (API_CONFIG.debug) {
                    console.log('WebSocket 连接已建立');
                }
                this.wsConnected = true;
                this.wsReconnecting = false;
                this.manualDisconnect = false;
                this.updateConnectionStatus(true);
            };

            this.ws.onclose = (event) => {
                if (API_CONFIG.debug) {
                    console.log('WebSocket 连接已关闭:', event.code, event.reason);
                }
                this.wsConnected = false;
                this.updateConnectionStatus(false);
                
                // 处理不同关闭码
                this.handleWebSocketClose(event.code, event.reason);
            };

            this.ws.onerror = (error) => {
                console.error('WebSocket 错误:', error);
                // onerror 会在 onclose 之前触发，这里不需要额外处理
            };

            this.ws.onmessage = (event) => {
                this.handleWebSocketMessage(event.data);
            };

        } catch (error) {
            console.error('创建 WebSocket 失败:', error);
            this.wsConnected = false;
            this.updateConnectionStatus(false);
        }
    }

    handleWebSocketClose(code, reason) {
        // 如果是主动断开（1000 或 manualDisconnect），不处理
        if (code === 1000 || this.manualDisconnect) {
            return;
        }

        // 尝试解析 reason 中的错误信息
        let errorMessage = null;
        try {
            if (reason) {
                const errorDetail = JSON.parse(reason);
                errorMessage = errorDetail.message || null;
            }
        } catch (e) {
            // reason 不是 JSON，使用默认消息
        }

        switch (code) {
            case 1006:
            case 4001:
                // 鉴权失败
                this.handleAuthError(errorMessage || '认证失败');
                break;
            case 4002:
                // 无权限
                this.handleAuthError(errorMessage || '无权限访问', 'error');
                break;
            case 4003:
                // Token 过期
                this.handleAuthError(errorMessage || '登录已过期');
                break;
            default:
                // 其他错误，尝试重连
                if (!this.wsReconnecting) {
                    this.showToast('连接断开，正在尝试重连...', 'error');
                    this.reconnectWebSocket();
                }
        }
    }

    handleAuthError(message) {
        // 清除本地登录状态
        localStorage.removeItem('auth_token');
        localStorage.removeItem('user_id');
        localStorage.removeItem('username');
        
        // 显示错误并跳转登录页
        this.showToast(message || '登录已过期，请重新登录', 'error');
        
        // 延迟跳转，让用户看到错误信息
        setTimeout(() => {
            window.location.href = 'login.html';
        }, 2000);
    }

    reconnectWebSocket() {
        if (this.wsReconnecting || this.manualDisconnect) return;
        
        this.wsReconnecting = true;
        const retryInterval = 3000; // 3秒重试一次
        const maxRetries = 5;
        let retryCount = 0;
        
        const tryConnect = () => {
            if (this.ws && this.ws.readyState === WebSocket.OPEN) {
                this.wsReconnecting = false;
                return;
            }
            
            if (this.manualDisconnect) {
                this.wsReconnecting = false;
                return;
            }
            
            retryCount++;
            if (API_CONFIG.debug) {
                console.log(`尝试重新连接 WebSocket... (${retryCount}/${maxRetries})`);
            }
            
            this.connectWebSocket();
            
            if (retryCount < maxRetries && this.wsReconnecting) {
                setTimeout(tryConnect, retryInterval);
            } else if (retryCount >= maxRetries) {
                this.wsReconnecting = false;
                this.showToast('连接失败，请刷新页面重试', 'error');
            }
        };
        
        setTimeout(tryConnect, retryInterval);
    }

    disconnectWebSocket() {
        this.manualDisconnect = true;
        if (this.ws) {
            this.ws.close(1000, '用户主动断开');
            this.ws = null;
            this.wsConnected = false;
        }
    }

    handleWebSocketMessage(data) {
        try {
            const msg = JSON.parse(data);
            
            if (API_CONFIG.debug) {
                console.log('收到消息:', msg);
            }

            switch (msg.type) {
                case 'connected':
                    // 连接成功
                    if (API_CONFIG.debug) {
                        this.showToast('已连接到服务器', 'success');
                    }
                    break;

                case 'thinking':
                    // Ruby 正在思考
                    this.setLoading(true);
                    this.addLoadingIndicator();
                    break;

                case 'done':
                    // 消息完成
                    this.removeLoadingIndicator();
                    this.setLoading(false);
                    this.addBotMessage(msg.content, msg.files);
                    this.messageHistory.push({ role: 'assistant', content: msg.content, files: msg.files });
                    this.saveHistory();
                    break;

                case 'chunk':
                    // 流式输出片段（预留）
                    // 目前后端尚未实现，先按 done 处理
                    break;

                case 'error':
                    // 错误消息
                    this.removeLoadingIndicator();
                    this.setLoading(false);
                    this.showToast(msg.message || '发生错误', 'error');
                    break;

                default:
                    console.warn('未知消息类型:', msg.type);
            }
        } catch (error) {
            console.error('解析消息失败:', error);
        }
    }

    sendWebSocketMessage(type, data = {}) {
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
            this.showToast('连接未建立，请等待...', 'error');
            return false;
        }

        const message = { type, ...data };
        
        if (API_CONFIG.debug) {
            console.log('发送消息:', message);
        }

        this.ws.send(JSON.stringify(message));
        return true;
    }

    updateConnectionStatus(connected) {
        // 可选：更新 UI 显示连接状态
        const statusIndicator = document.getElementById('connectionStatus');
        if (statusIndicator) {
            statusIndicator.className = connected ? 'connected' : 'disconnected';
            statusIndicator.title = connected ? '已连接' : '未连接';
        }
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

        // /reset - 重置对话
        this.registerCommand({
            name: 'reset',
            description: '重置对话上下文',
            handler: (args, rawInput) => {
                this.resetConversation();
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
        const wsStatus = this.wsConnected ? '已连接' : '未连接';
        
        let statusText = `## 🔧 当前状态\n\n`;
        statusText += `| 项目 | 状态 |\n`;
        statusText += `|------|------|\n`;
        statusText += `| 登录用户 | ${username} |\n`;
        statusText += `| API 地址 | ${apiUrl} |\n`;
        statusText += `| WebSocket | ${wsStatus} |\n`;
        statusText += `| 历史记录 | ${historyCount} 条 |\n`;
        
        this.addBotMessage(statusText);
    }

    /**
     * 重置对话
     */
    resetConversation() {
        if (!this.wsConnected) {
            this.showToast('未连接到服务器', 'error');
            return;
        }

        this.sendWebSocketMessage('reset');
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
            <h2>对话已重置</h2>
            <p>开始新的对话吧！</p>
        `;
        this.chatMessages.appendChild(this.welcomeContainer);
        
        this.showToast('对话已重置', 'success');
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
        
        // 建立 WebSocket 连接
        this.connectWebSocket();
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

    // 获取认证头（保留用于可能的 HTTP 请求）
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
    handleAuthErrorLocal() {
        localStorage.removeItem('auth_token');
        localStorage.removeItem('user_id');
        localStorage.removeItem('username');
        this.showToast('登录已过期，请重新登录', 'error');
        this.disconnectWebSocket();
        setTimeout(() => {
            window.location.href = 'login.html';
        }, 1500);
    }

    // 退出登录
    logout() {
        this.disconnectWebSocket();
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
        
        // 页面卸载时断开 WebSocket
        window.addEventListener('beforeunload', () => {
            this.disconnectWebSocket();
        });
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
    sendMessage() {
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

        // 检查 WebSocket 连接
        if (!this.wsConnected) {
            this.showToast('连接未建立，请等待...', 'error');
            return;
        }

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

        // 通过 WebSocket 发送消息
        this.sendWebSocketMessage('message', { content: message });
    }

    // 模拟响应（保留用于 mock 模式）
    getMockResponse() {
        return new Promise(resolve => {
            setTimeout(() => {
                const response = {
                    content: `# 欢迎使用智能助手

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

还有什么可以帮你的吗？`,
                    files: null
                };
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
    addBotMessage(content, files = null) {
        const div = document.createElement('div');
        div.className = 'message assistant';
        
        let filesHtml = '';
        if (files) {
            filesHtml = this.renderFiles(files);
        }
        
        div.innerHTML = `
            <div class="message-avatar"><i class="fas fa-robot"></i></div>
            <div class="message-content">
                <div class="message-text">${this.parseMarkdown(content)}</div>
                ${filesHtml}
            </div>
        `;
        this.chatMessages.appendChild(div);
        this.scrollToBottom();
    }

    // 渲染文件附件
    renderFiles(files) {
        if (!files) return '';
        
        // 支持单个文件对象或文件数组
        const fileList = Array.isArray(files) ? files : [files];
        
        let filesHtml = '<div class="message-files">';
        
        fileList.forEach(file => {
            if (!file || !file.name || !file.url) return;
            
            const fileName = this.escapeHtml(file.name);
            const fileUrl = this.escapeHtml(file.url);
            const fileIcon = this.getFileIcon(file.name);
            
            filesHtml += `
                <a href="${fileUrl}" class="file-item" download="${fileName}" target="_blank" rel="noopener">
                    <span class="file-icon"><i class="${fileIcon}"></i></span>
                    <span class="file-info">
                        <span class="file-name">${fileName}</span>
                    </span>
                    <span class="file-download"><i class="fas fa-download"></i></span>
                </a>
            `;
        });
        
        filesHtml += '</div>';
        return filesHtml;
    }

    // 根据文件扩展名获取图标
    getFileIcon(filename) {
        const ext = filename.split('.').pop().toLowerCase();
        const iconMap = {
            // 文档
            'pdf': 'fas fa-file-pdf',
            'doc': 'fas fa-file-word',
            'docx': 'fas fa-file-word',
            'xls': 'fas fa-file-excel',
            'xlsx': 'fas fa-file-excel',
            'ppt': 'fas fa-file-powerpoint',
            'pptx': 'fas fa-file-powerpoint',
            'txt': 'fas fa-file-lines',
            'md': 'fas fa-file-code',
            // 图片
            'jpg': 'fas fa-file-image',
            'jpeg': 'fas fa-file-image',
            'png': 'fas fa-file-image',
            'gif': 'fas fa-file-image',
            'svg': 'fas fa-file-image',
            // 代码
            'js': 'fas fa-file-code',
            'ts': 'fas fa-file-code',
            'py': 'fas fa-file-code',
            'html': 'fas fa-file-code',
            'css': 'fas fa-file-code',
            'json': 'fas fa-file-code',
            'xml': 'fas fa-file-code',
            // 压缩包
            'zip': 'fas fa-file-archive',
            'rar': 'fas fa-file-archive',
            '7z': 'fas fa-file-archive',
            'tar': 'fas fa-file-archive',
            'gz': 'fas fa-file-archive',
            // 其他
            'csv': 'fas fa-file-csv'
        };
        return iconMap[ext] || 'fas fa-file';
    }

    // HTML 转义
    escapeHtml(text) {
        return text
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
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
                this.addBotMessage(msg.content, msg.files);
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

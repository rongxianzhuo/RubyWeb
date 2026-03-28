/**
 * 用户登录逻辑
 */

class LoginApp {
    constructor() {
        // DOM 元素
        this.loginForm = document.getElementById('loginForm');
        this.usernameInput = document.getElementById('username');
        this.passwordInput = document.getElementById('password');
        this.loginBtn = document.getElementById('loginBtn');
        this.togglePasswordBtn = document.getElementById('togglePassword');
        this.formError = document.getElementById('formError');
        this.toast = document.getElementById('toast');
        this.toastMessage = document.getElementById('toastMessage');

        // 登录状态
        this.isLoading = false;

        // 初始化
        this.init();
    }

    init() {
        this.bindEvents();
        this.checkLoginStatus();
    }

    // 绑定事件
    bindEvents() {
        // 表单提交
        this.loginForm.addEventListener('submit', (e) => this.handleSubmit(e));

        // 密码显示/隐藏
        this.togglePasswordBtn.addEventListener('click', () => this.togglePassword());

        // 输入时清除错误
        this.usernameInput.addEventListener('input', () => this.clearError());
        this.passwordInput.addEventListener('input', () => this.clearError());
    }

    // 检查登录状态
    checkLoginStatus() {
        const token = localStorage.getItem('auth_token');
        if (token) {
            // 已登录，跳转到主页
            this.redirectToHome();
        }
    }

    // 处理登录提交
    async handleSubmit(e) {
        e.preventDefault();

        if (this.isLoading) return;

        const username = this.usernameInput.value.trim();
        const password = this.passwordInput.value.trim();

        // 表单验证
        if (!username) {
            this.showError('请输入用户名');
            this.usernameInput.focus();
            return;
        }

        if (!password) {
            this.showError('请输入密码');
            this.passwordInput.focus();
            return;
        }

        // 执行登录
        await this.doLogin(username, password);
    }

    // 执行登录
    async doLogin(username, password) {
        this.setLoading(true);
        this.clearError();

        try {
            const response = await fetch(`${API_CONFIG.baseUrl}/login`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    username: username,
                    password: password
                })
            });

            const data = await response.json();

            if (data.code === 0) {
                // 登录成功
                this.handleLoginSuccess(data);
            } else {
                // 登录失败
                this.showError(data.message || '登录失败');
            }
        } catch (error) {
            console.error('登录请求失败:', error);
            this.showError('网络错误，请稍后重试');
        } finally {
            this.setLoading(false);
        }
    }

    // 处理登录成功
    handleLoginSuccess(data) {
        // 保存用户信息
        localStorage.setItem('auth_token', data.token);
        localStorage.setItem('user_id', data.user_id);
        localStorage.setItem('username', this.usernameInput.value.trim());

        this.showToast('登录成功', 'success');

        // 延迟跳转，让用户看到成功提示
        setTimeout(() => {
            this.redirectToHome();
        }, 500);
    }

    // 跳转到主页
    redirectToHome() {
        window.location.href = 'index.html';
    }

    // 切换密码显示/隐藏
    togglePassword() {
        const isPassword = this.passwordInput.type === 'password';
        this.passwordInput.type = isPassword ? 'text' : 'password';
        
        const icon = this.togglePasswordBtn.querySelector('i');
        icon.className = isPassword ? 'fas fa-eye-slash' : 'fas fa-eye';
    }

    // 显示错误
    showError(message) {
        this.formError.textContent = message;
    }

    // 清除错误
    clearError() {
        this.formError.textContent = '';
    }

    // 设置加载状态
    setLoading(loading) {
        this.isLoading = loading;
        this.loginBtn.disabled = loading;
        this.loginBtn.classList.toggle('loading', loading);
    }

    // 显示 Toast
    showToast(message, type = 'info') {
        this.toastMessage.textContent = message;
        this.toast.className = `toast ${type} show`;
        setTimeout(() => this.toast.classList.remove('show'), 3000);
    }
}

// 初始化
document.addEventListener('DOMContentLoaded', () => {
    window.loginApp = new LoginApp();
});

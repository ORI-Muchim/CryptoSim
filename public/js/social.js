/**
 * Social Hub JavaScript Module
 * Handles follow/following functionality and social interactions
 */



// Check if user is logged in before initializing
async function checkLoginStatus() {
    const token = localStorage.getItem('token');
    const username = localStorage.getItem('username');
    
    if (!token || !username) {
        window.location.href = '/login';
        return false;
    }
    
    // Set username in the welcome message
    document.getElementById('current-user').textContent = username;
    
    // Verify token is valid with server
    try {
        const response = await fetch('/api/user/data', {
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });
        
        if (!response.ok) {
            localStorage.removeItem('token');
            localStorage.removeItem('username');
            window.location.href = '/login';
            return false;
        }
        
        return true;
    } catch (error) {
        console.error('Error verifying login status:', error);
        localStorage.removeItem('token');
        localStorage.removeItem('username');
        window.location.href = '/login';
        return false;
    }
}

class SocialHub {
    constructor() {
        this.currentUser = null;
        this.token = localStorage.getItem('token');
        this.currentTab = 'following';
        this.cache = {
            following: null,
            followers: null,
            discover: null,
            activities: null,
            stats: null
        };
        this.init();
    }

    async init() {
        try {
            // Get current user data
            await this.getCurrentUser();
            
            // Setup event listeners
            this.setupEventListeners();
            
            // Load initial data
            await this.loadSocialStats();
            await this.loadTabContent('following');
            
            // Periodically refresh balance
            setInterval(async () => {
                await this.refreshBalance();
            }, 10000); // Refresh every 10 seconds
            
        } catch (error) {
            console.error('Failed to initialize social hub:', error);
            this.showError('Failed to initialize social features');
        }
    }

    async getCurrentUser() {
        try {
            const response = await fetch('/api/user/data', {
                headers: {
                    'Authorization': `Bearer ${this.token}`,
                    'Content-Type': 'application/json'
                }
            });

            if (response.ok) {
                const data = await response.json();
                console.log('Social: Raw API response:', JSON.stringify(data, null, 2));
                
                // Handle both old and new API response formats
                const userData = data.data || data;
                console.log('Social: Processed user data:', JSON.stringify(userData, null, 2));
                console.log('Social: Available fields in userData:', Object.keys(userData));
                console.log('Social: USD Balance from server:', userData.usdBalance, 'Type:', typeof userData.usdBalance);
                console.log('Social: BTC Balance from server:', userData.btcBalance, 'Type:', typeof userData.btcBalance);
                console.log('Social: ETH Balance from server:', userData.ethBalance, 'Type:', typeof userData.ethBalance);
                
                this.currentUser = userData;
                
                // Update balance display
                this.updateBalanceDisplay(userData);
            } else {
                throw new Error('Failed to get user data');
            }
        } catch (error) {
            console.error('Error getting current user:', error);
            // Redirect to login if unauthorized
            if (error.status === 401) {
                window.location.href = '/login';
            }
        }
    }

    updateBalanceDisplay(userData) {
        console.log('Social: updateBalanceDisplay called with userData keys:', Object.keys(userData));
        
        // Update USDT balance (using krw-balance ID in social.html)
        const usdBalanceEl = document.getElementById('krw-balance');
        console.log('Social: usdBalanceEl found:', !!usdBalanceEl);
        console.log('Social: userData.usdBalance:', userData.usdBalance);
        
        if (usdBalanceEl && userData.usdBalance !== undefined) {
            const formattedBalance = `$${parseFloat(userData.usdBalance).toLocaleString('en-US', {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2
            })}`;
            console.log('Social: Setting USD balance to:', formattedBalance);
            usdBalanceEl.textContent = formattedBalance;
        } else {
            console.log('Social: USD balance not updated - Element:', !!usdBalanceEl, 'Data:', userData.usdBalance);
        }

        // Update crypto balance (BTC or ETH) with profit/loss percentage
        const btcBalanceEl = document.getElementById('btc-balance');
        const cryptoLabelEl = document.getElementById('crypto-balance-label');
        
        // Get current market from localStorage to determine which balance to show
        const currentMarket = localStorage.getItem('selectedMarket') || 'BTC/USDT';
        const [crypto] = currentMarket.split('/');
        
        if (btcBalanceEl && cryptoLabelEl) {
            if (crypto === 'ETH') {
                cryptoLabelEl.textContent = 'ETH Balance';
                if (userData.ethBalance !== undefined) {
                    btcBalanceEl.textContent = parseFloat(userData.ethBalance).toFixed(8);
                }
            } else {
                cryptoLabelEl.textContent = 'BTC Balance';
                if (userData.btcBalance !== undefined) {
                    btcBalanceEl.textContent = parseFloat(userData.btcBalance).toFixed(8);
                }
            }
        }
    }

    async refreshBalance() {
        try {
            const response = await fetch('/api/user/data', {
                headers: {
                    'Authorization': `Bearer ${this.token}`,
                    'Content-Type': 'application/json'
                }
            });

            if (response.ok) {
                const data = await response.json();
                // Handle both old and new API response formats
                const userData = data.data || data;
                console.log('Social: Balance refresh - USD:', userData.usdBalance);
                this.updateBalanceDisplay(userData);
            }
        } catch (error) {
            console.error('Error refreshing balance:', error);
            // Don't show error to user for background refresh
        }
    }

    setupEventListeners() {
        // Tab navigation
        document.querySelectorAll('.social-tab').forEach(tab => {
            tab.addEventListener('click', (e) => {
                const tabName = e.currentTarget.dataset.tab;
                this.switchTab(tabName);
            });
        });

        // Dropdown menu handling
        const userMenuTrigger = document.querySelector('.user-menu-trigger');
        const userDropdown = document.querySelector('.user-dropdown');
        
        if (userMenuTrigger && userDropdown) {
            userMenuTrigger.addEventListener('click', (e) => {
                e.stopPropagation();
                userDropdown.classList.toggle('active');
            });
            
            // Close dropdown when clicking outside
            document.addEventListener('click', (e) => {
                if (!userDropdown.contains(e.target)) {
                    userDropdown.classList.remove('active');
                }
            });
        }

        // Logout button handler
        const logoutBtn = document.getElementById('logout-btn');
        if (logoutBtn) {
            logoutBtn.addEventListener('click', (e) => {
                e.preventDefault();
                localStorage.removeItem('token');
                localStorage.removeItem('username');
                window.location.href = '/login';
            });
        }

        // Discover controls
        const searchBtn = document.getElementById('search-btn');
        const userSearchInput = document.getElementById('user-search');
        const discoverLimit = document.getElementById('discover-limit');

        if (searchBtn) {
            searchBtn.addEventListener('click', () => this.searchUsers());
        }

        if (userSearchInput) {
            userSearchInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    this.searchUsers();
                }
            });
        }

        if (discoverLimit) {
            discoverLimit.addEventListener('change', () => this.loadDiscoverTab());
        }

        // Setup periodic refresh for activities
        setInterval(() => {
            if (this.currentTab === 'activities') {
                this.loadActivities();
            }
        }, 30000); // Refresh every 30 seconds

        // Setup periodic balance refresh
        setInterval(() => {
            this.refreshBalance();
        }, 10000); // Refresh balance every 10 seconds
    }

    async switchTab(tabName) {
        // Update active tab
        document.querySelectorAll('.social-tab').forEach(tab => {
            tab.classList.remove('active');
        });
        document.querySelector(`[data-tab="${tabName}"]`).classList.add('active');

        // Update active content
        document.querySelectorAll('.social-tab-content').forEach(content => {
            content.classList.remove('active');
        });
        document.getElementById(`${tabName}-tab`).classList.add('active');

        this.currentTab = tabName;

        // Load tab content
        await this.loadTabContent(tabName);
    }

    async loadTabContent(tabName) {
        try {
            switch (tabName) {
                case 'following':
                    await this.loadFollowing();
                    break;
                case 'followers':
                    await this.loadFollowers();
                    break;
                case 'discover':
                    await this.loadDiscoverTab();
                    break;
                case 'activities':
                    await this.loadActivities();
                    break;
            }
        } catch (error) {
            console.error(`Failed to load ${tabName} content:`, error);
            this.showError(`Failed to load ${tabName} data`);
        }
    }

    async loadSocialStats() {
        try {
            const response = await fetch('/api/social/stats', {
                headers: {
                    'Authorization': `Bearer ${this.token}`,
                    'Content-Type': 'application/json'
                }
            });

            if (response.ok) {
                const data = await response.json();
                this.updateStatsDisplay(data.data);
                this.cache.stats = data.data;
            }
        } catch (error) {
            console.error('Failed to load social stats:', error);
        }
    }

    updateStatsDisplay(stats) {
        const followingCountEl = document.getElementById('following-count');
        const followersCountEl = document.getElementById('followers-count');

        if (followingCountEl) followingCountEl.textContent = stats.following || 0;
        if (followersCountEl) followersCountEl.textContent = stats.followers || 0;
    }

    async loadFollowing() {
        const container = document.getElementById('following-list');
        this.showLoading(container);

        try {
            const response = await fetch('/api/social/following?limit=50', {
                headers: {
                    'Authorization': `Bearer ${this.token}`,
                    'Content-Type': 'application/json'
                }
            });

            if (response.ok) {
                const data = await response.json();
                this.cache.following = data.data;
                this.renderUserList(container, data.data, 'following');
            } else {
                this.showError('Failed to load following list');
            }
        } catch (error) {
            console.error('Error loading following:', error);
            this.showError('Failed to load following list');
        }
    }

    async loadFollowers() {
        const container = document.getElementById('followers-list');
        this.showLoading(container);

        try {
            const response = await fetch('/api/social/followers?limit=50', {
                headers: {
                    'Authorization': `Bearer ${this.token}`,
                    'Content-Type': 'application/json'
                }
            });

            if (response.ok) {
                const data = await response.json();
                this.cache.followers = data.data;
                this.renderUserList(container, data.data, 'followers');
            } else {
                this.showError('Failed to load followers list');
            }
        } catch (error) {
            console.error('Error loading followers:', error);
            this.showError('Failed to load followers list');
        }
    }

    async loadDiscoverTab() {
        const container = document.getElementById('discover-table-body');
        this.showLoading(container);

        try {
            const limit = document.getElementById('discover-limit').value || 50;
            const response = await fetch(`/api/rankings?limit=${limit}`, {
                headers: {
                    'Authorization': `Bearer ${this.token}`,
                    'Content-Type': 'application/json'
                }
            });

            if (response.ok) {
                const data = await response.json();
                this.renderDiscoverTable(container, data.data.rankings);
                this.cache.discover = data.data.rankings;
            } else {
                this.showError('Failed to load user rankings');
            }
        } catch (error) {
            console.error('Error loading discover tab:', error);
            this.showError('Failed to load user rankings');
        }
    }

    async loadActivities() {
        const container = document.getElementById('activities-list');
        this.showLoading(container);

        try {
            const response = await fetch('/api/social/activities?limit=20', {
                headers: {
                    'Authorization': `Bearer ${this.token}`,
                    'Content-Type': 'application/json'
                }
            });

            if (response.ok) {
                const data = await response.json();
                this.renderActivities(container, data.data);
                this.cache.activities = data.data;
            } else {
                this.showError('Failed to load trading activities');
            }
        } catch (error) {
            console.error('Error loading activities:', error);
            this.showError('Failed to load trading activities');
        }
    }

    renderUserList(container, users, type) {
        if (users.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <div class="empty-icon">
                        <i class="fas fa-users"></i>
                    </div>
                    <h3>No ${type === 'following' ? 'Following' : 'Followers'} Yet</h3>
                    <p>${type === 'following' ? 'Start following other traders to see their activities!' : 'No one is following you yet. Keep trading to attract followers!'}</p>
                </div>
            `;
            return;
        }

        const userCards = users.map(user => `
            <div class="user-card" data-user-id="${user.id}">
                <div class="user-avatar">
                    <div class="avatar-placeholder">
                        <i class="fas fa-user"></i>
                    </div>
                </div>
                <div class="user-info">
                    <div class="user-header">
                        <h4 class="username">${this.escapeHtml(user.username)}</h4>
                        <div class="user-stats">
                            <span class="stat">
                                <i class="fas fa-wallet"></i>
                                $${this.formatNumber(user.usd_balance + (user.btc_balance * 50000))}
                            </span>
                        </div>
                    </div>
                    <div class="user-meta">
                        <span class="joined-date">
                            <i class="fas fa-calendar"></i>
                            Joined ${this.formatDate(user.created_at)}
                        </span>
                        <span class="follow-date">
                            <i class="fas fa-heart"></i>
                            ${type === 'following' ? 'Following' : 'Follower'} since ${this.formatDate(user.followed_at)}
                        </span>
                    </div>
                </div>
                <div class="user-actions">
                    ${type === 'following' ? 
                        `<button class="btn btn-danger btn-sm unfollow-btn" data-user-id="${user.id}">
                            <i class="fas fa-user-minus"></i> Unfollow
                        </button>` :
                        `<button class="btn btn-primary btn-sm follow-btn" data-user-id="${user.id}">
                            <i class="fas fa-user-plus"></i> Follow Back
                        </button>`
                    }
                </div>
            </div>
        `).join('');

        container.innerHTML = `<div class="users-grid">${userCards}</div>`;

        // Add event listeners for follow/unfollow buttons
        container.querySelectorAll('.follow-btn, .unfollow-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const userId = parseInt(e.currentTarget.dataset.userId);
                const isUnfollow = e.currentTarget.classList.contains('unfollow-btn');
                
                if (isUnfollow) {
                    this.unfollowUser(userId);
                } else {
                    this.followUser(userId);
                }
            });
        });
    }

    renderDiscoverTable(container, rankings) {
        if (rankings.length === 0) {
            container.innerHTML = `
                <tr>
                    <td colspan="6" class="text-center">
                        <div class="empty-state">
                            <div class="empty-icon">
                                <i class="fas fa-search"></i>
                            </div>
                            <h3>No Users Found</h3>
                            <p>No trading data available.</p>
                        </div>
                    </td>
                </tr>
            `;
            return;
        }

        const rows = rankings.map(user => `
            <tr data-user-id="${user.id}" class="${user.id === this.currentUser.id ? 'current-user' : ''}">
                <td class="rank-col">
                    <span class="rank-badge">#${user.rank}</span>
                </td>
                <td class="username-col">
                    <div class="user-info">
                        <span class="username">${this.escapeHtml(user.username)}</span>
                        ${user.id === this.currentUser.id ? '<span class="you-badge">You</span>' : ''}
                    </div>
                </td>
                <td class="assets-col">
                    <span class="asset-value">$${this.formatNumber(user.total_assets)}</span>
                </td>
                <td class="roi-col">
                    <span class="roi-value ${(user.roi || 0) >= 0 ? 'positive' : 'negative'}">
                        ${(user.roi || 0) >= 0 ? '+' : ''}${(parseFloat(user.roi) || 0).toFixed(2)}%
                    </span>
                </td>
                <td class="trades-col">
                    <span class="trades-count">${user.total_trades}</span>
                </td>
                <td class="action-col">
                    ${user.id !== this.currentUser.id ? `
                        <button class="btn btn-primary btn-sm follow-toggle-btn" 
                                data-user-id="${user.id}" 
                                data-following="false">
                            <i class="fas fa-user-plus"></i> Follow
                        </button>
                    ` : '<span class="text-muted">—</span>'}
                </td>
            </tr>
        `).join('');

        container.innerHTML = rows;

        // Check follow status for all users and update buttons
        this.updateFollowButtons(container);

        // Add event listeners
        container.querySelectorAll('.follow-toggle-btn').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const userId = parseInt(e.currentTarget.dataset.userId);
                const isFollowing = e.currentTarget.dataset.following === 'true';
                
                if (isFollowing) {
                    await this.unfollowUser(userId);
                } else {
                    await this.followUser(userId);
                }
            });
        });
    }

    renderActivities(container, activities) {
        if (activities.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <div class="empty-icon">
                        <i class="fas fa-chart-line"></i>
                    </div>
                    <h3>No Recent Activities</h3>
                    <p>No recent trading activities from users you follow. Activities are shown with a 10-minute delay.</p>
                </div>
            `;
            return;
        }

        const activityCards = activities.map(activity => {
            const transaction = activity.transaction;
            const isProfit = transaction.pnl && parseFloat(transaction.pnl) > 0;
            
            return `
                <div class="activity-card">
                    <div class="activity-header">
                        <div class="user-info">
                            <div class="avatar-small">
                                <i class="fas fa-user"></i>
                            </div>
                            <span class="username">${this.escapeHtml(activity.username)}</span>
                        </div>
                        <div class="activity-time">
                            <i class="fas fa-clock"></i>
                            ${this.formatRelativeTime(new Date(activity.timestamp || transaction.timestamp))}
                        </div>
                    </div>
                    <div class="activity-content">
                        <div class="trade-info">
                            <div class="trade-type">
                                <span class="type-badge ${transaction.type}">${transaction.type.toUpperCase()}</span>
                                <span class="market">${transaction.market || 'BTC/USDT'}</span>
                            </div>
                            <div class="trade-details">
                                <span class="amount">${this.formatNumber(transaction.amount || 0)} ${transaction.asset || 'BTC'}</span>
                                <span class="price">@ $${this.formatNumber(transaction.price || 0)}</span>
                            </div>
                        </div>
                        ${transaction.pnl ? `
                            <div class="trade-pnl ${isProfit ? 'profit' : 'loss'}">
                                <i class="fas fa-${isProfit ? 'arrow-up' : 'arrow-down'}"></i>
                                ${isProfit ? '+' : ''}${this.formatNumber(transaction.pnl)} USDT
                            </div>
                        ` : ''}
                    </div>
                </div>
            `;
        }).join('');

        container.innerHTML = `<div class="activities-grid">${activityCards}</div>`;
    }

    async updateFollowButtons(container) {
        const buttons = container.querySelectorAll('.follow-toggle-btn');
        
        for (const btn of buttons) {
            const userId = parseInt(btn.dataset.userId);
            try {
                const response = await fetch(`/api/social/is-following/${userId}`, {
                    headers: {
                        'Authorization': `Bearer ${this.token}`,
                        'Content-Type': 'application/json'
                    }
                });

                if (response.ok) {
                    const data = await response.json();
                    const isFollowing = data.data.isFollowing;
                    
                    btn.dataset.following = isFollowing;
                    btn.innerHTML = isFollowing ? 
                        '<i class="fas fa-user-minus"></i> Unfollow' : 
                        '<i class="fas fa-user-plus"></i> Follow';
                    btn.className = isFollowing ? 
                        'btn btn-danger btn-sm follow-toggle-btn' : 
                        'btn btn-primary btn-sm follow-toggle-btn';
                }
            } catch (error) {
                console.error('Error checking follow status:', error);
            }
        }
    }

    async followUser(userId) {
        try {
            const response = await fetch('/api/social/follow', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ userId })
            });

            if (response.ok) {
                this.showSuccess('User followed successfully');
                
                // Update UI
                const btn = document.querySelector(`[data-user-id="${userId}"].follow-toggle-btn`);
                if (btn) {
                    btn.dataset.following = 'true';
                    btn.innerHTML = '<i class="fas fa-user-minus"></i> Unfollow';
                    btn.className = 'btn btn-danger btn-sm follow-toggle-btn';
                }
                
                // Refresh stats and relevant tabs
                await this.loadSocialStats();
                this.invalidateCache(['following']);
            } else {
                const error = await response.json();
                this.showError(error.error || 'Failed to follow user');
            }
        } catch (error) {
            console.error('Error following user:', error);
            this.showError('Failed to follow user');
        }
    }

    async unfollowUser(userId) {
        try {
            const response = await fetch('/api/social/unfollow', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ userId })
            });

            if (response.ok) {
                this.showSuccess('User unfollowed successfully');
                
                // Update UI
                const btn = document.querySelector(`[data-user-id="${userId}"].follow-toggle-btn, [data-user-id="${userId}"].unfollow-btn`);
                if (btn) {
                    if (btn.classList.contains('follow-toggle-btn')) {
                        btn.dataset.following = 'false';
                        btn.innerHTML = '<i class="fas fa-user-plus"></i> Follow';
                        btn.className = 'btn btn-primary btn-sm follow-toggle-btn';
                    } else {
                        // Remove user card if in following list
                        const userCard = btn.closest('.user-card');
                        if (userCard) {
                            userCard.remove();
                        }
                    }
                }
                
                // Refresh stats and relevant tabs
                await this.loadSocialStats();
                this.invalidateCache(['following', 'activities']);
                
                // Refresh current tab if it's following
                if (this.currentTab === 'following') {
                    await this.loadFollowing();
                }
            } else {
                const error = await response.json();
                this.showError(error.error || 'Failed to unfollow user');
            }
        } catch (error) {
            console.error('Error unfollowing user:', error);
            this.showError('Failed to unfollow user');
        }
    }

    async searchUsers() {
        const searchInput = document.getElementById('user-search');
        const query = searchInput.value.trim();
        
        if (!query) {
            this.loadDiscoverTab(); // Load default rankings
            return;
        }

        const container = document.getElementById('discover-table-body');
        this.showLoading(container);

        // For now, we'll filter the cached rankings by username
        // In a real app, you'd have a dedicated search API
        if (this.cache.discover) {
            const filtered = this.cache.discover.filter(user => 
                user.username.toLowerCase().includes(query.toLowerCase())
            );
            this.renderDiscoverTable(container, filtered);
        } else {
            this.loadDiscoverTab();
        }
    }

    showLoading(container) {
        container.innerHTML = `
            <div class="loading-state">
                <div class="loading-spinner">
                    <i class="fas fa-spinner fa-spin"></i>
                </div>
                <p>Loading...</p>
            </div>
        `;
    }

    showError(message) {
        this.showToast(message, 'error');
    }

    showSuccess(message) {
        this.showToast(message, 'success');
    }

    showToast(message, type = 'info', duration = 5000) {
        const toastContainer = document.getElementById('toast-container') || this.createToastContainer();
        
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.textContent = message;
        
        // Add close button for manual dismiss
        const closeBtn = document.createElement('button');
        closeBtn.innerHTML = '×';
        closeBtn.className = 'toast-close';
        closeBtn.onclick = () => this.removeToast(toast);
        toast.appendChild(closeBtn);
        
        // Add to container with animation
        toastContainer.appendChild(toast);
        
        // Trigger enter animation
        setTimeout(() => {
            toast.classList.add('show');
        }, 10);
        
        // Auto remove after duration
        const autoRemoveTimeout = setTimeout(() => {
            this.removeToast(toast);
        }, duration);
        
        // Store timeout reference for manual dismiss
        toast._autoRemoveTimeout = autoRemoveTimeout;
    }

    createToastContainer() {
        const container = document.createElement('div');
        container.id = 'toast-container';
        container.className = 'toast-container';
        document.body.appendChild(container);
        return container;
    }

    // Remove toast with animation
    removeToast(toast) {
        if (!toast || !toast.parentNode) return;
        
        // Clear auto-remove timeout
        if (toast._autoRemoveTimeout) {
            clearTimeout(toast._autoRemoveTimeout);
        }
        
        // Add exit animation
        toast.classList.add('hide');
        
        // Remove after animation completes
        setTimeout(() => {
            if (toast.parentNode) {
                toast.remove();
            }
        }, 300);
    }

    invalidateCache(keys) {
        keys.forEach(key => {
            this.cache[key] = null;
        });
    }

    formatNumber(num) {
        if (num >= 1000000) {
            return (num / 1000000).toFixed(1) + 'M';
        } else if (num >= 1000) {
            return (num / 1000).toFixed(1) + 'K';
        }
        return num.toLocaleString();
    }

    formatDate(dateString) {
        const date = new Date(dateString);
        return date.toLocaleDateString('en-US', { 
            year: 'numeric', 
            month: 'short', 
            day: 'numeric' 
        });
    }

    formatRelativeTime(date) {
        const now = new Date();
        const diffMs = now - date;
        const diffMinutes = Math.floor(diffMs / 60000);
        const diffHours = Math.floor(diffMs / 3600000);
        const diffDays = Math.floor(diffMs / 86400000);

        if (diffMinutes < 1) {
            return 'Just now';
        } else if (diffMinutes < 60) {
            return `${diffMinutes}m ago`;
        } else if (diffHours < 24) {
            return `${diffHours}h ago`;
        } else {
            return `${diffDays}d ago`;
        }
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', async () => {
    // Check if we're on the social page
    if (document.querySelector('.social-wrapper')) {
        // Check login status first
        const isLoggedIn = await checkLoginStatus();
        if (isLoggedIn) {
            window.socialHub = new SocialHub();
        }
    }
});
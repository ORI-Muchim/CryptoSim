// Version: 1.0.2 - Fixed BTC balance profit calculation consistency
// Settings Page JavaScript
let currentUser = null;
let isLoggedIn = false;
let transactions = [];
let leveragePositions = [];
let usdBalance = 10000;
let btcBalance = 0;
let ethBalance = 0;
let userTimezone = 'UTC';


// Initialize application
document.addEventListener('DOMContentLoaded', async () => {
    console.log('Settings page loaded, initializing...');
    await checkLoginStatus();
    setupSettingsPage();
});

// Check if user is logged in
async function checkLoginStatus() {
    const token = localStorage.getItem('token');
    const username = localStorage.getItem('username');
    
    if (!token || !username) {
        window.location.href = '/login';
        return;
    }
    
    currentUser = username;
    isLoggedIn = true;
    document.getElementById('current-user').textContent = username;
    
    // Load user data
    await loadUserData();
    
    // If loadUserData succeeded, user is authenticated
    if (isLoggedIn) {
        updateUI();
        setupUserDropdown();
    }
}

// Setup user dropdown
function setupUserDropdown() {
    const userDropdown = document.querySelector('.user-dropdown');
    const dropdownMenu = document.querySelector('.dropdown-menu');
    const logoutBtn = document.getElementById('logout-btn');

    if (userDropdown && dropdownMenu) {
        userDropdown.addEventListener('click', (e) => {
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

    if (logoutBtn) {
        logoutBtn.addEventListener('click', (e) => {
            e.preventDefault();
            logout();
        });
    }
}

// Timezone conversion utility function
function formatTimestampWithTimezone(timestamp, timezone = userTimezone) {
    const date = new Date(timestamp * 1000);
    
    try {
        const options = {
            timeZone: timezone,
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            hour12: false
        };
        return date.toLocaleString('en-US', options);
    } catch (error) {
        // Fallback to UTC if timezone is invalid
        return date.toISOString().replace('T', ' ').substring(0, 16);
    }
}

// Logout function
async function logout() {
    // Save data in background (non-blocking)
    saveUserData().catch(err => console.log('Save failed during logout:', err));
    
    currentUser = null;
    isLoggedIn = false;
    localStorage.removeItem('token');
    localStorage.removeItem('username');
    
    showToast('Logging out...', 'info');
    
    // Immediate redirect
    window.location.href = '/login';
}

// Load user data
async function loadUserData() {
    const token = localStorage.getItem('token');
    if (!token) return;
    
    try {
        const response = await fetch('/api/user/data', {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        
        if (response.ok) {
            const apiResponse = await response.json();
            console.log('Settings: Raw API response:', apiResponse);
            
            // Handle both old and new API response formats
            const userData = apiResponse.data || apiResponse;
            console.log('Settings: Processed user data:', userData);
            
            usdBalance = Number.isFinite(userData.usdBalance) ? userData.usdBalance : 10000;
            btcBalance = Number.isFinite(userData.btcBalance) ? userData.btcBalance : 0;
            ethBalance = Number.isFinite(userData.ethBalance) ? userData.ethBalance : 0;
            transactions = userData.transactions || [];
            leveragePositions = userData.leveragePositions || [];
            userTimezone = userData.timezone || 'UTC';
            
            console.log('Settings: Final values after loading:', {
                usdBalance, btcBalance, ethBalance, transactionsCount: transactions.length, 
                leveragePositionsCount: leveragePositions.length, userTimezone
            });
            
            console.log('Loaded user timezone from server:', userData.timezone);
            console.log('Set userTimezone to:', userTimezone);
            
            // Update member since date
            if (userData.memberSince) {
                const memberDate = new Date(userData.memberSince);
                const today = new Date();
                const diffTime = Math.abs(today - memberDate);
                const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                
                let memberSinceText;
                if (diffDays === 0) {
                    memberSinceText = 'Today';
                } else if (diffDays === 1) {
                    memberSinceText = 'Yesterday';
                } else if (diffDays < 30) {
                    memberSinceText = `${diffDays} days ago`;
                } else if (diffDays < 365) {
                    const months = Math.floor(diffDays / 30);
                    memberSinceText = `${months} month${months > 1 ? 's' : ''} ago`;
                } else {
                    const years = Math.floor(diffDays / 365);
                    memberSinceText = `${years} year${years > 1 ? 's' : ''} ago`;
                }
                
                const memberSinceElement = document.getElementById('member-since');
                if (memberSinceElement) {
                    memberSinceElement.textContent = memberSinceText;
                }
            }
            
        } else if (response.status === 401) {
            // Token expired or invalid
            isLoggedIn = false;
            logout();
        }
    } catch (error) {
        console.error('Error loading user data:', error);
    }
}

// Save user data
async function saveUserData() {
    const token = localStorage.getItem('token');
    if (!token) return;
    
    try {
        const response = await fetch('/api/user/data', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                usdBalance,
                btcBalance,
                transactions,
                leveragePositions,
                timezone: userTimezone
            })
        });
        
        if (response.ok) {
            console.log('User data saved successfully');
        } else if (response.status === 401) {
            // Token expired or invalid
            logout();
        }
    } catch (error) {
        console.error('Error saving user data:', error);
    }
}

// Update UI with current data
function updateUI() {
    console.log('Settings updateUI: Starting with values:', { usdBalance, btcBalance, isLoggedIn });
    
    const currentPrice = getCurrentPrice();
    const portfolioValue = usdBalance + (btcBalance * currentPrice);
    const btcValue = btcBalance * currentPrice;
    const btcPercentage = portfolioValue > 0 ? (btcValue / portfolioValue) * 100 : 0;
    
    // Update navigation balance displays
    const usdBalanceElement = document.getElementById('krw-balance');
    if (usdBalanceElement) {
        let formattedUsdBalance;
        try {
            formattedUsdBalance = Number.isFinite(usdBalance) ? 
                usdBalance.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2}) : '0.00';
        } catch (error) {
            console.error('Error formatting USD balance in settings:', error, { usdBalance });
            formattedUsdBalance = '0.00';
        }
        usdBalanceElement.textContent = `$${formattedUsdBalance}`;
    }
    
    // Update crypto balance in navigation (BTC or ETH)
    const btcBalanceElement = document.getElementById('btc-balance');
    const cryptoLabelEl = document.getElementById('crypto-balance-label');
    if (btcBalanceElement) {
        // Get current market from localStorage to determine which balance to show
        const currentMarket = localStorage.getItem('selectedMarket') || 'BTC/USDT';
        const [crypto] = currentMarket.split('/');
        
        if (crypto === 'ETH') {
            if (cryptoLabelEl) cryptoLabelEl.textContent = 'ETH Balance';
            btcBalanceElement.textContent = ethBalance.toFixed(8);
        } else {
            if (cryptoLabelEl) cryptoLabelEl.textContent = 'BTC Balance';
            btcBalanceElement.textContent = btcBalance.toFixed(8);
        }
    }
    
    // Update settings page elements if they exist
    const portfolioValueElement = document.getElementById('portfolio-value');
    if (portfolioValueElement) {
        let formattedPortfolioValue;
        try {
            formattedPortfolioValue = Number.isFinite(portfolioValue) ? 
                portfolioValue.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2}) : '0.00';
        } catch (error) {
            console.error('Error formatting portfolio value in settings:', error, { portfolioValue });
            formattedPortfolioValue = '0.00';
        }
        portfolioValueElement.textContent = `$${formattedPortfolioValue}`;
    }
    
    const totalTradesElement = document.getElementById('total-trades');
    if (totalTradesElement) {
        totalTradesElement.textContent = transactions.length.toString();
    }
}

// Get current price (placeholder - in real app this would come from WebSocket)
function getCurrentPrice() {
    return 50000; // Placeholder price
}

// Calculate spot profit/loss for each cryptocurrency (same logic as main trading page)
function calculateSpotProfitLoss() {
    const spotProfits = {};
    
    // Process each market (assuming BTC for now)
    ['BTC-USDT'].forEach(market => {
        const [crypto] = market.split('-');
        const currentBalance = btcBalance;
        
        if (currentBalance <= 0) {
            spotProfits[crypto] = {
                totalInvested: 0,
                currentValue: 0,
                profit: 0,
                profitPercent: 0,
                averageBuyPrice: 0
            };
            return;
        }
        
        // Calculate average buy price from transactions (time-ordered)
        const relevantTransactions = transactions.filter(tx => 
            (tx.market === market || tx.market === `${crypto}/USDT` || tx.type === 'buy' || tx.type === 'sell') &&
            (tx.type === 'buy' || tx.type === 'sell')
        ).sort((a, b) => new Date(a.time) - new Date(b.time));
        
        let runningBalance = 0;
        let averageBuyPrice = 0;
        
        // Process transactions in chronological order
        relevantTransactions.forEach((tx) => {
            if (tx.type === 'buy') {
                // Calculate new weighted average buy price
                const newBalance = runningBalance + (tx.amount || 0);
                if (newBalance > 0) {
                    averageBuyPrice = ((averageBuyPrice * runningBalance) + ((tx.price || 0) * (tx.amount || 0))) / newBalance;
                }
                runningBalance = newBalance;
            } else if (tx.type === 'sell') {
                // Sell reduces balance but keeps average buy price unchanged
                runningBalance -= (tx.amount || 0);
                if (runningBalance <= 0) {
                    runningBalance = 0;
                    averageBuyPrice = 0;
                }
            }
        });
        
        // Use current price
        const currentMarketPrice = getCurrentPrice();
        const currentValue = currentBalance * currentMarketPrice;
        const totalInvested = currentBalance * averageBuyPrice;
        const profit = currentValue - totalInvested;
        const profitPercent = totalInvested > 0 ? (profit / totalInvested) * 100 : 0;
        
        spotProfits[crypto] = {
            totalInvested,
            currentValue,
            profit,
            profitPercent,
            averageBuyPrice
        };
    });
    
    return spotProfits;
}

// Setup settings page functionality
function setupSettingsPage() {
    const timezoneSelect = document.getElementById('timezone-select');
    const currentTimeDisplay = document.getElementById('current-time-display');
    const saveSettingsBtn = document.getElementById('save-settings-btn');
    const resetAccountBtn = document.getElementById('reset-account-btn');
    const resetModal = document.getElementById('reset-confirmation-modal');
    const closeResetModal = document.getElementById('close-reset-modal');
    const cancelResetBtn = document.getElementById('cancel-reset-btn');
    const confirmResetBtn = document.getElementById('confirm-reset-btn');

    // Load current timezone setting first
    console.log('Loading timezone:', userTimezone);
    
    // Setup custom dropdown
    setupCustomDropdown();

    // Set timezone value after dropdown is setup
    setTimeout(() => {
        setTimezoneValue(userTimezone);
        updateCurrentTimeDisplay();
    }, 100);

    // Save settings
    saveSettingsBtn.addEventListener('click', async () => {
        const newTimezone = timezoneSelect.value;
        userTimezone = newTimezone;
        
        // Save to server (timezone already saved immediately via saveTimezoneChange)
        await saveUserData();
        
        // Update UI
        updateCurrentTimeDisplay();
        showToast('Settings saved successfully', 'success');
    });

    // Reset account data
    resetAccountBtn.addEventListener('click', () => {
        resetModal.classList.remove('hidden');
        setTimeout(() => resetModal.classList.add('show'), 10);
    });

    // Close reset modal
    closeResetModal.addEventListener('click', () => {
        resetModal.classList.remove('show');
        setTimeout(() => resetModal.classList.add('hidden'), 300);
    });

    cancelResetBtn.addEventListener('click', () => {
        resetModal.classList.remove('show');
        setTimeout(() => resetModal.classList.add('hidden'), 300);
    });

    // Confirm reset
    confirmResetBtn.addEventListener('click', async () => {
        // Reset data
        usdBalance = 10000;
        btcBalance = 0;
        transactions = [];
        leveragePositions = [];
        
        // Save to server
        await saveUserData();
        
        // Update UI
        updateUI();
        
        // Close modal
        resetModal.classList.remove('show');
        setTimeout(() => resetModal.classList.add('hidden'), 300);
        
        showToast('Account data has been reset', 'success');
    });

    // Close modal when clicking outside
    resetModal.addEventListener('click', (e) => {
        if (e.target === resetModal) {
            resetModal.classList.remove('show');
            setTimeout(() => resetModal.classList.add('hidden'), 300);
        }
    });


    // Update time display every second
    setInterval(updateCurrentTimeDisplay, 1000);
    
    // Setup Trading Sounds toggle
    setupTradingSoundsToggle();
    
    // Setup Alert Settings
    setupAlertSettings();
}

// Setup custom dropdown functionality
function setupCustomDropdown() {
    const trigger = document.getElementById('timezone-select-trigger');
    const options = document.getElementById('timezone-select-options');
    const customOptions = document.querySelectorAll('.custom-option');
    const hiddenSelect = document.getElementById('timezone-select');

    // Toggle dropdown
    trigger.addEventListener('click', (e) => {
        e.stopPropagation();
        trigger.classList.toggle('active');
        
        if (options.classList.contains('show')) {
            options.classList.remove('show');
        } else {
            // Position the dropdown relative to the trigger
            const rect = trigger.getBoundingClientRect();
            options.style.setProperty('--dropdown-top', `${rect.bottom + window.scrollY}px`);
            options.style.setProperty('--dropdown-left', `${rect.left + window.scrollX}px`);
            options.style.setProperty('--dropdown-width', `${rect.width}px`);
            options.classList.add('show');
        }
    });

    // Handle option selection
    customOptions.forEach(option => {
        option.addEventListener('click', (e) => {
            e.stopPropagation();
            
            // Remove selected class from all options
            customOptions.forEach(opt => opt.classList.remove('selected'));
            
            // Add selected class to clicked option
            option.classList.add('selected');
            
            // Update trigger text
            document.getElementById('timezone-selected-text').textContent = option.textContent;
            
            // Update hidden select value
            const value = option.getAttribute('data-value');
            hiddenSelect.value = value;
            userTimezone = value;
            
            // Close dropdown
            trigger.classList.remove('active');
            options.classList.remove('show');
            
            // Update time display
            updateCurrentTimeDisplay();
            
            // Auto-save timezone change to DB immediately
            saveTimezoneChange(value);
        });
    });

    // Close dropdown when clicking outside
    document.addEventListener('click', (e) => {
        if (!trigger.contains(e.target) && !options.contains(e.target)) {
            trigger.classList.remove('active');
            options.classList.remove('show');
        }
    });

    // Close dropdown on escape key
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            trigger.classList.remove('active');
            options.classList.remove('show');
        }
    });
}

// Set timezone value in custom dropdown
function setTimezoneValue(timezone) {
    console.log('setTimezoneValue called with:', timezone);
    
    const hiddenSelect = document.getElementById('timezone-select');
    const customOptions = document.querySelectorAll('.custom-option');
    const selectedText = document.getElementById('timezone-selected-text');
    
    console.log('Elements found:', {
        hiddenSelect: !!hiddenSelect,
        customOptions: customOptions.length,
        selectedText: !!selectedText
    });
    
    if (!hiddenSelect || !selectedText || customOptions.length === 0) {
        console.error('Required elements not found for timezone setting');
        return;
    }
    
    // Update hidden select
    hiddenSelect.value = timezone;
    
    // Update custom dropdown display
    let found = false;
    customOptions.forEach(option => {
        option.classList.remove('selected');
        if (option.getAttribute('data-value') === timezone) {
            option.classList.add('selected');
            selectedText.textContent = option.textContent;
            found = true;
            console.log('Found and set timezone option:', timezone, option.textContent);
        }
    });
    
    if (!found) {
        console.warn('Timezone option not found:', timezone);
        // Fallback to UTC
        customOptions.forEach(option => {
            if (option.getAttribute('data-value') === 'UTC') {
                option.classList.add('selected');
                selectedText.textContent = option.textContent;
            }
        });
    }
    
    userTimezone = timezone;
}

// Immediately save timezone change to database
async function saveTimezoneChange(timezone) {
    const token = localStorage.getItem('token');
    if (!token) return;
    
    try {
        const response = await fetch('/api/user/data', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                usdBalance,
                btcBalance,
                transactions,
                leveragePositions,
                timezone: timezone
            })
        });
        
        if (response.ok) {
            console.log('Timezone saved to database immediately:', timezone);
            // Also update localStorage for other pages to sync
            localStorage.setItem('timezone', timezone);
        } else if (response.status === 401) {
            logout();
        }
    } catch (error) {
        console.error('Error saving timezone change:', error);
    }
}

// Toast notification functions - matching script.js implementation
// Setup alert settings functionality
async function setupAlertSettings() {
    const priceAlertsToggle = document.getElementById('price-alerts-toggle');
    const alertThresholdSlider = document.getElementById('alert-threshold');
    const thresholdValue = document.getElementById('threshold-value');
    const browserNotificationsToggle = document.getElementById('browser-notifications-toggle');
    const alertSoundToggle = document.getElementById('alert-sound-toggle');
    const emailAlertsToggle = document.getElementById('email-alerts-toggle');
    
    // Load alert settings from server
    await loadAlertSettings();
    
    // Update threshold display
    if (alertThresholdSlider) {
        alertThresholdSlider.addEventListener('input', (e) => {
            thresholdValue.textContent = `${parseFloat(e.target.value).toFixed(1)}%`;
        });
        
        alertThresholdSlider.addEventListener('change', async (e) => {
            await saveAlertSettings();
        });
    }
    
    // Toggle event listeners
    const toggles = [
        { element: priceAlertsToggle, textId: 'price-alerts-text' },
        { element: browserNotificationsToggle, textId: 'browser-notifications-text' },
        { element: alertSoundToggle, textId: 'alert-sound-text' }
    ];
    
    toggles.forEach(({ element, textId }) => {
        if (element) {
            element.addEventListener('change', async (e) => {
                const text = document.getElementById(textId);
                if (text) {
                    text.textContent = e.target.checked ? 'Enabled' : 'Disabled';
                }
                
                // Request browser notification permission if enabling
                if (element === browserNotificationsToggle && e.target.checked) {
                    if ('Notification' in window) {
                        if (Notification.permission === 'default') {
                            const permission = await Notification.requestPermission();
                            if (permission !== 'granted') {
                                e.target.checked = false;
                                text.textContent = 'Disabled';
                                showToast('Browser notifications permission denied', 'warning');
                                return;
                            } else {
                                showToast('Browser notifications enabled!', 'success');
                                // Show test notification
                                setTimeout(() => {
                                    new Notification('Notifications Enabled!', {
                                        body: 'You will now receive price alerts and trade notifications.',
                                        icon: '/favicon.ico'
                                    });
                                }, 1000);
                            }
                        } else if (Notification.permission === 'denied') {
                            e.target.checked = false;
                            text.textContent = 'Disabled';
                            showToast('Browser notifications are blocked. Please enable them in your browser settings.', 'warning');
                            return;
                        } else {
                            showToast('Browser notifications updated!', 'success');
                        }
                    } else {
                        e.target.checked = false;
                        text.textContent = 'Disabled';
                        showToast('Your browser does not support notifications', 'error');
                        return;
                    }
                }
                
                await saveAlertSettings();
            });
        }
    });
}

// Load alert settings from server
async function loadAlertSettings() {
    const token = localStorage.getItem('token');
    
    try {
        const response = await fetch('/api/alerts/settings', {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        
        if (response.ok) {
            const result = await response.json();
            const settings = result.data;
            
            // Apply settings to UI
            const priceAlertsToggle = document.getElementById('price-alerts-toggle');
            const alertThresholdSlider = document.getElementById('alert-threshold');
            const thresholdValue = document.getElementById('threshold-value');
            const browserNotificationsToggle = document.getElementById('browser-notifications-toggle');
            const alertSoundToggle = document.getElementById('alert-sound-toggle');
            
            if (priceAlertsToggle) {
                priceAlertsToggle.checked = settings.price_alert_enabled;
                document.getElementById('price-alerts-text').textContent = 
                    settings.price_alert_enabled ? 'Enabled' : 'Disabled';
            }
            
            if (alertThresholdSlider) {
                alertThresholdSlider.value = settings.price_alert_threshold;
                thresholdValue.textContent = `${parseFloat(settings.price_alert_threshold).toFixed(1)}%`;
            }
            
            if (browserNotificationsToggle) {
                browserNotificationsToggle.checked = settings.browser_alerts;
                document.getElementById('browser-notifications-text').textContent = 
                    settings.browser_alerts ? 'Enabled' : 'Disabled';
            }
            
            if (alertSoundToggle) {
                alertSoundToggle.checked = settings.sound_enabled;
                document.getElementById('alert-sound-text').textContent = 
                    settings.sound_enabled ? 'Enabled' : 'Disabled';
            }
        }
    } catch (error) {
        console.error('Error loading alert settings:', error);
    }
}

// Save alert settings to server
async function saveAlertSettings() {
    const token = localStorage.getItem('token');
    
    const settings = {
        price_alert_enabled: document.getElementById('price-alerts-toggle')?.checked || false,
        price_alert_threshold: parseFloat(document.getElementById('alert-threshold')?.value || 1),
        email_alerts: document.getElementById('email-alerts-toggle')?.checked || false,
        browser_alerts: document.getElementById('browser-notifications-toggle')?.checked || true,
        sound_enabled: document.getElementById('alert-sound-toggle')?.checked || true
    };
    
    try {
        const response = await fetch('/api/alerts/settings', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify(settings)
        });
        
        if (response.ok) {
            showToast('Alert settings saved', 'success', 2000);
        } else {
            showToast('Failed to save alert settings', 'error');
        }
    } catch (error) {
        console.error('Error saving alert settings:', error);
        showToast('Failed to save alert settings', 'error');
    }
}

function showToast(message, type = 'info', duration = 5000) {
    const toastContainer = document.getElementById('toast-container') || createToastContainer();
    
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    
    // Add close button for manual dismiss
    const closeBtn = document.createElement('button');
    closeBtn.innerHTML = '×';
    closeBtn.className = 'toast-close';
    closeBtn.onclick = () => removeToast(toast);
    toast.appendChild(closeBtn);
    
    // Add to container with animation
    toastContainer.appendChild(toast);
    
    // Trigger enter animation
    setTimeout(() => {
        toast.classList.add('show');
    }, 10);
    
    // Auto remove after duration
    const autoRemoveTimeout = setTimeout(() => {
        removeToast(toast);
    }, duration);
    
    // Store timeout reference for manual dismiss
    toast._autoRemoveTimeout = autoRemoveTimeout;
}

// Create toast container if it doesn't exist
function createToastContainer() {
    const container = document.createElement('div');
    container.id = 'toast-container';
    container.className = 'toast-container';
    document.body.appendChild(container);
    return container;
}

// Remove toast with animation
function removeToast(toast) {
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

// Setup Trading Sounds toggle functionality
function setupTradingSoundsToggle() {
    const toggle = document.getElementById('trading-sounds-toggle');
    const toggleText = document.getElementById('trading-sounds-text');
    
    if (!toggle || !toggleText) return;
    
    // Load current setting from localStorage
    const isEnabled = localStorage.getItem('trading-sounds-enabled') !== 'false';
    toggle.checked = isEnabled;
    toggleText.textContent = isEnabled ? 'Enabled' : 'Disabled';
    
    // Handle toggle change
    toggle.addEventListener('change', (e) => {
        const enabled = e.target.checked;
        localStorage.setItem('trading-sounds-enabled', enabled);
        toggleText.textContent = enabled ? 'Enabled' : 'Disabled';
        
        showToast(
            `Trading sounds ${enabled ? 'enabled' : 'disabled'}`, 
            'success', 
            3000
        );
    });
}

// Update current time display (global function)
function updateCurrentTimeDisplay() {
    const timezoneSelect = document.getElementById('timezone-select');
    const currentTimeDisplay = document.getElementById('current-time-display');
    
    if (!timezoneSelect || !currentTimeDisplay) {
        return; // Elements not available yet
    }
    
    const selectedTimezone = timezoneSelect.value || userTimezone;
    const now = new Date();
    const options = {
        timeZone: selectedTimezone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
    };
    
    try {
        const formattedTime = now.toLocaleString('en-US', options);
        currentTimeDisplay.textContent = `${formattedTime} (${selectedTimezone})`;
    } catch (error) {
        console.error('Error formatting time:', error);
        currentTimeDisplay.textContent = `${now.toISOString()} (UTC)`;
    }
}
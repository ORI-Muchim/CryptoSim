// History Page JavaScript
let currentUser = null;
let isLoggedIn = false;
let transactions = [];
let usdBalance = 10000;
let btcBalance = 0;
let currentPrice = 0;
let assetChart = null;
let userTimezone = 'UTC'; // Default timezone

// Initialize application
document.addEventListener('DOMContentLoaded', () => {
    console.log('History page loaded, initializing...');
    checkLoginStatus();
});

// Check if user is logged in
async function checkLoginStatus() {
    const token = localStorage.getItem('token');
    const username = localStorage.getItem('username');
    
    if (token && username) {
        currentUser = username;
        isLoggedIn = true;
        document.getElementById('current-user').textContent = `${currentUser}`;
        
        // Load user data
        await loadUserData();
        
        if (isLoggedIn) {
            initializeHistoryPage();
        }
    } else {
        // Redirect to login page
        window.location.href = '/login.html';
    }
}

// Initialize history page
function initializeHistoryPage() {
    setupEventListeners();
    loadTransactionHistory();
    calculateTradingStats();
    initializeAssetTrendChart();
    updateBalanceDisplay();
}

// Setup event listeners
function setupEventListeners() {
    // Navigation buttons
    const navTrade = document.getElementById('nav-trade');
    const navMarkets = document.getElementById('nav-markets');
    
    if (navTrade) {
        navTrade.addEventListener('click', (e) => {
            e.preventDefault();
            window.location.href = '/';
        });
    }
    
    if (navMarkets) {
        navMarkets.addEventListener('click', (e) => {
            e.preventDefault();
            window.location.href = '/?page=markets';
        });
    }
    
    // Logout button
    document.getElementById('logout-btn').addEventListener('click', logout);
    
    // Transaction filter
    document.getElementById('transaction-filter').addEventListener('change', filterTransactions);
    
    // Export CSV button
    document.getElementById('export-csv-btn').addEventListener('click', exportToCSV);
    
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
    currentUser = null;
    isLoggedIn = false;
    localStorage.removeItem('token');
    localStorage.removeItem('username');
    
    showToast('Logged out successfully', 'info');
    
    // Redirect to login page
    setTimeout(() => {
        window.location.href = '/login.html';
    }, 1000);
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
            const userData = await response.json();
            usdBalance = userData.usdBalance;
            btcBalance = userData.btcBalance;
            transactions = userData.transactions || [];
            userTimezone = userData.timezone || 'UTC';
            
        } else if (response.status === 401) {
            // Token expired or invalid
            isLoggedIn = false;
            logout();
        }
    } catch (error) {
        console.error('Error loading user data:', error);
    }
}

// Update balance display
function updateBalanceDisplay() {
    // Update balance displays
    const krwBalanceEl = document.getElementById('krw-balance');
    if (krwBalanceEl) {
        krwBalanceEl.textContent = '$' + usdBalance.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2});
    }
    
    const btcBalanceEl = document.getElementById('btc-balance');
    if (btcBalanceEl) {
        btcBalanceEl.textContent = btcBalance.toFixed(8);
    }
}

// Initialize asset trend chart
function initializeAssetTrendChart() {
    console.log('initializeAssetTrendChart called');
    const chartContainer = document.getElementById('asset-trend-chart');
    
    if (!chartContainer) {
        console.error('Chart container not found!');
        return;
    }
    
    console.log('Chart container found:', chartContainer);
    console.log('Container dimensions:', chartContainer.clientWidth, 'x', chartContainer.clientHeight);
    
    if (typeof window.LightweightCharts === 'undefined') {
        console.error('LightweightCharts library not loaded!');
        return;
    }
    
    console.log('LightweightCharts library loaded');
    
    try {
        // Ensure container has dimensions
        if (chartContainer.clientWidth === 0) {
            console.warn('Chart container width is 0, setting minimum width');
            chartContainer.style.width = '800px';
        }
        
        const chartWidth = chartContainer.clientWidth || 800;
        const chartHeight = 400;
        
        console.log('Creating chart with dimensions:', chartWidth, 'x', chartHeight);
        
        // Create the chart
        assetChart = window.LightweightCharts.createChart(chartContainer, {
            width: chartWidth,
            height: chartHeight,
            layout: {
                background: { color: '#1a202c' },
                textColor: '#ffffff',
            },
            grid: {
                vertLines: { color: '#2a3441' },
                horzLines: { color: '#2a3441' },
            },
            crosshair: { 
                mode: window.LightweightCharts.CrosshairMode.Normal 
            },
            rightPriceScale: { 
                borderColor: '#2a3441',
                autoScale: true
            },
            timeScale: { 
                borderColor: '#2a3441',
                timeVisible: true,
                secondsVisible: false,
            },
            localization: {
                priceFormatter: (price) => {
                    if (price === null || price === undefined || isNaN(price)) {
                        return '$0.00';
                    }
                    return '$' + price.toFixed(2);
                }
            }
        });
        
        // Add line series for asset trend (more stable than area series)
        assetTrendSeries = assetChart.addLineSeries({
            color: '#00c087',
            lineWidth: 2,
            crosshairMarkerVisible: true,
            crosshairMarkerRadius: 4,
            priceFormat: {
                type: 'price',
                precision: 2,
                minMove: 0.01,
            }
        });
        
        // Generate asset trend data from transactions
        const assetData = generateAssetTrendData();
        console.log('Generated asset data:', assetData);
        
        // Debug: Log each data point to identify null values
        console.log('Checking asset data for null/invalid values...');
        let hasInvalidData = false;
        assetData.forEach((point, index) => {
            // Check for any null, undefined, or NaN values in the data structure
            if (!point) {
                console.error(`Data point at index ${index} is null or undefined`);
                hasInvalidData = true;
            } else {
                if (point.time === null || point.time === undefined) {
                    console.error(`NULL TIME at index ${index}:`, point);
                    hasInvalidData = true;
                }
                if (point.value === null || point.value === undefined) {
                    console.error(`NULL VALUE at index ${index}:`, point);
                    hasInvalidData = true;
                }
                if (isNaN(point.time)) {
                    console.error(`NaN TIME at index ${index}:`, point);
                    hasInvalidData = true;
                }
                if (isNaN(point.value)) {
                    console.error(`NaN VALUE at index ${index}:`, point);
                    hasInvalidData = true;
                }
                // Also check for invalid property names
                const keys = Object.keys(point);
                if (!keys.includes('time') || !keys.includes('value')) {
                    console.error(`Missing required properties at index ${index}. Keys:`, keys, 'Point:', point);
                    hasInvalidData = true;
                }
            }
        });
        
        if (!hasInvalidData) {
            console.log('✓ All data points are valid');
        } else {
            console.error('✗ Found invalid data points in asset data');
            // Log first and last few data points for inspection
            console.log('First 3 data points:', assetData.slice(0, 3));
            console.log('Last 3 data points:', assetData.slice(-3));
        }
        
        if (assetData && assetData.length > 0) {
            try {
                assetTrendSeries.setData(assetData);
            } catch (error) {
                console.error('Error setting chart data:', error);
                console.log('Problematic data:', assetData);
                
                // Try with simplified data
                const fallbackData = [
                    { time: Math.floor(Date.now() / 1000) - 86400, value: 10000 },
                    { time: Math.floor(Date.now() / 1000), value: usdBalance + (btcBalance * (currentPrice || 50000)) }
                ];
                console.log('Using fallback data:', fallbackData);
                assetTrendSeries.setData(fallbackData);
            }
        }
        
        console.log('Asset trend chart created successfully');
        
        // Handle window resize
        window.addEventListener('resize', () => {
            if (assetChart) {
                assetChart.applyOptions({ 
                    width: chartContainer.clientWidth 
                });
            }
        });
        
    } catch (error) {
        console.error('Error creating asset trend chart:', error);
    }
}

// Generate asset trend data from transactions
function generateAssetTrendData() {
    const now = Math.floor(Date.now() / 1000);
    
    // Debug: Log transactions structure
    console.log('=== DEBUGGING ASSET TREND DATA ===');
    console.log('transactions length:', transactions ? transactions.length : 'null');
    console.log('usdBalance:', usdBalance);
    console.log('btcBalance:', btcBalance);
    console.log('currentPrice:', currentPrice);
    
    if (transactions && transactions.length > 0) {
        console.log('First few transactions:', transactions.slice(0, 3));
        console.log('Last few transactions:', transactions.slice(-3));
    }
    
    if (!transactions || transactions.length === 0) {
        console.log('No transactions, using fallback data');
        // Show initial balance
        return [
            { time: now - 86400, value: 10000 }, // 1 day ago
            { time: now, value: usdBalance || 10000 }
        ];
    }
    
    const assetData = [];
    let runningBalance = 10000; // Starting balance
    let runningBtc = 0;
    
    // Add initial point
    if (transactions[0] && transactions[0].time) {
        try {
            const firstTransactionTime = Math.floor(new Date(transactions[0].time).getTime() / 1000);
            if (!isNaN(firstTransactionTime) && firstTransactionTime > 0) {
                assetData.push({
                    time: firstTransactionTime - 3600, // 1 hour before first transaction
                    value: 10000
                });
            }
        } catch (error) {
            console.error('Error parsing first transaction time:', error);
        }
    }
    
    // Process transactions
    for (let i = 0; i < transactions.length; i++) {
        const transaction = transactions[i];
        if (!transaction || !transaction.time) continue;
        
        let transactionTime;
        try {
            transactionTime = Math.floor(new Date(transaction.time).getTime() / 1000);
            if (isNaN(transactionTime) || transactionTime <= 0) continue;
        } catch (error) {
            console.error('Error parsing transaction time:', error, transaction);
            continue;
        }
        
        // Update balances based on transaction type
        try {
            if (transaction.type === 'buy') {
                const total = parseFloat(transaction.total) || 0;
                const fee = parseFloat(transaction.fee) || 0;
                const amount = parseFloat(transaction.amount) || 0;
                
                runningBalance -= (total + fee);
                runningBtc += amount;
            } else if (transaction.type === 'sell') {
                const total = parseFloat(transaction.total) || 0;
                const fee = parseFloat(transaction.fee) || 0;
                const amount = parseFloat(transaction.amount) || 0;
                
                runningBalance += (total - fee);
                runningBtc -= amount;
            } else if (transaction.type?.startsWith('close_')) {
                const pnl = parseFloat(transaction.pnl) || 0;
                runningBalance += pnl;
            }
            
            // Calculate total asset value
            const btcPrice = parseFloat(transaction.price) || parseFloat(currentPrice) || 50000;
            const totalAssetValue = runningBalance + (runningBtc * btcPrice);
            
            // Debug logging for problematic values
            if (!isFinite(totalAssetValue) || totalAssetValue < 0 || totalAssetValue === null) {
                console.error('INVALID ASSET VALUE DETECTED:', {
                    transaction: transaction,
                    runningBalance: runningBalance,
                    runningBtc: runningBtc,
                    btcPrice: btcPrice,
                    totalAssetValue: totalAssetValue,
                    isFinite: isFinite(totalAssetValue)
                });
            }
            
            // Validate the calculated value
            if (isFinite(totalAssetValue) && totalAssetValue >= 0) {
                const dataPoint = {
                    time: transactionTime,
                    value: Math.round(totalAssetValue * 100) / 100 // Round to 2 decimal places
                };
                
                // Additional validation for the final data point
                if (dataPoint.value === null || dataPoint.value === undefined || isNaN(dataPoint.value)) {
                    console.error('NULL/NaN VALUE IN DATA POINT:', dataPoint);
                } else {
                    assetData.push(dataPoint);
                }
            }
        } catch (error) {
            console.error('Error processing transaction:', error, transaction);
        }
    }
    
    // Add current point
    try {
        const currentBtcPrice = parseFloat(currentPrice) || 50000;
        const currentBalance = parseFloat(usdBalance) || runningBalance;
        const currentBtcBalance = parseFloat(btcBalance) || runningBtc;
        const currentTotalAssets = currentBalance + (currentBtcBalance * currentBtcPrice);
        
        if (isFinite(currentTotalAssets) && currentTotalAssets >= 0) {
            assetData.push({
                time: now,
                value: Math.round(currentTotalAssets * 100) / 100
            });
        }
    } catch (error) {
        console.error('Error calculating current assets:', error);
    }
    
    // Ensure we have at least some valid data points
    if (assetData.length === 0) {
        return [
            { time: now - 86400, value: 10000 },
            { time: now, value: usdBalance || 10000 }
        ];
    }
    
    // Final validation and cleanup
    const validData = assetData.filter(point => {
        return point && 
               typeof point.time === 'number' && 
               typeof point.value === 'number' && 
               isFinite(point.time) && 
               isFinite(point.value) && 
               point.time > 0 && 
               point.value >= 0;
    });
    
    // Sort by time to ensure proper order
    validData.sort((a, b) => a.time - b.time);
    
    // If still no valid data, return fallback
    if (validData.length === 0) {
        return [
            { time: now - 86400, value: 10000 },
            { time: now, value: 10000 }
        ];
    }
    
    return validData;
}

// Load and display transaction history
function loadTransactionHistory() {
    if (transactions.length === 0) {
        document.getElementById('transaction-table-body').innerHTML = `
            <tr>
                <td colspan="7" style="text-align: center; color: var(--text-secondary); padding: 40px;">
                    No transactions found
                </td>
            </tr>
        `;
        return;
    }
    
    renderTransactionTable(transactions);
}

// Render transaction table
function renderTransactionTable(transactionList) {
    const tbody = document.getElementById('transaction-table-body');
    
    tbody.innerHTML = transactionList.slice().reverse().map(transaction => {
        const time = formatTimestampWithTimezone(Math.floor(new Date(transaction.time).getTime() / 1000));
        
        let typeClass, typeText, amount, price, total, fee, pnl;
        
        if (transaction.type === 'buy' || transaction.type === 'sell') {
            typeClass = transaction.type;
            typeText = transaction.type.toUpperCase();
            amount = `${(transaction.amount || 0).toFixed(8)} BTC`;
            price = `$${(transaction.price || 0).toLocaleString('en-US', {minimumFractionDigits: 2})}`;
            total = `$${(transaction.total || 0).toLocaleString('en-US', {minimumFractionDigits: 2})}`;
            fee = `$${(transaction.fee || 0).toLocaleString('en-US', {minimumFractionDigits: 2})}`;
            pnl = '-';
        } else if (transaction.type?.startsWith('close_')) {
            const positionType = transaction.type.replace('close_', '');
            typeClass = 'close';
            typeText = `CLOSE ${positionType.toUpperCase()}`;
            amount = `${transaction.leverage}x Leverage`;
            price = `$${(transaction.exitPrice || 0).toLocaleString('en-US', {minimumFractionDigits: 2})}`;
            total = `${transaction.percentage || 100}% Close`;
            fee = `$${(transaction.openingFee || 0).toLocaleString('en-US', {minimumFractionDigits: 2})}`;
            const pnlValue = transaction.pnl || 0;
            pnl = `<span class="${pnlValue >= 0 ? 'pnl-positive' : 'pnl-negative'}">
                ${pnlValue >= 0 ? '+' : ''}$${pnlValue.toLocaleString('en-US', {minimumFractionDigits: 2})}
            </span>`;
        } else {
            typeClass = 'neutral';
            typeText = (transaction.type || 'UNKNOWN').toUpperCase();
            amount = '-';
            price = '-';
            total = '-';
            fee = '-';
            pnl = '-';
        }
        
        return `
            <tr>
                <td>${time}</td>
                <td><span class="transaction-type ${typeClass}">${typeText}</span></td>
                <td>${amount}</td>
                <td>${price}</td>
                <td>${total}</td>
                <td>${fee}</td>
                <td>${pnl}</td>
            </tr>
        `;
    }).join('');
}

// Filter transactions
function filterTransactions() {
    const filter = document.getElementById('transaction-filter').value;
    let filteredTransactions = transactions;
    
    if (filter !== 'all') {
        filteredTransactions = transactions.filter(transaction => {
            return transaction.type === filter;
        });
    }
    
    renderTransactionTable(filteredTransactions);
}

// Calculate and display trading statistics
function calculateTradingStats() {
    const totalTrades = transactions.length;
    let winningTrades = 0;
    let losingTrades = 0;
    let totalPnl = 0;
    let totalFees = 0;
    
    // Calculate initial asset value
    const initialAssets = 10000;
    const currentAssets = usdBalance + (btcBalance * (currentPrice || 50000));
    const totalReturn = currentAssets - initialAssets;
    const totalReturnPercent = (totalReturn / initialAssets) * 100;
    
    transactions.forEach(transaction => {
        // Calculate fees
        if (transaction.fee) {
            totalFees += transaction.fee;
        }
        if (transaction.openingFee) {
            totalFees += transaction.openingFee;
        }
        
        // Calculate P&L for leverage positions
        if (transaction.type?.startsWith('close_') && transaction.pnl !== undefined) {
            totalPnl += transaction.pnl;
            if (transaction.pnl > 0) {
                winningTrades++;
            } else {
                losingTrades++;
            }
        }
        
        // Calculate P&L for spot trades (simplified)
        if (transaction.type === 'sell' && transaction.amount && transaction.price) {
            // This is a simplification - real P&L calculation would need to track cost basis
            const estimatedPnl = transaction.amount * transaction.price * 0.1; // Rough estimate
            if (estimatedPnl > 0) winningTrades++;
            else losingTrades++;
        }
    });
    
    const winRate = totalTrades > 0 ? ((winningTrades / totalTrades) * 100) : 0;
    const avgPnl = (winningTrades + losingTrades) > 0 ? (totalPnl / (winningTrades + losingTrades)) : 0;
    
    // Update displays
    document.getElementById('total-assets').textContent = '$' + currentAssets.toLocaleString('en-US', {minimumFractionDigits: 2});
    document.getElementById('total-assets').className = 'stat-value';
    
    document.getElementById('total-pnl').textContent = (totalReturn >= 0 ? '+' : '') + '$' + totalReturn.toLocaleString('en-US', {minimumFractionDigits: 2});
    document.getElementById('total-pnl').className = `stat-value ${totalReturn >= 0 ? 'positive' : 'negative'}`;
    
    document.getElementById('total-return').textContent = (totalReturnPercent >= 0 ? '+' : '') + totalReturnPercent.toFixed(2) + '%';
    document.getElementById('total-return').className = `stat-value ${totalReturnPercent >= 0 ? 'positive' : 'negative'}`;
    
    document.getElementById('total-trades').textContent = totalTrades.toString();
    document.getElementById('winning-trades').textContent = winningTrades.toString();
    document.getElementById('losing-trades').textContent = losingTrades.toString();
    document.getElementById('win-rate').textContent = winRate.toFixed(1) + '%';
    document.getElementById('avg-pnl').textContent = '$' + avgPnl.toLocaleString('en-US', {minimumFractionDigits: 2});
    document.getElementById('total-fees').textContent = '$' + totalFees.toLocaleString('en-US', {minimumFractionDigits: 2});
}

// Export transactions to CSV
function exportToCSV() {
    if (transactions.length === 0) {
        showToast('No transactions to export', 'info');
        return;
    }
    
    const csvHeaders = ['Time', 'Type', 'Amount', 'Price', 'Total', 'Fee', 'P&L'];
    const csvRows = [csvHeaders.join(',')];
    
    transactions.forEach(transaction => {
        const time = new Date(transaction.time).toISOString();
        let type, amount, price, total, fee, pnl;
        
        if (transaction.type === 'buy' || transaction.type === 'sell') {
            type = transaction.type.toUpperCase();
            amount = (transaction.amount || 0).toFixed(8);
            price = (transaction.price || 0).toFixed(2);
            total = (transaction.total || 0).toFixed(2);
            fee = (transaction.fee || 0).toFixed(2);
            pnl = '0';
        } else if (transaction.type?.startsWith('close_')) {
            const positionType = transaction.type.replace('close_', '');
            type = `CLOSE_${positionType.toUpperCase()}`;
            amount = `${transaction.leverage}x`;
            price = (transaction.exitPrice || 0).toFixed(2);
            total = `${transaction.percentage || 100}%`;
            fee = (transaction.openingFee || 0).toFixed(2);
            pnl = (transaction.pnl || 0).toFixed(2);
        } else {
            type = transaction.type || 'UNKNOWN';
            amount = '0';
            price = '0';
            total = '0';
            fee = '0';
            pnl = '0';
        }
        
        const row = [time, type, amount, price, total, fee, pnl];
        csvRows.push(row.join(','));
    });
    
    const csvContent = csvRows.join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    
    link.setAttribute('href', url);
    link.setAttribute('download', `trading_history_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    showToast('Transaction history exported successfully', 'success');
}

// Show toast notification
function showToast(message, type = 'info') {
    // Create toast container if it doesn't exist
    let toastContainer = document.getElementById('toast-container');
    if (!toastContainer) {
        toastContainer = document.createElement('div');
        toastContainer.id = 'toast-container';
        toastContainer.style.cssText = `
            position: fixed;
            bottom: 20px;
            right: 20px;
            z-index: 9999;
            display: flex;
            flex-direction: column;
            gap: 12px;
        `;
        document.body.appendChild(toastContainer);
    }
    
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    toast.style.cssText = `
        background: var(--bg-secondary);
        border: 1px solid var(--border-color);
        border-radius: 8px;
        padding: 16px 20px;
        min-width: 300px;
        box-shadow: var(--shadow-lg);
        display: flex;
        align-items: center;
        gap: 12px;
        animation: slideIn 0.3s ease;
        border-left: 4px solid ${type === 'success' ? 'var(--accent-green)' : type === 'error' ? 'var(--accent-red)' : 'var(--accent-blue)'};
        color: var(--text-primary);
    `;
    
    toastContainer.appendChild(toast);
    
    setTimeout(() => {
        toast.remove();
    }, 3000);
}

// Get current price from API (optional - for more accurate asset calculations)
async function fetchCurrentPrice() {
    try {
        const response = await fetch('/api/price');
        if (response.ok) {
            const data = await response.json();
            currentPrice = parseFloat(data.last);
            console.log('Current BTC price:', currentPrice);
            
            // Update asset trend chart and stats with current price
            if (assetChart && assetTrendSeries) {
                const assetData = generateAssetTrendData();
                assetTrendSeries.setData(assetData);
            }
            calculateTradingStats();
        }
    } catch (error) {
        console.error('Error fetching current price:', error);
        currentPrice = 50000; // Fallback price
    }
}

// Fetch current price on page load
setTimeout(fetchCurrentPrice, 1000);
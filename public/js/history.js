// Version: 1.0.2 - Fixed BTC balance profit calculation consistency
// History Page JavaScript
let currentUser = null;
let isLoggedIn = false;
let transactions = [];
let usdBalance = 10000;
let btcBalance = 0;
let ethBalance = 0;
let currentPrice = 0;
let assetChart = null;
let assetTrendSeries = null;
let userTimezone = 'UTC'; // Default timezone


// Initialize application
document.addEventListener('DOMContentLoaded', async () => {
    console.log('History page loaded, initializing...');
    await checkLoginStatus();
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
        window.location.href = '/login';
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
            console.log('History: Raw API response:', apiResponse);
            
            // Handle both old and new API response formats
            const userData = apiResponse.data || apiResponse;
            console.log('History: Processed user data:', userData);
            console.log('History: userData.usdBalance:', userData.usdBalance, 'Type:', typeof userData.usdBalance);
            console.log('History: userData.btcBalance:', userData.btcBalance, 'Type:', typeof userData.btcBalance);
            
            usdBalance = Number.isFinite(userData.usdBalance) ? userData.usdBalance : 10000;
            btcBalance = Number.isFinite(userData.btcBalance) ? userData.btcBalance : 0;
            ethBalance = Number.isFinite(userData.ethBalance) ? userData.ethBalance : 0;
            transactions = userData.transactions || [];
            userTimezone = userData.timezone || 'UTC';
            
            console.log('History: Final balances - USD:', usdBalance, 'BTC:', btcBalance, 'ETH:', ethBalance);
            
        } else if (response.status === 401) {
            // Token expired or invalid
            console.log('History: Token expired or invalid');
            isLoggedIn = false;
            logout();
        } else {
            console.error('History: Failed to load user data, status:', response.status);
            const errorText = await response.text();
            console.error('History: Error response:', errorText);
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
        let formattedUsdBalance;
        try {
            formattedUsdBalance = Number.isFinite(usdBalance) ? 
                usdBalance.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2}) : '0.00';
        } catch (error) {
            console.error('Error formatting USD balance:', error, { usdBalance });
            formattedUsdBalance = '0.00';
        }
        krwBalanceEl.textContent = '$' + formattedUsdBalance;
    }
    
    const btcBalanceEl = document.getElementById('btc-balance');
    const cryptoLabelEl = document.getElementById('crypto-balance-label');
    
    // Get current market from localStorage to determine which balance to show
    const currentMarket = localStorage.getItem('selectedMarket') || 'BTC/USDT';
    const [crypto] = currentMarket.split('/');
    
    if (btcBalanceEl && cryptoLabelEl) {
        if (crypto === 'ETH') {
            cryptoLabelEl.textContent = 'ETH Balance';
            btcBalanceEl.textContent = ethBalance.toFixed(8);
        } else {
            cryptoLabelEl.textContent = 'BTC Balance';
            btcBalanceEl.textContent = btcBalance.toFixed(8);
        }
    }
}

// Initialize asset trend chart with Chart.js
function initializeAssetTrendChart() {
    console.log('initializeAssetTrendChart called with Chart.js');
    const chartCanvas = document.getElementById('asset-trend-chart');
    
    if (!chartCanvas) {
        console.error('Chart canvas not found!');
        return;
    }
    
    console.log('Chart canvas found:', chartCanvas);
    
    if (typeof Chart === 'undefined') {
        console.error('Chart.js library not loaded!');
        return;
    }
    
    console.log('Chart.js library loaded');
    
    try {
        // Generate asset trend data from transactions
        const assetData = generateAssetTrendData();
        console.log('Generated asset data for Chart.js:', assetData);
        
        // Create simple labels and data arrays for Chart.js
        const labels = assetData.map((point, index) => {
            const date = new Date(point.time * 1000);
            return date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
        });
        
        const values = assetData.map(point => point.value);
        
        console.log('Chart.js data:', { labels: labels.slice(0, 3), values: values.slice(0, 3) });
        
        // Create Chart.js line chart with simple configuration
        assetChart = new Chart(chartCanvas, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Total Assets',
                    data: values,
                    borderColor: '#00c087',
                    backgroundColor: 'rgba(0, 192, 135, 0.1)',
                    borderWidth: 2,
                    fill: true,
                    tension: 0.1,
                    pointRadius: 1,
                    pointHoverRadius: 6,
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        display: false
                    },
                    tooltip: {
                        mode: 'index',
                        intersect: false,
                        backgroundColor: 'rgba(26, 32, 44, 0.9)',
                        titleColor: '#ffffff',
                        bodyColor: '#ffffff',
                        borderColor: '#2a3441',
                        borderWidth: 1,
                        callbacks: {
                            label: function(context) {
                                return `Assets: $${context.parsed.y.toLocaleString('en-US', {minimumFractionDigits: 2})}`;
                            }
                        }
                    }
                },
                interaction: {
                    mode: 'index',
                    intersect: false,
                },
                scales: {
                    x: {
                        grid: {
                            color: '#2a3441'
                        },
                        ticks: {
                            color: '#ffffff',
                            maxTicksLimit: 8,
                            callback: function(value, index) {
                                if (index % Math.ceil(this.chart.data.labels.length / 6) === 0) {
                                    const label = this.chart.data.labels[index];
                                    return label ? label.split(' ')[0] : ''; // Show only date part
                                }
                                return '';
                            }
                        }
                    },
                    y: {
                        beginAtZero: false,
                        grid: {
                            color: '#2a3441'
                        },
                        ticks: {
                            color: '#ffffff',
                            callback: function(value) {
                                return '$' + value.toLocaleString('en-US', {minimumFractionDigits: 0});
                            }
                        }
                    }
                },
                elements: {
                    point: {
                        radius: 1
                    }
                }
            }
        });
        
        console.log('✅ Chart.js chart created successfully');
        
        // Handle window resize
        window.addEventListener('resize', () => {
            if (assetChart) {
                assetChart.resize();
            }
        });
        
    } catch (error) {
        console.error('❌ Error creating Chart.js chart:', error);
        console.log('Error stack:', error.stack);
    }
}

// Generate asset trend data from transactions (simplified for Chart.js)
function generateAssetTrendData() {
    console.log('=== GENERATING DATA FOR CHART.JS ===');
    const now = Date.now();
    
    if (!transactions || transactions.length === 0) {
        console.log('No transactions, returning simple fallback data');
        return [
            { time: Math.floor((now - 86400000) / 1000), value: 10000 }, // 24 hours ago
            { time: Math.floor(now / 1000), value: usdBalance || 10000 } // Now
        ];
    }
    
    console.log('Processing', transactions.length, 'transactions for Chart.js');
    const assetData = [];
    let runningBalance = 10000;
    let runningBtc = 0;
    
    // Sort transactions by time
    const sortedTransactions = [...transactions].sort((a, b) => {
        return new Date(a.time).getTime() - new Date(b.time).getTime();
    });
    
    // Add starting point (7 days ago from now)
    assetData.push({ 
        time: Math.floor((now - 7 * 24 * 60 * 60 * 1000) / 1000), 
        value: 10000 
    });
    
    // Process transactions with simple time mapping
    for (let i = 0; i < sortedTransactions.length; i++) {
        const transaction = sortedTransactions[i];
        if (!transaction || !transaction.time) continue;
        
        // Use relative time positioning in the past 24 hours
        const transactionIndex = i / (sortedTransactions.length - 1); // 0 to 1
        const timeOffset = transactionIndex * 6 * 24 * 60 * 60 * 1000; // Spread over 6 days
        const transactionTime = Math.floor((now - 6 * 24 * 60 * 60 * 1000 + timeOffset) / 1000);
        
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
            
            const btcPrice = parseFloat(transaction.price) || parseFloat(currentPrice) || 50000;
            const totalAssetValue = runningBalance + (runningBtc * btcPrice);
            
            if (isFinite(totalAssetValue) && totalAssetValue >= 0) {
                assetData.push({
                    time: transactionTime,
                    value: Math.round(totalAssetValue * 100) / 100
                });
            }
        } catch (error) {
            console.error('Error processing transaction:', error);
        }
    }
    
    // Add current point
    const currentBtcPrice = parseFloat(currentPrice) || 50000;
    const currentBalance = parseFloat(usdBalance) || runningBalance;
    const currentBtcBalance = parseFloat(btcBalance) || runningBtc;
    const currentTotalAssets = currentBalance + (currentBtcBalance * currentBtcPrice);
    
    assetData.push({
        time: Math.floor(now / 1000),
        value: Math.round(currentTotalAssets * 100) / 100
    });
    
    console.log('Generated', assetData.length, 'data points for Chart.js');
    console.log('First:', assetData[0]);
    console.log('Last:', assetData[assetData.length - 1]);
    
    return assetData;
}

// Load and display transaction history
function loadTransactionHistory() {
    if (transactions.length === 0) {
        document.getElementById('transaction-table-body').innerHTML = `
            <tr>
                <td colspan="7" class="empty-message">
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
            
            const transactionPrice = transaction.price || 0;
            const transactionTotal = transaction.total || 0;
            const transactionFee = transaction.fee || 0;
            
            price = `$${Number.isFinite(transactionPrice) ? transactionPrice.toLocaleString('en-US', {minimumFractionDigits: 2}) : '0.00'}`;
            total = `$${Number.isFinite(transactionTotal) ? transactionTotal.toLocaleString('en-US', {minimumFractionDigits: 2}) : '0.00'}`;
            fee = `$${Number.isFinite(transactionFee) ? transactionFee.toLocaleString('en-US', {minimumFractionDigits: 2}) : '0.00'}`;
            pnl = '-';
        } else if (transaction.type?.startsWith('close_')) {
            const positionType = transaction.type.replace('close_', '');
            typeClass = 'close';
            typeText = `CLOSE ${positionType.toUpperCase()}`;
            amount = `${transaction.leverage}x Leverage`;
            
            const exitPrice = transaction.exitPrice || 0;
            const openingFee = transaction.openingFee || 0;
            const pnlValue = transaction.pnl || 0;
            
            price = `$${Number.isFinite(exitPrice) ? exitPrice.toLocaleString('en-US', {minimumFractionDigits: 2}) : '0.00'}`;
            const percentage = Number.isFinite(transaction.percentage) && transaction.percentage > 0 && transaction.percentage <= 100 ? transaction.percentage : 100;
            total = `${percentage}% Close`;
            
            // Calculate total fees for close transactions (opening fee + closing fee)
            const totalTransactionFees = (transaction.totalFees) || (transaction.openingFee || 0) + (transaction.closingFee || 0);
            fee = `$${Number.isFinite(totalTransactionFees) ? totalTransactionFees.toLocaleString('en-US', {minimumFractionDigits: 2}) : '0.00'}`;
            const formattedPnl = Number.isFinite(pnlValue) ? pnlValue.toLocaleString('en-US', {minimumFractionDigits: 2}) : '0.00';
            pnl = `<span class="${pnlValue >= 0 ? 'pnl-positive' : 'pnl-negative'}">
                ${pnlValue >= 0 ? '+' : ''}$${formattedPnl}
            </span>`;
        } else if (transaction.type === 'liquidation') {
            // Liquidation transactions
            typeClass = 'liquidation';
            typeText = 'LIQUIDATED';
            
            const positionType = transaction.positionType || 'unknown';
            const leverage = transaction.leverage || 1;
            const entryPrice = transaction.entryPrice || 0;
            const liquidationPrice = transaction.liquidationPrice || 0;
            const loss = transaction.loss || 0;
            
            amount = `${positionType.toUpperCase()} ${leverage}x`;
            price = `$${Number.isFinite(entryPrice) ? entryPrice.toLocaleString('en-US', {minimumFractionDigits: 2}) : '0.00'}`;
            total = `Liq: $${Number.isFinite(liquidationPrice) ? liquidationPrice.toLocaleString('en-US', {minimumFractionDigits: 2}) : '0.00'}`;
            
            // For liquidations, show the opening fee that was already paid
            const liquidationFee = transaction.openingFee || 0;
            fee = `$${Number.isFinite(liquidationFee) ? liquidationFee.toLocaleString('en-US', {minimumFractionDigits: 2}) : '0.00'}`;
            const formattedLoss = Number.isFinite(loss) ? Math.abs(loss).toLocaleString('en-US', {minimumFractionDigits: 2}) : '0.00';
            pnl = `<span class="pnl-negative">$-${formattedLoss}</span>`;
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
    let winningTrades = 0;
    let losingTrades = 0;
    let totalPnl = 0;
    let totalFees = 0;
    let actualTradingDecisions = 0; // Only count actual trading decisions (close positions/liquidations)
    
    // Calculate initial asset value
    const initialAssets = 10000;
    const currentAssets = usdBalance + (btcBalance * (currentPrice || 50000));
    const totalReturn = currentAssets - initialAssets;
    const totalReturnPercent = (totalReturn / initialAssets) * 100;
    
    transactions.forEach(transaction => {
        // Calculate fees for different transaction types
        if (transaction.type === 'buy' || transaction.type === 'sell') {
            // Spot trading fees - only count each transaction once
            if (transaction.fee) {
                totalFees += transaction.fee;
            }
        } else if (transaction.type?.startsWith('close_')) {
            // Leverage position closing fees - use totalFees if available, otherwise sum components
            if (transaction.totalFees) {
                totalFees += transaction.totalFees;
            } else {
                const openingFee = transaction.openingFee || 0;
                const closingFee = transaction.closingFee || 0;
                totalFees += openingFee + closingFee;
            }
        } else if (transaction.type === 'liquidation') {
            // Liquidation fees (opening fee was already paid when position opened)
            if (transaction.openingFee) {
                totalFees += transaction.openingFee;
            }
        }
        
        // Count actual trading decisions and their P&L
        if (transaction.type?.startsWith('close_') && transaction.pnl !== undefined) {
            actualTradingDecisions++;
            totalPnl += transaction.pnl;
            if (transaction.pnl > 0) {
                winningTrades++;
            } else {
                losingTrades++;
            }
        }
        
        if (transaction.type === 'liquidation' && transaction.loss !== undefined) {
            actualTradingDecisions++;
            totalPnl += transaction.loss; // Loss is already negative in script.js (totalLoss = -position.margin)
            losingTrades++;
        }
    });
    
    // Use actual trading decisions for statistics, not all transactions (buy/sell are just entries/exits)
    const totalTrades = transactions.length;
    const winRate = actualTradingDecisions > 0 ? ((winningTrades / actualTradingDecisions) * 100) : 0;
    const avgPnl = actualTradingDecisions > 0 ? (totalPnl / actualTradingDecisions) : 0;
    
    // Update displays with safe formatting
    const formattedAssets = Number.isFinite(currentAssets) ? currentAssets.toLocaleString('en-US', {minimumFractionDigits: 2}) : '0.00';
    document.getElementById('total-assets').textContent = '$' + formattedAssets;
    document.getElementById('total-assets').className = 'stat-value';
    
    // Total P&L should be the total asset change (same as totalReturn)
    const formattedTotalPnl = Number.isFinite(totalReturn) ? totalReturn.toLocaleString('en-US', {minimumFractionDigits: 2}) : '0.00';
    document.getElementById('total-pnl').textContent = (totalReturn >= 0 ? '+' : '') + '$' + formattedTotalPnl;
    document.getElementById('total-pnl').className = `stat-value ${totalReturn >= 0 ? 'positive' : 'negative'}`;
    
    document.getElementById('total-return').textContent = (totalReturnPercent >= 0 ? '+' : '') + totalReturnPercent.toFixed(2) + '%';
    document.getElementById('total-return').className = `stat-value ${totalReturnPercent >= 0 ? 'positive' : 'negative'}`;
    
    document.getElementById('total-trades').textContent = actualTradingDecisions.toString();
    document.getElementById('winning-trades').textContent = winningTrades.toString();
    document.getElementById('losing-trades').textContent = losingTrades.toString();
    document.getElementById('win-rate').textContent = winRate.toFixed(1) + '%';
    
    const formattedAvgPnl = Number.isFinite(avgPnl) ? avgPnl.toLocaleString('en-US', {minimumFractionDigits: 2}) : '0.00';
    document.getElementById('avg-pnl').textContent = '$' + formattedAvgPnl;
    
    const formattedTotalFees = Number.isFinite(totalFees) ? totalFees.toLocaleString('en-US', {minimumFractionDigits: 2}) : '0.00';
    document.getElementById('total-fees').textContent = '$' + formattedTotalFees;
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
            const percentage = Number.isFinite(transaction.percentage) && transaction.percentage > 0 && transaction.percentage <= 100 ? transaction.percentage : 100;
            total = `${percentage}%`;
            const totalTransactionFees = (transaction.totalFees) || (transaction.openingFee || 0) + (transaction.closingFee || 0);
            fee = totalTransactionFees.toFixed(2);
            pnl = (transaction.pnl || 0).toFixed(2);
        } else if (transaction.type === 'liquidation') {
            const positionType = transaction.positionType || 'unknown';
            type = 'LIQUIDATED';
            amount = `${positionType.toUpperCase()} ${transaction.leverage || 1}x`;
            price = (transaction.entryPrice || 0).toFixed(2);
            total = `Liq: ${(transaction.liquidationPrice || 0).toFixed(2)}`;
            fee = (transaction.openingFee || 0).toFixed(2);
            pnl = (transaction.loss || 0).toFixed(2); // loss is already negative
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
            if (assetChart) {
                const assetData = generateAssetTrendData();
                const labels = assetData.map(point => {
                    const date = new Date(point.time * 1000);
                    return date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
                });
                const values = assetData.map(point => point.value);
                
                assetChart.data.labels = labels;
                assetChart.data.datasets[0].data = values;
                assetChart.update();
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
// Check authentication before loading monitoring dashboard
function checkAuthAndAccess() {
    const token = localStorage.getItem('token');
    
    if (!token) {
        window.location.href = '/404.html';
        return false;
    }
    
    // Verify token with server
    fetch('/api/user/data', {
        method: 'GET',
        headers: {
            'Authorization': `Bearer ${token}`
        }
    })
    .then(response => {
        if (!response.ok) {
            localStorage.removeItem('token');
            localStorage.removeItem('username');
            window.location.href = '/404.html';
            return Promise.reject('Invalid token');
        }
        return response.json();
    })
    .then(data => {
        // Check if user has admin role
        if (!data.data || !data.data.role || data.data.role !== 'admin') {
            window.location.href = '/404.html';
            return;
        }
        
        // User is authenticated and is admin - load monitoring dashboard
        const script = document.createElement('script');
        script.src = 'js/monitoring-dashboard.js';
        script.onload = () => {
            console.log('✅ Monitoring dashboard script loaded');
            // Initialize dashboard
            window.dashboard = new MonitoringDashboard();
        };
        script.onerror = () => {
            console.error('❌ Failed to load monitoring dashboard script');
        };
        document.head.appendChild(script);
    })
    .catch(error => {
        console.error('Auth check failed:', error);
        window.location.href = '/404.html';
    });
}

// Run auth check on page load
document.addEventListener('DOMContentLoaded', checkAuthAndAccess);
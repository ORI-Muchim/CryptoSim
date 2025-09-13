// Check if already logged in
if (localStorage.getItem('token')) {
    window.location.href = '/';
}

function switchTab(tab, targetBtn) {
    // Update tab buttons
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    targetBtn.classList.add('active');

    // Update tab content
    document.querySelectorAll('.tab-content').forEach(content => {
        content.classList.remove('active');
    });
    document.getElementById(`${tab}-tab`).classList.add('active');

    // Clear messages
    hideMessages();
}

// Rate limiting utility function for login page
async function fetchWithRetry(url, options = {}, maxRetries = 2, baseDelay = 3000) {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            const response = await fetch(url, options);
            
            if (response.status === 429) {
                if (attempt === maxRetries) {
                    throw new Error('RATE_LIMITED');
                }
                
                const delay = baseDelay * attempt;
                showError(`Too many requests. Retrying in ${Math.round(delay/1000)} seconds...`);
                await new Promise(resolve => setTimeout(resolve, delay));
                continue;
            }
            
            return response;
        } catch (error) {
            if (error.message === 'RATE_LIMITED') {
                throw error;
            }
            if (attempt === maxRetries) {
                throw error;
            }
            
            const delay = baseDelay * attempt;
            showError(`Connection failed. Retrying in ${Math.round(delay/1000)} seconds...`);
            await new Promise(resolve => setTimeout(resolve, delay));
        }
    }
}

function showError(message) {
    const errorDiv = document.getElementById('error-message');
    errorDiv.innerHTML = `<i class="fas fa-exclamation-circle"></i> ${message}`;
    errorDiv.style.display = 'block';
    document.getElementById('success-message').style.display = 'none';
}

function showSuccess(message) {
    const successDiv = document.getElementById('success-message');
    successDiv.innerHTML = `<i class="fas fa-check-circle"></i> ${message}`;
    successDiv.style.display = 'block';
    document.getElementById('error-message').style.display = 'none';
}

function hideMessages() {
    document.getElementById('error-message').style.display = 'none';
    document.getElementById('success-message').style.display = 'none';
}

function setLoading(buttonId, isLoading, loadingText) {
    const button = document.getElementById(buttonId);
    
    if (isLoading) {
        button.dataset.originalText = button.innerHTML;
        button.innerHTML = `<span class="loading-spinner"></span>${loadingText || 'Loading...'}`;
        button.disabled = true;
    } else {
        button.innerHTML = button.dataset.originalText || button.innerHTML;
        button.disabled = false;
    }
}

async function handleLogin(event) {
    event.preventDefault();
    hideMessages();

    const username = document.getElementById('login-username').value.trim();
    const password = document.getElementById('login-password').value;

    // Basic validation
    if (!username || !password) {
        showError('Please enter both username and password');
        return;
    }

    setLoading('login-submit', true, 'Signing in...');

    try {
        console.log('Attempting login for:', username);
        const response = await fetch('/api/login', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ username, password })
        });

        console.log('Login response status:', response.status);
        
        // Handle rate limiting specifically
        if (response.status === 429) {
            showError('Too many login attempts. Please wait a few minutes and try again.');
            return;
        }
        
        let data;
        try {
            data = await response.json();
        } catch (parseError) {
            console.error('Failed to parse response JSON:', parseError);
            // For rate limiting, the response might not be JSON
            if (response.status === 429) {
                showError('Too many login attempts. Please wait a few minutes and try again.');
                return;
            }
            throw new Error('Invalid response from server');
        }

        if (response.ok) {
            console.log('Login successful');
            localStorage.setItem('token', data.token);
            localStorage.setItem('username', data.username);
            showSuccess('Login successful! Redirecting...');
            setTimeout(() => {
                window.location.href = '/';
            }, 1000);
        } else {
            console.log('Login failed:', data);
            // Handle validation errors
            if (data.errors && Array.isArray(data.errors)) {
                const errorMessages = data.errors.map(err => err.msg).join('. ');
                showError(errorMessages);
            } else {
                showError(data.error || 'Login failed. Please try again');
            }
        }
    } catch (error) {
        console.error('Login error:', error);
        showError('Connection failed. Please check your internet connection');
    } finally {
        setLoading('login-submit', false);
    }
}

async function handleRegister(event) {
    event.preventDefault();
    hideMessages();

    const username = document.getElementById('reg-username').value.trim();
    const password = document.getElementById('reg-password').value;
    const confirmPassword = document.getElementById('reg-password-confirm').value;

    // Basic validation
    if (!username || !password || !confirmPassword) {
        showError('Please fill in all fields');
        return;
    }

    if (password !== confirmPassword) {
        showError('Passwords do not match');
        return;
    }

    // Validate username format
    if (!/^[a-zA-Z0-9_]+$/.test(username)) {
        showError('Username can only contain letters, numbers, and underscores');
        return;
    }

    // Validate username length
    if (username.length < 3 || username.length > 20) {
        showError('Username must be between 3 and 20 characters');
        return;
    }

    // Validate password format
    if (password.length < 4) {
        showError('Password must be at least 4 characters long');
        return;
    }

    setLoading('register-submit', true, 'Creating account...');

    try {
        console.log('Attempting registration for:', username);
        const response = await fetch('/api/register', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ username, password })
        });

        console.log('Registration response status:', response.status);

        // Handle rate limiting specifically
        if (response.status === 429) {
            showError('Too many registration attempts. Please wait a few minutes and try again.');
            return;
        }

        let data;
        try {
            data = await response.json();
        } catch (parseError) {
            console.error('Failed to parse response JSON:', parseError);
            // For rate limiting, the response might not be JSON
            if (response.status === 429) {
                showError('Too many registration attempts. Please wait a few minutes and try again.');
                return;
            }
            throw new Error('Invalid response from server');
        }

        if (response.ok) {
            console.log('Registration successful');
            showSuccess('Account created successfully! Logging you in...');
            localStorage.setItem('token', data.token);
            localStorage.setItem('username', data.username);
            setTimeout(() => {
                window.location.href = '/';
            }, 1500);
        } else {
            console.log('Registration failed:', data);
            // Handle validation errors from server
            if (data.errors && Array.isArray(data.errors)) {
                const errorMessages = data.errors.map(err => err.msg).join('. ');
                showError(errorMessages);
            } else {
                showError(data.error || 'Registration failed. Please try again');
            }
        }
    } catch (error) {
        console.error('Registration error:', error);
        showError('Connection failed. Please check your internet connection');
    } finally {
        setLoading('register-submit', false);
    }
}

async function loginAsDemo() {
    hideMessages();
    
    // Create demo account with timestamp
    const timestamp = Date.now();
    const demoUsername = `demo_${timestamp}`;
    const demoPassword = 'demo1234';

    const demoBtn = document.querySelector('.demo-btn');
    const originalContent = demoBtn.innerHTML;
    demoBtn.innerHTML = '<span class="loading-spinner"></span>Creating demo account...';
    demoBtn.disabled = true;

    try {
        console.log('Creating demo account:', demoUsername);
        // Try to register demo account
        const registerResponse = await fetch('/api/register', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ 
                username: demoUsername, 
                password: demoPassword 
            })
        });

        console.log('Demo account response status:', registerResponse.status);

        let data;
        try {
            data = await registerResponse.json();
        } catch (parseError) {
            console.error('Failed to parse demo account response JSON:', parseError);
            throw new Error('Invalid response from server');
        }

        if (registerResponse.ok) {
            console.log('Demo account created successfully');
            localStorage.setItem('token', data.token);
            localStorage.setItem('username', data.username);
            showSuccess('Demo account created! Redirecting to trading platform...');
            setTimeout(() => {
                window.location.href = '/';
            }, 1000);
        } else {
            console.log('Demo account creation failed:', data);
            if (data.errors && Array.isArray(data.errors)) {
                const errorMessages = data.errors.map(err => err.msg).join('. ');
                showError('Demo account creation failed: ' + errorMessages);
            } else {
                showError(data.error || 'Failed to create demo account. Please try again');
            }
        }
    } catch (error) {
        console.error('Demo account error:', error);
        showError('Connection failed. Please check your internet connection');
    } finally {
        demoBtn.innerHTML = originalContent;
        demoBtn.disabled = false;
    }
}

function togglePasswordVisibility(button) {
    const targetId = button.getAttribute('data-target');
    const passwordInput = document.getElementById(targetId);
    const icon = button.querySelector('i');
    
    if (passwordInput.type === 'password') {
        passwordInput.type = 'text';
        icon.classList.remove('fa-eye');
        icon.classList.add('fa-eye-slash');
        button.setAttribute('aria-label', 'Hide password');
    } else {
        passwordInput.type = 'password';
        icon.classList.remove('fa-eye-slash');
        icon.classList.add('fa-eye');
        button.setAttribute('aria-label', 'Show password');
    }
}

// Add event listeners
document.addEventListener('DOMContentLoaded', function() {
    // Tab switching
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            const tab = this.getAttribute('data-tab');
            switchTab(tab, this);
        });
    });

    // Password visibility toggles
    document.querySelectorAll('.password-toggle').forEach(button => {
        button.addEventListener('click', function() {
            togglePasswordVisibility(this);
        });
    });

    // Login form submission
    document.getElementById('login-form').addEventListener('submit', handleLogin);

    // Register form submission
    document.getElementById('register-form').addEventListener('submit', handleRegister);

    // Demo button
    document.getElementById('demo-btn').addEventListener('click', loginAsDemo);

    // Add smooth focus effects
    const inputs = document.querySelectorAll('input');
    inputs.forEach(input => {
        input.addEventListener('focus', function() {
            this.parentElement.style.transform = 'translateY(-1px)';
        });
        
        input.addEventListener('blur', function() {
            this.parentElement.style.transform = 'translateY(0)';
        });
    });

    // Add keyboard navigation
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Enter' && e.ctrlKey) {
            const activeTab = document.querySelector('.tab-content.active');
            const form = activeTab.querySelector('form');
            if (form) {
                form.dispatchEvent(new Event('submit', { cancelable: true }));
            }
        }
    });
});
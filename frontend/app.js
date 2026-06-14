// Global state
let currentFiles = {
    login: [],
    register: []
};
let devPollInterval = null;
let performanceChart = null;

// Screen Router
function showScreen(screenId) {
    // Hide all screens
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    
    // Show target screen
    const target = document.getElementById(screenId);
    if (target) {
        target.classList.add('active');
    }
    
    // Update body class for dev mode styling
    if (screenId === 'screen-dev-dashboard') {
        document.body.classList.add('dev-mode-active');
    } else {
        document.body.classList.remove('dev-mode-active');
        // Stop polling if we leave developer dashboard
        if (devPollInterval) {
            clearInterval(devPollInterval);
            devPollInterval = null;
        }
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

// Show Toast Alert
function showToast(message, duration = 3000) {
    const toast = document.getElementById('global-toast');
    const toastMsg = document.getElementById('toast-message');
    toastMsg.textContent = message;
    toast.classList.add('show');
    
    setTimeout(() => {
        toast.classList.remove('show');
    }, duration);
}

// Extract Username suggestion from file name
function suggestUsername(filename) {
    const match = filename.match(/Person_(\d+)/i);
    if (match) {
        return `Person_${match[1]}`;
    }
    // Remove extension and return
    return filename.split('.')[0] || "NewUser";
}

// Initialize Drag & Drop Events
function initDragAndDrop(zoneId, fileInputId, previewId, stateKey) {
    const zone = document.getElementById(zoneId);
    const input = document.getElementById(fileInputId);
    const preview = document.getElementById(previewId);

    // Prevent defaults
    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
        zone.addEventListener(eventName, e => {
            e.preventDefault();
            e.stopPropagation();
        }, false);
    });

    // Add dragover effects
    ['dragenter', 'dragover'].forEach(eventName => {
        zone.addEventListener(eventName, () => zone.classList.add('dragover'), false);
    });
    ['dragleave', 'drop'].forEach(eventName => {
        zone.addEventListener(eventName, () => zone.classList.remove('dragover'), false);
    });

    // Handle dropped files
    zone.addEventListener('drop', e => {
        const dt = e.dataTransfer;
        const files = dt.files;
        handleFilesSelection(files, input, preview, stateKey);
    });

    // Handle browse selection
    input.addEventListener('change', e => {
        handleFilesSelection(e.target.files, input, preview, stateKey);
    });
}

function handleFilesSelection(files, input, preview, stateKey) {
    if (files.length === 0) return;
    
    // Save files to state. If multiple, we search for a .dat file primarily.
    const fileList = Array.from(files);
    currentFiles[stateKey] = fileList;
    
    // Display file preview details
    const datFile = fileList.find(f => f.name.endsWith('.dat')) || fileList[0];
    preview.textContent = `Selected: ${datFile.name}` + (fileList.length > 1 ? ` (+${fileList.length - 1} files)` : '');
    preview.style.display = 'block';
    
    // Pre-fill registration username if registering and a candidate is detected
    if (stateKey === 'register') {
        const usernameInput = document.getElementById('register-username');
        if (usernameInput && !usernameInput.value) {
            usernameInput.value = suggestUsername(datFile.name);
        }
    }
}

// API Functions
async function verifyECG() {
    const files = currentFiles.login;
    if (files.length === 0) {
        showToast("Please upload an ECG file (.dat format preferred) first.");
        return;
    }
    
    // Find the binary .dat file in case they uploaded multiple
    const datFile = files.find(f => f.name.endsWith('.dat')) || files[0];
    
    const btn = document.getElementById('btn-verify-ecg');
    const originalText = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = `<svg class="btn-icon spinner" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/></svg> VERIFYING BIOMETRICS...`;
    
    try {
        const formData = new FormData();
        formData.append("file", datFile);
        
        // Also upload header file .hea if they selected it to pass metadata
        const heaFile = files.find(f => f.name.endsWith('.hea'));
        if (heaFile) {
            formData.append("hea_file", heaFile);
        }
        
        const response = await fetch("/api/auth/verify", {
            method: "POST",
            body: formData
        });
        
        const result = await response.json();
        btn.disabled = false;
        btn.innerHTML = originalText;
        
        if (!response.ok) {
            showToast(`Verification error: ${result.detail || 'Failed to process ECG'}`);
            return;
        }
        
        if (result.status === "APPROVED") {
            document.getElementById('approved-username').textContent = result.username;
            document.getElementById('approved-accuracy').textContent = `${(result.accuracy * 100).toFixed(2)}%`;
            showScreen('screen-auth-approved');
        } else {
            // Access Denied
            document.getElementById('denied-accuracy-badge').textContent = `Match Score: ${(result.accuracy * 100).toFixed(1)}%`;
            
            // Set up suggested user registration if user not found
            const suggested = result.suggested_username || suggestUsername(datFile.name);
            document.getElementById('denied-suggested-user').textContent = suggested;
            
            const autoRegSection = document.getElementById('denied-register-section');
            autoRegSection.style.display = 'block';
            
            // Wire Register button from denial screen
            document.getElementById('btn-denied-auto-register').onclick = () => {
                document.getElementById('register-username').value = suggested;
                // Copy selected files to register state
                currentFiles.register = [...currentFiles.login];
                const regPreview = document.getElementById('register-file-info');
                regPreview.textContent = `Selected: ${datFile.name}`;
                regPreview.style.display = 'block';
                showScreen('screen-register');
            };
            
            showScreen('screen-auth-denied');
        }
        
    } catch (err) {
        btn.disabled = false;
        btn.innerHTML = originalText;
        showToast("Network error during biometric verification.");
        console.error(err);
    }
}

async function registerUser() {
    const username = document.getElementById('register-username').value.trim();
    const files = currentFiles.register;
    
    if (!username) {
        showToast("Please enter a username.");
        return;
    }
    if (files.length === 0) {
        showToast("Please upload an ECG recording file.");
        return;
    }
    
    const datFile = files.find(f => f.name.endsWith('.dat')) || files[0];
    
    const btn = document.getElementById('btn-submit-register');
    const originalText = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = "ENROLLING PROFILE TEMPLATE...";
    
    try {
        const formData = new FormData();
        formData.append("username", username);
        formData.append("file", datFile);
        
        const response = await fetch("/api/users/register", {
            method: "POST",
            body: formData
        });
        
        const result = await response.json();
        btn.disabled = false;
        btn.innerHTML = originalText;
        
        if (!response.ok) {
            showToast(`Registration failed: ${result.detail || 'Could not enroll user'}`);
            return;
        }
        
        document.getElementById('enrolled-username').textContent = result.username;
        showScreen('screen-enrollment-complete');
        
    } catch (err) {
        btn.disabled = false;
        btn.innerHTML = originalText;
        showToast("Network error during registration.");
        console.error(err);
    }
}

// Developer Console Functions
async function handleDevLogin() {
    const password = document.getElementById('dev-password').value;
    if (!password) {
        showToast("Password required.");
        return;
    }
    
    const btn = document.getElementById('btn-dev-login');
    btn.disabled = true;
    
    try {
        const formData = new FormData();
        formData.append("password", password);
        
        const response = await fetch("/api/dev/login", {
            method: "POST",
            body: formData
        });
        
        const result = await response.json();
        btn.disabled = false;
        
        if (!response.ok) {
            showToast("Invalid developer password.");
            return;
        }
        
        localStorage.setItem("adminToken", result.token);
        document.getElementById('dev-user-label').textContent = result.username;
        document.getElementById('dev-password').value = ""; // clear password
        
        // Show dashboard and start loading components
        showScreen('screen-dev-dashboard');
        loadDashboardData();
        
        // Start polling every 30s
        devPollInterval = setInterval(loadDashboardData, 30000);
        
    } catch (err) {
        btn.disabled = false;
        showToast("Error connecting to auth service.");
        console.error(err);
    }
}

function handleDevLogout() {
    localStorage.removeItem("adminToken");
    if (devPollInterval) {
        clearInterval(devPollInterval);
        devPollInterval = null;
    }
    showScreen('screen-main');
    showToast("Logged out of Developer Console.");
}

async function loadDashboardData() {
    const token = localStorage.getItem("adminToken");
    if (!token) {
        handleDevLogout();
        return;
    }
    
    try {
        // Fetch performance metrics
        const resMetrics = await fetch("/api/metrics/performance", {
            headers: { "Authorization": `Bearer ${token}` }
        });
        
        if (resMetrics.status === 401) {
            handleDevLogout();
            return;
        }
        
        const metrics = await resMetrics.json();
        document.getElementById('dashboard-accuracy-badge').textContent = `${metrics.current_accuracy.toFixed(1)}%`;
        
        // Update Chart
        renderPerformanceChart(metrics.timestamps, metrics.accuracies);
        
        // Fetch logs
        const resLogs = await fetch("/api/logs", {
            headers: { "Authorization": `Bearer ${token}` }
        });
        const logs = await resLogs.json();
        renderLogsTable(logs);
        
    } catch (err) {
        console.error("Error loading dev dashboard metrics:", err);
    }
}

function renderPerformanceChart(labels, data) {
    const ctx = document.getElementById('tcnPerformanceChart').getContext('2d');
    
    if (performanceChart) {
        performanceChart.destroy();
    }
    
    performanceChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: 'TCN-OCL Accuracy (%)',
                data: data,
                borderColor: '#8E70FF',
                backgroundColor: 'rgba(142, 112, 255, 0.15)',
                borderWidth: 3,
                fill: true,
                tension: 0.4,
                pointBackgroundColor: '#8E70FF',
                pointBorderColor: '#FFFFFF',
                pointHoverRadius: 7
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false }
            },
            scales: {
                x: {
                    grid: { color: 'rgba(35, 35, 61, 0.5)' },
                    ticks: { color: '#7E7E9A', font: { family: 'Outfit' } }
                },
                y: {
                    min: 50,
                    max: 100,
                    grid: { color: 'rgba(35, 35, 61, 0.5)' },
                    ticks: { color: '#7E7E9A', font: { family: 'Outfit' } }
                }
            }
        }
    });
}

function renderLogsTable(logs) {
    const tbody = document.getElementById('logs-table-body');
    tbody.innerHTML = "";
    
    if (logs.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" class="text-center text-muted">No records found. Perform registrations or logins first.</td></tr>`;
        return;
    }
    
    // Read the current tab filter
    const activeTab = document.querySelector('.filter-tabs .tab-btn.active').dataset.filter;
    
    let filteredLogs = logs;
    if (activeTab === "success") {
        filteredLogs = logs.filter(l => l.status === "AUTH_APPROVED");
    } else if (activeTab === "denied") {
        filteredLogs = logs.filter(l => l.status === "FAILED");
    } else if (activeTab === "error") {
        filteredLogs = logs.filter(l => l.status === "VERIFICATION_ERROR");
    }
    
    if (filteredLogs.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" class="text-center text-muted">No logs matching this category.</td></tr>`;
        return;
    }
    
    filteredLogs.forEach(l => {
        let badgeClass = "denied";
        let badgeText = "FAILED ATTEMPT";
        if (l.status === "AUTH_APPROVED") {
            badgeClass = "approved";
            badgeText = "AUTH APPROVED";
        } else if (l.status === "VERIFICATION_ERROR") {
            badgeClass = "error";
            badgeText = "VERIFICATION ERROR";
        }
        
        const row = document.createElement('tr');
        row.innerHTML = `
            <td><span class="status-badge ${badgeClass}"><span class="badge-dot"></span>${badgeText}</span></td>
            <td><span class="event-type-label">${l.event_type}</span></td>
            <td><strong>${l.username || 'unknown'}</strong></td>
            <td class="timestamp-cell">${formatTimestamp(l.created_at)}</td>
            <td class="accuracy-cell text-${l.status === 'AUTH_APPROVED' ? 'success' : 'danger'}">${(l.accuracy * 100).toFixed(1)}%</td>
            <td class="description-cell" title="${l.description || ''}">${l.description || '-'}</td>
        `;
        tbody.appendChild(row);
    });
}

function formatTimestamp(isoStr) {
    const date = new Date(isoStr);
    return date.toLocaleString();
}

async function flashLogs() {
    const token = localStorage.getItem("adminToken");
    if (!token) return;
    
    if (!confirm("Are you sure you want to clear/reset all logs in the database? This action is irreversible.")) {
        return;
    }
    
    try {
        const response = await fetch("/api/logs", {
            method: "DELETE",
            headers: { "Authorization": `Bearer ${token}` }
        });
        
        if (response.ok) {
            showToast("Logs flashed successfully.");
            loadDashboardData();
        } else {
            showToast("Failed to clear logs.");
        }
    } catch (err) {
        showToast("Error clearing logs.");
        console.error(err);
    }
}

// Navigation event bindings
document.addEventListener('DOMContentLoaded', () => {
    // Check if token already exists to pre-login to developer console
    const savedToken = localStorage.getItem("adminToken");
    
    // Main screen navigations
    document.getElementById('card-user-login').onclick = () => {
        currentFiles.login = [];
        document.getElementById('login-file-info').style.display = 'none';
        showScreen('screen-user-login');
    };
    document.getElementById('link-go-register').onclick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        currentFiles.register = [];
        document.getElementById('register-username').value = "";
        document.getElementById('register-file-info').style.display = 'none';
        showScreen('screen-register');
    };
    document.getElementById('card-dev-console').onclick = () => {
        if (savedToken) {
            showScreen('screen-dev-dashboard');
            loadDashboardData();
            devPollInterval = setInterval(loadDashboardData, 30000);
        } else {
            showScreen('screen-dev-login');
        }
    };
    
    document.getElementById('btn-logo-home').onclick = () => {
        if (document.getElementById('screen-dev-dashboard').classList.contains('active')) {
            // If logged in, stay or logout? Just do nothing or redirect to main
            return;
        }
        showScreen('screen-main');
    };

    // User Login actions
    document.getElementById('btn-verify-ecg').onclick = verifyECG;
    document.getElementById('btn-login-cancel').onclick = () => showScreen('screen-main');

    // Registration actions
    document.getElementById('btn-submit-register').onclick = registerUser;
    document.getElementById('btn-register-cancel').onclick = () => showScreen('screen-main');

    // Result actions
    document.getElementById('btn-approved-home').onclick = () => showScreen('screen-main');
    document.getElementById('btn-denied-home').onclick = () => showScreen('screen-main');

    // Enrollment Complete actions
    document.getElementById('btn-enroll-home').onclick = () => showScreen('screen-main');
    document.getElementById('btn-enroll-auth-now').onclick = () => {
        currentFiles.login = [];
        document.getElementById('login-file-info').style.display = 'none';
        showScreen('screen-user-login');
    };

    // Dev login actions
    document.getElementById('btn-dev-login').onclick = handleDevLogin;
    document.getElementById('btn-dev-login-cancel').onclick = () => showScreen('screen-main');
    
    // Dev Dashboard actions
    document.getElementById('btn-dev-logout').onclick = handleDevLogout;
    document.getElementById('btn-flash-logs').onclick = flashLogs;
    document.getElementById('btn-db-refresh').onclick = loadDashboardData;

    // Password input enter key trigger
    document.getElementById('dev-password').addEventListener('keypress', e => {
        if (e.key === 'Enter') handleDevLogin();
    });
    
    // Logs filter buttons tab switching
    document.querySelectorAll('.filter-tabs .tab-btn').forEach(btn => {
        btn.onclick = (e) => {
            document.querySelectorAll('.filter-tabs .tab-btn').forEach(b => b.classList.remove('active'));
            e.target.classList.add('active');
            
            // Reload logs table from local state or DB
            const token = localStorage.getItem("adminToken");
            if (token) {
                fetch("/api/logs", {
                    headers: { "Authorization": `Bearer ${token}` }
                })
                .then(res => res.json())
                .then(logs => renderLogsTable(logs))
                .catch(err => console.error(err));
            }
        };
    });

    // Initialize drag & drop for zones
    initDragAndDrop('login-upload-zone', 'login-file-input', 'login-file-info', 'login');
    initDragAndDrop('register-upload-zone', 'register-file-input', 'register-file-info', 'register');
});

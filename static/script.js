const API_BASE = '';

const fileInput = document.getElementById('fileInput');
const uploadZone = document.getElementById('uploadZone');
const progressBar = document.getElementById('progressBar');
const progressFill = document.getElementById('progressFill');
const uploadMessage = document.getElementById('uploadMessage');
const documentsList = document.getElementById('documentsList');
const documentSelect = document.getElementById('documentSelect');
const queryInput = document.getElementById('queryInput');
const queryButton = document.getElementById('queryButton');
const answerCard = document.getElementById('answerCard');
const answerContent = document.getElementById('answerContent');
const sourcesSection = document.getElementById('sourcesSection');
const metaInfo = document.getElementById('metaInfo');
const loadingOverlay = document.getElementById('loadingOverlay');
const statusCard = document.getElementById('statusCard');
const statusText = document.getElementById('statusText');
const profileBtn = document.getElementById('profileBtn');
const profileMenu = document.getElementById('profileMenu');
const logoutBtn = document.getElementById('logoutBtn');
const userEmail = document.getElementById('userEmail');
const profileMenuEmail = document.getElementById('profileMenuEmail');

let currentDocuments = [];

document.addEventListener('DOMContentLoaded', () => {
    // Check if user is logged in
    checkAuthStatus();
    
    // Load user info
    getUserInfo();
    
    // Initialize app
    checkHealth();
    loadDocuments();
    setupEventListeners();
});

function checkAuthStatus() {
    const email = localStorage.getItem('user_email');
    if (!email) {
        // User is not logged in, redirect to login page
        window.location.href = '/login';
    }
}

function getUserInfo() {
    const email = localStorage.getItem('user_email');
    if (email) {
        userEmail.textContent = email;
        profileMenuEmail.textContent = email;
    } else {
        userEmail.textContent = 'Not logged in';
        profileMenuEmail.textContent = 'Not logged in';
    }
}

function setupEventListeners() {
    // File upload events
    uploadZone.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', handleFileSelect);
    
    uploadZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        uploadZone.classList.add('dragover');
    });
    
    uploadZone.addEventListener('dragleave', () => {
        uploadZone.classList.remove('dragover');
    });
    
    uploadZone.addEventListener('drop', (e) => {
        e.preventDefault();
        uploadZone.classList.remove('dragover');
        const files = e.dataTransfer.files;
        if (files.length > 0) {
            handleFileUpload(files[0]);
        }
    });
    
    // Query events
    documentSelect.addEventListener('change', () => {
        queryButton.disabled = !documentSelect.value;
    });
    
    queryButton.addEventListener('click', handleQuery);
    
    queryInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter' && !e.shiftKey && !queryButton.disabled) {
            e.preventDefault();
            handleQuery();
        }
    });
    
    // Profile dropdown events
    profileBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        profileBtn.parentElement.classList.toggle('active');
    });

    document.addEventListener('click', (e) => {
        if (!profileBtn.parentElement.contains(e.target)) {
            profileBtn.parentElement.classList.remove('active');
        }
    });

    // Logout event
    logoutBtn.addEventListener('click', handleLogout);
}

async function handleLogout() {
    try {
        const response = await fetch('/logout', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            }
        });
        
        if (response.ok) {
            // Clear localStorage
            localStorage.removeItem('user_email');
            
            // Redirect to login page
            window.location.href = '/login';
        } else {
            console.error('Logout failed');
            // Still clear localStorage and redirect
            localStorage.removeItem('user_email');
            window.location.href = '/login';
        }
    } catch (error) {
        console.error('Logout error:', error);
        // Clear localStorage and redirect anyway
        localStorage.removeItem('user_email');
        window.location.href = '/login';
    }
}

async function checkHealth() {
    try {
        const response = await fetch(`${API_BASE}/health`);
        const data = await response.json();
        
        if (data.status === 'healthy') {
            statusText.textContent = '● System Online';
            statusCard.style.background = 'rgba(16, 185, 129, 0.1)';
            statusCard.style.borderColor = 'var(--success)';
        } else {
            statusText.textContent = '● System Degraded';
            statusCard.style.background = 'rgba(239, 68, 68, 0.1)';
            statusCard.style.borderColor = 'var(--danger)';
        }
    } catch (error) {
        statusText.textContent = '● System Error';
        statusCard.style.background = 'rgba(239, 68, 68, 0.1)';
        statusCard.style.borderColor = 'var(--danger)';
    }
}

function handleFileSelect(e) {
    const file = e.target.files[0];
    if (file) {
        handleFileUpload(file);
    }
}

async function handleFileUpload(file) {
    const validTypes = ['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'text/plain'];
    if (!validTypes.includes(file.type)) {
        showUploadMessage('Invalid file type. Please upload PDF, DOCX, or TXT files.', 'error');
        return;
    }
    
    if (file.size > 50 * 1024 * 1024) {
        showUploadMessage('File too large. Maximum size is 50MB.', 'error');
        return;
    }
    
    const formData = new FormData();
    formData.append('file', file);
    
    showLoading(true);
    progressBar.style.display = 'block';
    progressFill.style.width = '0%';
    
    const progressInterval = setInterval(() => {
        const currentWidth = parseFloat(progressFill.style.width) || 0;
        if (currentWidth < 90) {
            progressFill.style.width = (currentWidth + 10) + '%';
        }
    }, 200);
    
    try {
        const response = await fetch(`${API_BASE}/upload`, {
            method: 'POST',
            body: formData
        });
        
        clearInterval(progressInterval);
        progressFill.style.width = '100%';
        
        const data = await response.json();
        
        if (response.ok && data.success) {
            showUploadMessage(`✓ Successfully uploaded "${data.filename}" (${data.chunks_count} chunks)`, 'success');
            setTimeout(() => {
                progressBar.style.display = 'none';
                progressFill.style.width = '0%';
            }, 1000);
            loadDocuments();
        } else {
            progressBar.style.display = 'none';
            showUploadMessage(`✗ Upload failed: ${data.error || 'Unknown error'}`, 'error');
        }
    } catch (error) {
        clearInterval(progressInterval);
        progressBar.style.display = 'none';
        showUploadMessage(`✗ Upload failed: ${error.message}`, 'error');
    } finally {
        showLoading(false);
        fileInput.value = '';
    }
}

function showUploadMessage(message, type) {
    uploadMessage.textContent = message;
    uploadMessage.className = `upload-message ${type}`;
    uploadMessage.style.display = 'block';
    
    if (type === 'success') {
        setTimeout(() => {
            uploadMessage.style.display = 'none';
        }, 5000);
    }
}

async function loadDocuments() {
    try {
        const response = await fetch(`${API_BASE}/documents`);
        const data = await response.json();
        
        currentDocuments = data.documents || [];
        updateDocumentsList();
        updateDocumentSelect();
    } catch (error) {
        console.error('Error loading documents:', error);
    }
}

function updateDocumentsList() {
    if (currentDocuments.length === 0) {
        documentsList.innerHTML = `
            <div class="empty-state">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2"></path>
                    <rect x="9" y="3" width="6" height="4" rx="2"></rect>
                </svg>
                <p>No documents uploaded yet</p>
            </div>
        `;
        return;
    }
    
    documentsList.innerHTML = currentDocuments.map(doc => `
        <div class="doc-item">
            <div class="doc-info">
                <h3>📄 ${doc.filename || doc.doc_id}</h3>
                <p>${doc.chunks_count} chunks processed</p>
            </div>
            <button class="doc-delete" onclick="deleteDocument('${doc.doc_id}')">Delete</button>
        </div>
    `).join('');
}

function updateDocumentSelect() {
    if (currentDocuments.length === 0) {
        documentSelect.innerHTML = '<option value="">No documents available</option>';
        documentSelect.disabled = true;
        queryButton.disabled = true;
        return;
    }
    
    documentSelect.innerHTML = '<option value="">Select a document...</option>' +
        currentDocuments.map(doc => 
            `<option value="${doc.doc_id}">${doc.filename || doc.doc_id}</option>`
        ).join('');
    documentSelect.disabled = false;
}

async function deleteDocument(docId) {
    if (!confirm(`Are you sure you want to delete this document?`)) {
        return;
    }
    
    showLoading(true);
    
    try {
        const response = await fetch(`${API_BASE}/delete/${docId}`, {
            method: 'DELETE'
        });
        
        if (response.ok) {
            loadDocuments();
            if (documentSelect.value === docId) {
                documentSelect.value = '';
                queryButton.disabled = true;
                answerCard.style.display = 'none';
            }
        }
    } catch (error) {
        console.error('Error deleting document:', error);
    } finally {
        showLoading(false);
    }
}

async function handleQuery() {
    const query = queryInput.value.trim();
    const docId = documentSelect.value;
    
    if (!query || !docId) {
        return;
    }
    
    showLoading(true);
    answerCard.style.display = 'none';
    
    try {
        const response = await fetch(`${API_BASE}/query`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                query: query,
                doc_id: docId
            })
        });
        
        const data = await response.json();
        
        if (response.ok) {
            displayAnswer(data);
        } else {
            displayError(data.error || 'Query failed');
        }
    } catch (error) {
        displayError(error.message);
    } finally {
        showLoading(false);
    }
}

function displayAnswer(data) {
    answerContent.textContent = data.answer;
    answerCard.style.display = 'block';
    
    sourcesSection.style.display = 'none';
    
    metaInfo.textContent = `Processing time: ${data.processing_time.toFixed(2)}s`;
    
    setTimeout(() => {
        answerCard.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }, 100);
}

function displayError(message) {
    answerContent.textContent = `Error: ${message}`;
    answerContent.style.borderColor = 'var(--danger)';
    answerCard.style.display = 'block';
    sourcesSection.style.display = 'none';
    metaInfo.textContent = '';
    
    setTimeout(() => {
        answerContent.style.borderColor = 'var(--primary)';
    }, 3000);
}

function showLoading(show) {
    loadingOverlay.style.display = show ? 'flex' : 'none';
}
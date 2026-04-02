// Initialize Lucide Icons
lucide.createIcons();

// --- UI Elements ---
const myIdEl = document.getElementById('myId');
const connectionStatusEl = document.getElementById('connectionStatus');
const statusDot = connectionStatusEl.querySelector('.status-dot');
const statusText = connectionStatusEl.querySelector('.status-text');
const qrContainer = document.getElementById('qrcode');

const tabBtns = document.querySelectorAll('.tab-btn');
const tabContents = document.querySelectorAll('.tab-content');

const dropZone = document.getElementById('dropZone');
const fileInput = document.getElementById('fileInput');

const targetIdInput = document.getElementById('targetIdInput');
const connectBtn = document.getElementById('connectBtn');

const transferZone = document.getElementById('transferZone');
const transferTitle = document.getElementById('transferTitle');
const fileNameText = document.getElementById('fileNameText');
const fileSizeText = document.getElementById('fileSizeText');
const progressBarFill = document.getElementById('progressBarFill');
const progressPercent = document.getElementById('progressPercent');

const incomingModal = document.getElementById('incomingModal');
const incomingFileInfo = document.getElementById('incomingFileInfo');
const acceptBtn = document.getElementById('acceptBtn');
const declineBtn = document.getElementById('declineBtn');

const successModal = document.getElementById('successModal');
const successMsgText = document.getElementById('successMsgText');
const closeSuccessBtn = document.getElementById('closeSuccessBtn');
const downloadAgainBtn = document.getElementById('downloadAgainBtn');

const scanModal = document.getElementById('scanModal');
const scanVideo = document.getElementById('scanVideo');
const scanQrBtn = document.getElementById('scanQrBtn');
const closeScanBtn = document.getElementById('closeScanBtn');
const cancelTransferBtn = document.getElementById('cancelTransferBtn');
const toastContainer = document.getElementById('toastContainer');

// --- PeerJS / P2P Logic ---
let peer = null;
let currentConn = null;
let currentFileData = null;
let currentFileName = "";
let currentFileSize = 0;
let receivedBlob = null;
let scanning = false;
let canvasElement = document.createElement("canvas");
let canvas = canvasElement.getContext("2d", { willReadFrequently: true });

const radarContainer = document.getElementById('radarAnimation');
const transferInfo = document.getElementById('transferInfo');
const methodIcons = document.querySelectorAll('.method-icon');
const methodLabel = document.getElementById('methodLabel');

// Initialize Peer
function initPeer() {
    // Generate a shorter, readable ID (optional, PeerJS generates longer ones by default)
    const customId = Math.random().toString(36).substr(2, 6).toUpperCase();
    
    peer = new Peer(customId, {
        debug: 3
    });

    peer.on('open', (id) => {
        myIdEl.textContent = id;
        statusDot.className = 'status-dot online';
        statusText.textContent = 'Ready to sync';
        generateQR(id);
    });

    peer.on('error', (err) => {
        console.error('Peer error:', err);
        statusDot.className = 'status-dot offline';
        statusText.textContent = 'Offline (Retry in 5s)';
        setTimeout(initPeer, 5000);
    });

    // Handle Incoming Connection
    peer.on('connection', (conn) => {
        handleConnection(conn);
    });
}

function handleConnection(conn) {
    currentConn = conn;
    
    conn.on('open', () => {
        console.log("Connection established with:", conn.peer);
    });

    conn.on('data', (data) => {
        if (data.type === 'metadata') {
            // Sender sent file info, ask for acceptance
            currentFileName = data.name;
            currentFileSize = data.size;
            incomingFileInfo.textContent = `"${data.name}" (${formatBytes(data.size)})`;
            incomingModal.classList.remove('hidden');
        } else if (data.type === 'file') {
            // Sender sent the actual file after acceptance
            receivedBlob = new Blob([data.buffer]);
            const url = URL.createObjectURL(receivedBlob);
            
            // Auto download
            const a = document.createElement('a');
            a.href = url;
            a.download = currentFileName;
            a.click();
            // We don't revokeObjectURL here immediately to allow manual download
            
            showSuccess(`"${currentFileName}" has been received and saved.`, true);
            transferZone.classList.add('hidden');
        } else if (data.type === 'accept') {
            // Receiver accepted, send the file
            sendFileData();
        } else if (data.type === 'decline') {
            showToast("Transfer declined by receiver.", "error");
            transferZone.classList.add('hidden');
        }
    });

    conn.on('close', () => {
        showToast("Connection lost.", "error");
        console.log("Connection closed");
    });
}

// --- Toast System ---
function showToast(msg, type = "info") {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = msg;
    toastContainer.appendChild(toast);
    setTimeout(() => {
        toast.style.opacity = '0';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

// --- QR Scanner Logic ---
async function startScanner() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        showToast("Scanner requires HTTPS or localhost.", "error");
        return;
    }
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
        scanVideo.srcObject = stream;
        scanVideo.setAttribute("playsinline", true);
        scanVideo.play();
        scanning = true;
        scanModal.classList.remove('hidden');
        requestAnimationFrame(tick);
    } catch (err) {
        showToast("Camera access denied.", "error");
        console.error(err);
    }
}

function stopScanner() {
    scanning = false;
    if (scanVideo.srcObject) {
        scanVideo.srcObject.getTracks().forEach(track => track.stop());
    }
    scanModal.classList.add('hidden');
}

function tick() {
    if (!scanning) return;
    if (scanVideo.readyState === scanVideo.HAVE_ENOUGH_DATA) {
        canvasElement.height = scanVideo.videoHeight;
        canvasElement.width = scanVideo.videoWidth;
        canvas.drawImage(scanVideo, 0, 0, canvasElement.width, canvasElement.height);
        
        const imageData = canvas.getImageData(0, 0, canvasElement.width, canvasElement.height);
        const code = jsQR(imageData.data, imageData.width, imageData.height, {
            inversionAttempts: "dontInvert",
        });

        if (code) {
            console.log("Found QR code", code.data);
            showToast("ID Found! Connecting...");
            targetIdInput.value = code.data;
            stopScanner();
            if (currentFileData) {
                initiateSend(code.data);
            } else {
                showToast("ID Loaded. Now select a file.");
                // Switch to Send tab if in Receive
                tabBtns[0].click();
            }
        }
    }
    requestAnimationFrame(tick);
}

scanQrBtn.addEventListener('click', startScanner);
closeScanBtn.addEventListener('click', stopScanner);

// --- Interaction Logic ---

// Tab Switching
tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
        tabBtns.forEach(b => b.classList.remove('active'));
        tabContents.forEach(c => c.classList.remove('active'));
        
        btn.classList.add('active');
        document.getElementById(btn.dataset.tab + 'Tab').classList.add('active');
    });
});

// File Selection
dropZone.addEventListener('click', () => fileInput.click());

fileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) prepareToSend(file);
});

dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropZone.classList.add('dragover');
});

dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragover'));

dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.remove('dragover');
    const file = e.dataTransfer.files[0];
    if (file) prepareToSend(file);
});

function prepareToSend(file) {
    currentFileData = file;
    fileNameText.textContent = file.name;
    fileSizeText.textContent = formatBytes(file.size);
    
    // In "Send" mode, we need a Target ID to connect
    // If we're not connected yet, show instructions
    const targetId = targetIdInput.value.trim();
    if (targetId) {
        initiateSend(targetId);
    } else {
        alert("Please enter the Receiver ID or use the Receive tab on the other device.");
    }
}

function initiateSend(targetId) {
    if (!peer) return;
    
    transferZone.classList.remove('hidden');
    radarContainer.classList.remove('hidden'); // Show radar first
    transferInfo.classList.add('hidden');
    progressBarFill.style.width = '0%';
    progressPercent.textContent = '0%';

    // Simulate "Finding device" through the chosen method
    setTimeout(() => {
        const conn = peer.connect(targetId);
        handleConnection(conn);

        conn.on('open', () => {
            radarContainer.classList.add('hidden');
            transferInfo.classList.remove('hidden');
            transferTitle.textContent = "Requesting Access...";
            // Send metadata first
            conn.send({
                type: 'metadata',
                name: currentFileData.name,
                size: currentFileData.size
            });
        });
        
        conn.on('error', () => {
            showToast("Device Discovery Failed", "error");
            transferZone.classList.add('hidden');
        });
    }, 2000); // 2s of radar scanning
}

function sendFileData() {
    transferTitle.textContent = "Optimizing Route...";
    
    // Simulate some "Connecting" time for aesthetics
    setTimeout(() => {
        transferTitle.textContent = "Sending Document...";
        
        const reader = new FileReader();
        reader.onload = (event) => {
            currentConn.send({
                type: 'file',
                buffer: event.target.result
            });
            updateProgress(100);
            setTimeout(() => {
                showSuccess(`"${currentFileData.name}" was sent successfully!`);
                transferZone.classList.add('hidden');
            }, 1000);
        };
        
        // In a real high-perf app we'd use chunks, but for standard files this works
        reader.readAsArrayBuffer(currentFileData);
        
        // Fake progress for visual feedback
        let prog = 0;
        const interval = setInterval(() => {
            prog += 15;
            if (prog >= 95) clearInterval(interval);
            updateProgress(Math.min(prog, 95));
        }, 300);
    }, 1500);
}

function updateProgress(val) {
    progressBarFill.style.width = `${val}%`;
    progressPercent.textContent = `${val}%`;
}

// --- Receivers Actions ---
acceptBtn.addEventListener('click', () => {
    incomingModal.classList.add('hidden');
    transferTitle.textContent = "Receiving Document...";
    transferZone.classList.remove('hidden');
    updateProgress(10);
    
    currentConn.send({ type: 'accept' });
});

declineBtn.addEventListener('click', () => {
    incomingModal.classList.add('hidden');
    currentConn.send({ type: 'decline' });
});

// --- UI Helpers ---
function generateQR(id) {
    qrContainer.innerHTML = '';
    new QRCode(qrContainer, {
        text: id,
        width: 160,
        height: 160,
        colorDark : "#0f172a",
        colorLight : "#ffffff",
        correctLevel : QRCode.CorrectLevel.H
    });
}

function formatBytes(bytes, decimals = 2) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

function showSuccess(msg, showDownload = false) {
    successMsgText.textContent = msg;
    if (showDownload && receivedBlob) {
        downloadAgainBtn.classList.remove('hidden');
    } else {
        downloadAgainBtn.classList.add('hidden');
    }
    successModal.classList.remove('hidden');
}

downloadAgainBtn.addEventListener('click', () => {
    if (receivedBlob) {
        const url = URL.createObjectURL(receivedBlob);
        const a = document.createElement('a');
        a.href = url;
        a.download = currentFileName;
        a.click();
        URL.revokeObjectURL(url);
    }
});

closeSuccessBtn.addEventListener('click', () => {
    successModal.classList.add('hidden');
    receivedBlob = null; // Clear blob after closing
});

// Copy ID
document.getElementById('copyIdBtn').addEventListener('click', () => {
    navigator.clipboard.writeText(myIdEl.textContent);
    showToast("Connection ID copied!");
});

// Manual Connect Button
connectBtn.addEventListener('click', () => {
    const targetId = targetIdInput.value.trim();
    if (targetId) {
        if (currentFileData) {
            initiateSend(targetId);
        } else {
            showToast("Please select a file to send first.");
        }
    } else {
        showToast("Enter the ID of the receiver.");
    }
});

// Cancel Transfer Logic
cancelTransferBtn.addEventListener('click', () => {
    if (currentConn) {
        currentConn.close();
    }
    transferZone.classList.add('hidden');
    radarContainer.classList.add('hidden');
    scanning = false;
    showToast("Transfer Aborted", "error");
});

// Method Switching Simulation
methodIcons.forEach(icon => {
    icon.addEventListener('click', () => {
        methodIcons.forEach(i => i.classList.remove('active'));
        icon.classList.add('active');
        methodLabel.textContent = `Optimizing for ${icon.dataset.method}...`;
        showToast(`Switched to ${icon.dataset.method} mode`);
    });
});

// Initial Start
initPeer();

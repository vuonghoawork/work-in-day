// 1. Đăng ký Service Worker
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js')
            .then(reg => console.log('Service Worker đã đăng ký thành công! Phạm vi:', reg.scope))
            .catch(err => console.error('Đăng ký Service Worker thất bại:', err));
    });
}

// 2. Khai báo DOM Elements
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
const recordBtn = document.getElementById('record-btn');
const saveBtn = document.getElementById('save-btn');
const previewText = document.getElementById('preview-text');
const statusDiv = document.getElementById('status');
const logsContainer = document.getElementById('logs-container');
const clearAllBtn = document.getElementById('clear-all-btn');

let recognition;
let isRecording = false;

// BIẾN GỐC MỚI: Quản lý chữ theo phiên (Session) để chống nhân đôi chữ khi offline
let baseText = ''; 

function capitalizeFirstLetter(text) {
    if (!text) return '';
    let trimmed = text.trim();
    return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
}

// -------------------------------------------------------------
// THUẬT TOÁN SỬ DỤNG SET: LỌC TRÙNG TỪ VÀ GIỮ NGUYÊN THỨ TỰ
// -------------------------------------------------------------
function removeDuplicates(text) {
    if (!text) return '';
    
    // Tách văn bản thành mảng các từ dựa trên khoảng trắng
    let wordsRaw = text.trim().replace(/\s+/g, ' ').split(' ');
    
    // Sử dụng Set để lọc bỏ các từ trùng lặp, giữ lại từ đầu tiên xuất hiện
    let uniqueWords = [...new Set(wordsRaw)];
    
    // Nối các từ lại thành chuỗi văn bản hoàn chỉnh
    return uniqueWords.join(' ');
}


// -------------------------------------------------------------

// 3. Khởi tạo Speech Recognition
if (!SpeechRecognition) {
    statusDiv.innerText = "Trình duyệt không hỗ trợ nhận diện giọng nói. Hãy dùng Chrome/Edge.";
    recordBtn.disabled = true;
} else {
    recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true; // Bắt buộc false để ổn định offline
    recognition.lang = 'vi-VN';

    recognition.onresult = (event) => {
        let currentSessionText = '';
        
        // SỬA LỖI NHÂN ĐÔI CHỮ: 
        // Luôn duyệt từ 0 (bỏ qua event.resultIndex) để chống lỗi bộ nhớ đệm của Chrome offline
        for (let i = 0; i < event.results.length; ++i) {
            if (event.results[i].isFinal) {
                currentSessionText += event.results[i][0].transcript + ' ';
            }
        }
        
        // 1. Kết hợp text cũ và mới
        const rawFullText = currentSessionText.trim();
        
        // 2. Áp dụng thuật toán Set để giữ thứ tự và lọc trùng
        const cleanedRawFullText = removeDuplicates(rawFullText);
        
        // 3. Hiển thị kết quả sạch
        const fullTextOnline = baseText + cleanedRawFullText;
        previewText.value = capitalizeFirstLetter(fullTextOnline);
    };

    recognition.onerror = (event) => {
        console.error("Lỗi nhận diện:", event.error);
        if (event.error === 'network') {
            statusDiv.innerText = "Mất kết nối mạng, đang dùng chế độ Offline...";
        } else {
            statusDiv.innerText = "Lỗi: " + event.error + ". Cần Micro và HTTPS/Live Server.";
            stopRecording();
        }
    };

    recognition.onend = () => {
        if (isRecording) {
            baseText = previewText.value.trim();
            if (baseText.length > 0) baseText += ' '; 

            setTimeout(() => {
                try {
                    recognition.start();
                } catch (e) {
                    console.error("Không thể khởi động lại recognition:", e);
                }
            }, 200);
        }
    };
}

// 4. Các sự kiện (Event Listeners)
recordBtn.addEventListener('click', () => {
    if (!isRecording) {
        isRecording = true;
        baseText = previewText.value.trim();
        if (baseText.length > 0) baseText += ' ';

        try {
            recognition.start();
            recordBtn.innerText = "🛑 Đang ghi âm... Nhấn để dừng";
            recordBtn.classList.add('recording');
            statusDiv.innerText = "Đang lắng nghe...";
        } catch (e) {
            console.error("Lỗi khi bắt đầu ghi âm:", e);
        }
    } else {
        stopRecording();
    }
});

function stopRecording() {
    isRecording = false;
    if (recognition) recognition.stop();
    recordBtn.innerText = "🎙️ Nhấn để nói";
    recordBtn.classList.remove('recording');
    statusDiv.innerText = "Đã dừng.";
}

previewText.addEventListener('input', () => {
    baseText = previewText.value;
    if (baseText.length > 0 && !baseText.endsWith(' ')) {
        baseText += ' ';
    }
});

saveBtn.addEventListener('click', () => {
    const text = previewText.value.trim();
    if (!text) return alert("Không có nội dung để lưu!");

    const now = new Date();
    const timeString = now.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }) + ' - ' + now.toLocaleDateString('vi-VN');
    
    const logEntry = { id: Date.now(), time: timeString, content: text };
    let logs = JSON.parse(localStorage.getItem('daily_logs')) || [];
    logs.unshift(logEntry);
    localStorage.setItem('daily_logs', JSON.stringify(logs));

    previewText.value = '';
    baseText = ''; 
    
    displayLogs();
});

clearAllBtn.addEventListener('click', () => {
    if (confirm("Bạn có chắc chắn muốn XOÁ TOÀN BỘ lịch sử nhật ký không? Thao tác này không thể hoàn tác!")) {
        localStorage.removeItem('daily_logs');
        displayLogs();
    }
});

function displayLogs() {
    logsContainer.innerHTML = '';
    const logs = JSON.parse(localStorage.getItem('daily_logs')) || [];

    if (logs.length === 0) {
        logsContainer.innerHTML = '<p style="color: var(--text-light); font-style: italic; text-align: center;">Chưa có nhật ký.</p>';
        clearAllBtn.style.display = 'none';
        return;
    }

    clearAllBtn.style.display = 'block';

    logs.forEach(log => {
        const item = document.createElement('div');
        item.className = 'log-item';
        item.innerHTML = `
            <div class="log-time">${log.time}</div>
            <div class="log-text"></div>
            <button class="btn-delete">❌</button>
        `;
        item.querySelector('.log-text').innerText = log.content;
        
        item.querySelector('.btn-delete').addEventListener('click', () => {
            if (confirm("Xóa dòng này?")) {
                let currentLogs = JSON.parse(localStorage.getItem('daily_logs')) || [];
                currentLogs = currentLogs.filter(item => item.id !== log.id);
                localStorage.setItem('daily_logs', JSON.stringify(currentLogs));
                displayLogs();
            }
        });
        logsContainer.appendChild(item);
    });
}

displayLogs();

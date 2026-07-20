// 1. Đăng ký Service Worker
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js')
            .then(reg => console.log('Service Worker đã đăng ký thành công! Phạm vi:', reg.scope))
            .catch(err => console.error('Đăng ký Service Worker thất bại:', err));
    });
}

// 2. Cấu hình Theme Giao diện
const themes = {
    cyber: { cyan: '#00f2fe', purple: '#a855f7', pink: '#f43f5e', emerald: '#10b981', bg: 'radial-gradient(circle at 50% 0%, #1a1235 0%, #0d0e12 100%)' },
    gold: { cyan: '#f3e5ab', purple: '#d4af37', pink: '#ef4444', emerald: '#4ade80', bg: 'radial-gradient(circle at 50% 0%, #111c30 0%, #050811 100%)' },
    blood: { cyan: '#ffb3b3', purple: '#ff3333', pink: '#800000', emerald: '#10b981', bg: 'radial-gradient(circle at 50% 0%, #2a0808 0%, #080202 100%)' },
    emerald: { cyan: '#a3f7bf', purple: '#50c878', pink: '#f43f5e', emerald: '#2e8b57', bg: 'radial-gradient(circle at 50% 0%, #021a0e 0%, #020804 100%)' }
};

let activeTheme = localStorage.getItem('log_active_theme') || 'cyber';
let myChart = null; // Biến lưu trữ thực thể biểu đồ Chart.js

const applyTheme = (themeKey) => {
    const t = themes[themeKey] || themes.cyber;
    const r = document.documentElement.style;
    r.setProperty('--cyan', t.cyan);
    r.setProperty('--purple', t.purple);
    r.setProperty('--pink', t.pink);
    r.setProperty('--emerald', t.emerald);
    r.setProperty('--bg-gradient', t.bg);
    
    activeTheme = themeKey;
    const select = document.getElementById('theme-select');
    if (select) select.value = themeKey;
    localStorage.setItem('log_active_theme', themeKey);
    updateChart(); // Cập nhật lại màu sắc biểu đồ tương ứng theo theme mới
};

// 3. Khai báo các DOM Elements
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
const recordBtn = document.getElementById('record-btn');
const saveBtn = document.getElementById('save-btn');
const previewText = document.getElementById('preview-text');
const statusDiv = document.getElementById('status');
const logsContainer = document.getElementById('logs-container');
const clearAllBtn = document.getElementById('clear-all-btn');

const balanceDisplay = document.getElementById('balance-display');
const initBalanceInput = document.getElementById('init-balance-input');
const initBalanceBtn = document.getElementById('init-balance-btn');
const ctxCanvas = document.getElementById('financeChart').getContext('2d');

let recognition;
let isRecording = false;
let baseText = '';

// Khởi tạo các biến quản lý Tài chính
let currentBalance = parseFloat(localStorage.getItem('wallet_balance')) || 0;
let financeHistory = JSON.parse(localStorage.getItem('finance_history')) || [];

function capitalizeFirstLetter(text) {
    if (!text) return '';
    let trimmed = text.trim();
    return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
}

function removeDuplicates(text) {
    if (!text) return '';
    let wordsRaw = text.trim().replace(/\s+/g, ' ').split(' ');
    let uniqueWords = [...new Set(wordsRaw)];
    return uniqueWords.join(' ');
}

// 4. Cơ chế xử lý chuỗi và Phát hiện Từ khóa Khối tài chính (a100, b50, A20, B33)
function parseFinancialCommands(text) {
    const regex = /([abAB])(\d+)/g;
    let match;
    let totalChange = 0;
    let detectedCmds = [];

    while ((match = regex.exec(text)) !== null) {
        const type = match[1].toLowerCase();
        const value = parseInt(match[2], 10);

        if (type === 'a') {
            totalChange += value;
            detectedCmds.push(`+${value}$`);
        } else if (type === 'b') {
            totalChange -= value;
            detectedCmds.push(`-${value}$`);
        }
    }
    return { totalChange, detectedCmds };
}

// 5. Cấu hình Engine Nhận diện giọng nói
if (!SpeechRecognition) {
    statusDiv.innerText = "Trình duyệt không hỗ trợ nhận diện giọng nói. Hãy dùng Chrome/Edge.";
    recordBtn.disabled = true;
} else {
    recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'vi-VN';

    recognition.onstart = () => {
        statusDiv.innerText = "Đang lắng nghe dữ liệu sóng âm...";
        recordBtn.innerHTML = "🛑 Đang ghi âm... Nhấn để dừng";
        recordBtn.classList.add('recording');
    };

    recognition.onresult = (event) => {
        let currentSessionText = '';
        for (let i = 0; i < event.results.length; ++i) {
            if (event.results[i].isFinal) {
                currentSessionText += event.results[i][0].transcript + ' ';
            }
        }
        const rawFullText = currentSessionText.trim();
        const cleanedRawFullText = removeDuplicates(rawFullText);
        const fullTextOnline = baseText + cleanedRawFullText;
        previewText.value = capitalizeFirstLetter(fullTextOnline);
    };

    recognition.onerror = (event) => {
        console.error("Lỗi nhận diện:", event.error);
        statusDiv.innerText = "Lỗi Micro hoặc HTTPS: " + event.error;
        stopRecording();
    };

    recognition.onend = () => {
        if (isRecording) {
            baseText = previewText.value.trim();
            if (baseText.length > 0) baseText += ' ';
            setTimeout(() => { try { if (isRecording) recognition.start(); } catch (e) {} }, 200);
        }
    };
}

function stopRecording() {
    isRecording = false;
    if (recognition) recognition.stop();
    recordBtn.innerHTML = "🎙️ Nhấn để ghi âm";
    recordBtn.classList.remove('recording');
    statusDiv.innerText = "Đã dừng.";
}

// 6. Xử lý Đồ thị với thư viện CDN Chart.js chuyên nghiệp
function updateChart() {
    if (!window.Chart) return;

    const computedStyle = getComputedStyle(document.documentElement);
    const primaryColor = computedStyle.getPropertyValue('--cyan').trim() || '#00f2fe';
    const accentColor = computedStyle.getPropertyValue('--purple').trim() || '#a855f7';

    const labels = financeHistory.map(item => item.time);
    const dataValues = financeHistory.map(item => item.balance);

    if (myChart) {
        // Cập nhật dữ liệu và màu sắc cho biểu đồ hiện tại
        myChart.data.labels = labels;
        myChart.data.datasets[0].data = dataValues;
        myChart.data.datasets[0].borderColor = primaryColor;
        myChart.data.datasets[0].pointBackgroundColor = accentColor;
        myChart.update();
    } else {
        // Khởi tạo mới nếu chưa tồn tại thực thể
        myChart = new Chart(ctxCanvas, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Số dư ($)',
                    data: dataValues,
                    borderColor: primaryColor,
                    borderWidth: 3,
                    pointBackgroundColor: accentColor,
                    pointRadius: 4,
                    tension: 0.3,
                    fill: false
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
                        grid: { color: 'rgba(255, 255, 255, 0.05)' },
                        ticks: { color: 'rgba(255, 255, 255, 0.5)', font: { family: 'JetBrains Mono', size: 10 } }
                    },
                    y: {
                        grid: { color: 'rgba(255, 255, 255, 0.05)' },
                        ticks: { color: 'rgba(255, 255, 255, 0.5)', font: { family: 'JetBrains Mono', size: 10 } }
                    }
                }
            }
        });
    }
}

// 7. Render danh sách Khối Lịch trình (Timeline Log)
function displayLogs() {
    logsContainer.innerHTML = '';
    const logs = JSON.parse(localStorage.getItem('daily_logs')) || [];

    if (logs.length === 0) {
        logsContainer.innerHTML = '<div style="text-align:center; color:var(--text-muted); font-size:13px; padding:20px 0;">Chưa có khối dữ liệu nào được mint hôm nay.</div>';
        clearAllBtn.style.display = 'none';
        return;
    }

    clearAllBtn.style.display = 'block';

    logs.forEach((log, index) => {
        const item = document.createElement('div');
        item.className = 'log-item';
        
        let txMarkup = '';
        if (log.financeInfo && log.financeInfo.length > 0) {
            log.financeInfo.forEach(info => {
                const badgeClass = info.startsWith('+') ? 'tx-plus' : 'tx-minus';
                txMarkup += `<span class="tx-badge ${badgeClass}">${info}</span> `;
            });
        }

        item.innerHTML = `
            <div class="log-time">[BLOCK #${logs.length - index}] • ${log.time}</div>
            <div class="log-text"></div>
            ${txMarkup}
            <button class="btn-delete" title="Hủy khối">🗑️</button>
        `;
        item.querySelector('.log-text').innerText = log.content;
        
        item.querySelector('.btn-delete').addEventListener('click', () => {
            if (confirm("Bạn muốn hủy khối dữ liệu lịch trình này?")) {
                let currentLogs = JSON.parse(localStorage.getItem('daily_logs')) || [];
                currentLogs = currentLogs.filter(el => el.id !== log.id);
                localStorage.setItem('daily_logs', JSON.stringify(currentLogs));
                displayLogs();
            }
        });
        logsContainer.appendChild(item);
    });
}

function updateBalanceUI() {
    balanceDisplay.innerText = currentBalance.toLocaleString('en-US');
    localStorage.setItem('wallet_balance', currentBalance);
    localStorage.setItem('finance_history', JSON.stringify(financeHistory));
    updateChart();
}

// 8. Đăng ký Sự kiện (Event Listeners) khởi chạy
window.addEventListener('DOMContentLoaded', () => {
    applyTheme(activeTheme);
    displayLogs();
    updateBalanceUI();

    // Điều khiển cấu trúc Tabs & ÉP ĐỒ THỊ BẢO TOÀN BỐ CỤC
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
            document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
            
            e.target.classList.add('active');
            document.getElementById(`tab-${e.target.dataset.tab}`).classList.add('active');
            
            // XỬ LÝ CHỐNG VỠ: Khi mở tab tài chính, ép biểu đồ render lại chuẩn kích thước container
            if (e.target.dataset.tab === 'finance') {
                setTimeout(() => {
                    updateChart(); // Đảm bảo thực thể chart tồn tại hoặc được cập nhật màu
                    if (myChart && typeof myChart.resize === 'function') {
                        myChart.resize();       // Tính lại width/height thật
                        myChart.update('none'); // Render lại mượt mà không tạo animation thừa giật lag
                    }
                }, 60); // 60ms trì hoãn để trình duyệt kịp cập nhật trạng thái hiển thị của CSS
            }
        });
    });

    // Nút Khởi tạo số tiền ban đầu
    initBalanceBtn.addEventListener('click', () => {
        const val = parseFloat(initBalanceInput.value);
        if (isNaN(val)) return alert("Vui lòng nhập số tiền hợp lệ!");
        
        const now = new Date();
        const timeStr = now.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
        
        currentBalance = val;
        financeHistory = [{ time: timeStr, balance: currentBalance }];
        
        initBalanceInput.value = '';
        updateBalanceUI();
    });

    // Thay đổi Theme qua select box
    const themeSelect = document.getElementById('theme-select');
    if (themeSelect) {
        themeSelect.addEventListener('change', (e) => applyTheme(e.target.value));
    }

    // Nút đổi theme nhanh
    const themeToggleBtn = document.getElementById('theme-toggle-btn');
    if (themeToggleBtn) {
        themeToggleBtn.addEventListener('click', () => {
            const keys = Object.keys(themes);
            let nextIdx = (keys.indexOf(activeTheme) + 1) % keys.length;
            applyTheme(keys[nextIdx]);
        });
    }

    // Bật/Tắt Ghi Âm Giọng nói
    recordBtn.addEventListener('click', () => {
        if (!isRecording) {
            isRecording = true;
            baseText = previewText.value.trim();
            if (baseText.length > 0) baseText += ' ';
            try { recognition.start(); } catch (e) { console.error(e); }
        } else {
            stopRecording();
        }
    });

    previewText.addEventListener('input', () => {
        baseText = previewText.value;
        if (baseText.length > 0 && !baseText.endsWith(' ')) baseText += ' ';
    });

    // Xử lý Hành động Lưu/Mint Khối dữ liệu
    saveBtn.addEventListener('click', () => {
        const text = previewText.value.trim();
        if (!text) return alert("Vui lòng nhập hoặc nói nội dung dữ liệu!");

        const { totalChange, detectedCmds } = parseFinancialCommands(text);
        
        const now = new Date();
        const timeString = now.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
        const fullDateString = timeString + ' - ' + now.toLocaleDateString('vi-VN');

        if (detectedCmds.length > 0) {
            currentBalance += totalChange;
            financeHistory.push({
                time: timeString,
                balance: currentBalance
            });
            updateBalanceUI();
        }

        const logEntry = { 
            id: Date.now(), 
            time: fullDateString, 
            content: text,
            financeInfo: detectedCmds 
        };
        
        let logs = JSON.parse(localStorage.getItem('daily_logs')) || [];
        logs.unshift(logEntry);
        localStorage.setItem('daily_logs', JSON.stringify(logs));

        previewText.value = '';
        baseText = ''; 
        statusDiv.innerText = "Khối dữ liệu đã được nạp thành công.";
        
        displayLogs();
    });

    clearAllBtn.addEventListener('click', () => {
        if (confirm("Hành động này sẽ xóa sạch toàn bộ dữ liệu Ledger của ngày hôm nay?")) {
            localStorage.removeItem('daily_logs');
            displayLogs();
        }
    });
});

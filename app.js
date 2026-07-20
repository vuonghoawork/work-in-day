// ==========================================
// 1. Đăng ký Service Worker
// ==========================================
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js')
            .then(reg => console.log('Service Worker đã đăng ký thành công! Phạm vi:', reg.scope))
            .catch(err => console.error('Đăng ký Service Worker thất bại:', err));
    });
}

// ==========================================
// 2. Cấu hình Theme Giao diện
// ==========================================
const themes = {
    cyber: { cyan: '#00f2fe', purple: '#a855f7', pink: '#f43f5e', emerald: '#10b981', bg: 'radial-gradient(circle at 50% 0%, #1a1235 0%, #0d0e12 100%)' },
    gold: { cyan: '#f3e5ab', purple: '#d4af37', pink: '#ef4444', emerald: '#4ade80', bg: 'radial-gradient(circle at 50% 0%, #111c30 0%, #050811 100%)' },
    blood: { cyan: '#ffb3b3', purple: '#ff3333', pink: '#800000', emerald: '#10b981', bg: 'radial-gradient(circle at 50% 0%, #2a0808 0%, #080202 100%)' },
    emerald: { cyan: '#a3f7bf', purple: '#50c878', pink: '#f43f5e', emerald: '#2e8b57', bg: 'radial-gradient(circle at 50% 0%, #021a0e 0%, #020804 100%)' }
};

let activeTheme = localStorage.getItem('log_active_theme') || 'cyber';
let myChart = null;

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
    updateChart();
};

// ==========================================
// 3. Khai báo DOM Elements & Biến Toàn cục
// ==========================================
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
const recordBtn = document.getElementById('record-btn');
const saveBtn = document.getElementById('save-btn');
const previewText = document.getElementById('preview-text');
const clearInputBtn = document.getElementById('clear-input-btn');
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
let isMinting = false;
let isCleared = false; // Cờ báo để chặn các kết quả cũ từ bộ đệm Speech API

let currentBalance = parseFloat(localStorage.getItem('wallet_balance')) || 0;
let financeHistory = JSON.parse(localStorage.getItem('finance_history')) || [];

// ==========================================
// 4. Các Hàm Trợ Giúp Xử Lý Chuỗi (String Helpers)
// ==========================================
function capitalizeFirstLetter(str) {
    if (!str) return '';
    let trimmed = str.trim();
    return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
}

// Hàm lọc trùng từ lặp bằng Set + Filter chuẩn xác
function removeDuplicates(text) {
    if (!text) return '';
    
    const words = text.trim().replace(/\s+/g, ' ').split(' ');
    if (words.length < 2) return capitalizeFirstLetter(text.trim());

    const uniqueLower = [];
    const seen = new Set();
    
    for (let word of words) {
        const lower = word.toLowerCase();
        if (!seen.has(lower)) {
            seen.add(lower);
            uniqueLower.push(lower);
        }
    }

    const filteredLower = uniqueLower.filter((lowerA, indexA) => 
        !uniqueLower.some((lowerB, indexB) => 
            indexA !== indexB && lowerB.length > lowerA.length && lowerB.includes(lowerA)
        )
    );

    return capitalizeFirstLetter(filteredLower.join(' '));
}

// Tự động nối ký hiệu 'a', 'b' đứng rời với chuỗi số
function mergeCommandPrefixes(text) {
    if (!text) return '';
    return text.replace(/\b([abAB])\s+(\d+(?:[\.,]\d+)*)/g, '$1$2');
}

// Cơ chế xử lý chuỗi và Phát hiện Từ khóa Khối tài chính
function parseFinancialCommands(text) {
    const regex = /([abAB])(\d+(?:[\.,]\d+)*)/g;
    let match;
    let totalChange = 0;
    let detectedCmds = [];

    while ((match = regex.exec(text)) !== null) {
        const type = match[1].toLowerCase();
        const rawValue = match[2].replace(/[\.,]/g, '');
        const value = parseInt(rawValue, 10);

        if (!isNaN(value)) {
            if (type === 'a') {
                totalChange += value;
                detectedCmds.push(`+${value.toLocaleString('en-US')}$`);
            } else if (type === 'b') {
                totalChange -= value;
                detectedCmds.push(`-${value.toLocaleString('en-US')}$`);
            }
        }
    }
    return { totalChange, detectedCmds };
}

// Hàm quản lý hiển thị/ẩn Nút Xóa X trong ô nhập
function toggleClearInputBtn() {
    if (previewText.value.trim().length > 0) {
        clearInputBtn.style.display = 'flex';
    } else {
        clearInputBtn.style.display = 'none';
    }
}

// ==========================================
// 5. Cấu hình Engine Nhận diện giọng nói
// ==========================================
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
        isMinting = false; 
    };

    recognition.onresult = (event) => {
        // Bỏ qua nếu đang mint dữ liệu hoặc vừa bấm nút ✖
        if (isMinting || isCleared) return; 

        let currentSessionText = '';
        for (let i = event.resultIndex; i < event.results.length; ++i) {
            if (event.results[i].isFinal) {
                currentSessionText += event.results[i][0].transcript + ' ';
            }
        }
        const rawFullText = currentSessionText.trim();
        const fullTextOnline = (baseText + ' ' + rawFullText).trim();
        
        const mergedText = mergeCommandPrefixes(fullTextOnline);
        const cleanedText = removeDuplicates(mergedText);
        previewText.value = capitalizeFirstLetter(cleanedText);
        
        toggleClearInputBtn();
    };

    recognition.onerror = (event) => {
        console.error("Lỗi nhận diện:", event.error);
        statusDiv.innerText = "Lỗi Micro hoặc HTTPS: " + event.error;
        stopRecording();
    };

    recognition.onend = () => {
        if (isRecording) {
            if (!isMinting && !isCleared) {
                baseText = previewText.value.trim();
                if (baseText.length > 0) baseText += ' ';
            }
            // Tự động khởi động lại Micro mượt mà
            setTimeout(() => { 
                try { 
                    if (isRecording) recognition.start(); 
                } catch (e) {} 
            }, 100);
        }
    };
}

function stopRecording() {
    isRecording = false;
    isMinting = false;
    if (recognition) recognition.stop();
    recordBtn.innerHTML = "🎙️ Nhấn để ghi âm";
    recordBtn.classList.remove('recording');
}

// ==========================================
// 6. Xử lý Đồ thị với Chart.js
// ==========================================
function updateChart() {
    if (!window.Chart) return;

    const computedStyle = getComputedStyle(document.documentElement);
    const primaryColor = computedStyle.getPropertyValue('--cyan').trim() || '#00f2fe';
    const accentColor = computedStyle.getPropertyValue('--purple').trim() || '#a855f7';

    const labels = financeHistory.map(item => item.time);
    const dataValues = financeHistory.map(item => item.balance);

    if (myChart) {
        myChart.data.labels = labels;
        myChart.data.datasets[0].data = dataValues;
        myChart.data.datasets[0].borderColor = primaryColor;
        myChart.data.datasets[0].pointBackgroundColor = accentColor;
        myChart.update();
    } else {
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
                        ticks: { 
                            color: 'rgba(255, 255, 255, 0.5)', 
                            font: { family: 'JetBrains Mono', size: 10 },
                            maxTicksLimit: 6
                        }
                    }
                }
            }
        });
    }
}

// ==========================================
// 7. Render Lịch trình & Xử lý Nút Wipe ở cuối Tab
// ==========================================
function displayLogs() {
    logsContainer.innerHTML = '';
    const logs = JSON.parse(localStorage.getItem('daily_logs')) || [];

    if (logs.length === 0) {
        logsContainer.innerHTML = '<div style="text-align:center; color:var(--text-muted); font-size:13px; padding:20px 0;">Chưa có khối dữ liệu nào được mint hôm nay.</div>';
    } else {
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

    if (logs.length > 0 || currentBalance !== 0 || financeHistory.length > 0) {
        clearAllBtn.style.display = 'block';
    } else {
        clearAllBtn.style.display = 'none';
    }
}

function updateBalanceUI() {
    balanceDisplay.innerText = currentBalance.toLocaleString('en-US');
    localStorage.setItem('wallet_balance', currentBalance);
    localStorage.setItem('finance_history', JSON.stringify(financeHistory));
    updateChart();
}

// ==========================================
// 8. Đăng ký Sự kiện Khởi chạy
// ==========================================
window.addEventListener('DOMContentLoaded', () => {
    applyTheme(activeTheme);
    displayLogs();
    updateBalanceUI();

    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
            document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
            
            e.target.classList.add('active');
            document.getElementById(`tab-${e.target.dataset.tab}`).classList.add('active');
            
            if (e.target.dataset.tab === 'finance') {
                setTimeout(() => {
                    updateChart();
                    if (myChart && typeof myChart.resize === 'function') {
                        myChart.resize();
                        myChart.update('none');
                    }
                }, 60);
            }
        });
    });

    initBalanceBtn.addEventListener('click', () => {
        const val = parseFloat(initBalanceInput.value);
        if (isNaN(val)) return alert("Vui lòng nhập số tiền hợp lệ!");
        
        const now = new Date();
        const timeStr = now.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
        
        currentBalance = val;
        financeHistory = [{ time: timeStr, balance: currentBalance }];
        
        initBalanceInput.value = '';
        updateBalanceUI();
        displayLogs();
    });

    const themeSelect = document.getElementById('theme-select');
    if (themeSelect) {
        themeSelect.addEventListener('change', (e) => applyTheme(e.target.value));
    }

    const themeToggleBtn = document.getElementById('theme-toggle-btn');
    if (themeToggleBtn) {
        themeToggleBtn.addEventListener('click', () => {
            const keys = Object.keys(themes);
            let nextIdx = (keys.indexOf(activeTheme) + 1) % keys.length;
            applyTheme(keys[nextIdx]);
        });
    }

    recordBtn.addEventListener('click', () => {
        if (!isRecording) {
            isRecording = true;
            isCleared = false;
            baseText = previewText.value.trim();
            if (baseText.length > 0) baseText += ' ';
            try { recognition.start(); } catch (e) { console.error(e); }
        } else {
            stopRecording();
            statusDiv.innerText = "Đã dừng.";
        }
    });

    // Sự kiện nhập liệu trực tiếp bằng bàn phím
    previewText.addEventListener('input', () => {
        isCleared = false;
        baseText = previewText.value;
        if (baseText.length > 0 && !baseText.endsWith(' ')) baseText += ' ';
        toggleClearInputBtn();
    });

    // NÚT X: TRIỆT ĐỂ XÓA CHỮ VÀ RESET BỘ NHỚ ĐỆM (GIỮ MICRO CONTINUOUS)
    clearInputBtn.addEventListener('click', () => {
        isCleared = true; // Bật cờ chặn dữ liệu cũ tràn về
        previewText.value = '';
        baseText = '';

        if (isRecording && recognition) {
            // Dừng nhẹ phiên nhận diện cũ để xóa bộ đệm trình duyệt và tự khởi động lại
            try { recognition.stop(); } catch(e) {}
            statusDiv.innerText = "Đã làm sạch ô nhập! Micro đang tiếp tục lắng nghe...";
        } else {
            statusDiv.innerText = "Đã xóa toàn bộ nội dung ô nhập.";
        }

        toggleClearInputBtn();
        previewText.focus();

        // Mở lại cờ sau khi bộ đệm cũ đã xả hết
        setTimeout(() => { isCleared = false; }, 300);
    });

    saveBtn.addEventListener('click', () => {
        let text = previewText.value.trim();
        if (!text) return alert("Vui lòng nhập hoặc nói nội dung dữ liệu!");

        text = mergeCommandPrefixes(text);
        isMinting = true; 

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
        toggleClearInputBtn();
        statusDiv.innerText = "Khối dữ liệu đã được nạp thành công. Đang làm mới phiên...";
        
        if (isRecording && recognition) {
            recognition.stop(); 
        } else {
            isMinting = false;
        }
        
        displayLogs();
    });

    clearAllBtn.addEventListener('click', () => {
        if (confirm("⚠️ CẢNH BÁO: Bạn có chắc chắn muốn XÓA SẠCH toàn bộ dữ liệu bao gồm Lịch trình, Số dư và Lịch sử Tài chính?")) {
            localStorage.removeItem('daily_logs');
            localStorage.removeItem('wallet_balance');
            localStorage.removeItem('finance_history');

            currentBalance = 0;
            financeHistory = [];

            displayLogs();
            updateBalanceUI();
            
            statusDiv.innerText = "Đã dọn dẹp toàn bộ dữ liệu!";
        }
    });
});

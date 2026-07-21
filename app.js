// ==========================================
// 1. Đăng ký Service Worker
// ==========================================
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js').catch(() => {});
    });
}

// ==========================================
// 2. Quản lý Theme Giao diện (CSS Class Controller)
// ==========================================
const availableThemes = ['gold', 'cyber', 'blood', 'emerald'];
let activeTheme = localStorage.getItem('log_active_theme') || 'gold';
let myChart = null;
let sortOrder = localStorage.getItem('log_sort_order') || 'newest';

const applyTheme = (themeKey) => {
    // 1. Kiểm tra theme hợp lệ
    const targetTheme = availableThemes.includes(themeKey) ? themeKey : 'gold';
    
    // 2. Cập nhật Class trên body (Thao tác thuần CSS - Không xung đột JS)
    document.body.classList.remove(...availableThemes.map(t => `theme-${t}`));
    document.body.classList.add(`theme-${targetTheme}`);
    
    activeTheme = targetTheme;
    
    // 3. Cập nhật trạng thái Dropdown Select
    const select = document.getElementById('theme-select');
    if (select) select.value = targetTheme;
    
    // 4. Lưu lại lựa chọn
    localStorage.setItem('log_active_theme', targetTheme);
    
    // 5. Cập nhật lại màu đường kẻ Chart.js theo biến CSS hiện tại
    updateChart();
};

// ==========================================
// 3. Khai báo DOM Elements Safely & Biến Toàn cục
// ==========================================
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
const recordBtn = document.getElementById('record-btn');
const saveBtn = document.getElementById('save-btn');
const previewText = document.getElementById('preview-text');
const clearInputBtn = document.getElementById('clear-input-btn');
const statusDiv = document.getElementById('status');
const logsContainer = document.getElementById('logs-container');
const clearAllBtn = document.getElementById('clear-all-btn');
const sortToggleBtn = document.getElementById('sort-toggle-btn');

const balanceDisplay = document.getElementById('balance-display');
const toggleInitBoxBtn = document.getElementById('toggle-init-box-btn');
const initBalanceWrapper = document.getElementById('init-balance-wrapper');
const initBalanceInput = document.getElementById('init-balance-input');
const initBalanceBtn = document.getElementById('init-balance-btn');
const canvasEl = document.getElementById('financeChart');
const ctxCanvas = canvasEl ? canvasEl.getContext('2d') : null;

let recognition;
let isRecording = false;
let baseText = '';
let isMinting = false;
let isCleared = false;

let initialBalance = parseFloat(localStorage.getItem('wallet_initial_balance')) || 0;
let currentBalance = parseFloat(localStorage.getItem('wallet_balance')) || 0;
let financeHistory = JSON.parse(localStorage.getItem('finance_history')) || [];

// ==========================================
// 4. Các Hàm Trợ Giúp String & Parse
// ==========================================
function capitalizeFirstLetter(str) {
    if (!str) return '';
    const trimmed = str.trim();
    return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
}

function removeDuplicates(text) {
    if (!text) return '';
    const words = text.trim().replace(/\s+/g, ' ').split(' ');
    if (words.length < 2) return capitalizeFirstLetter(text.trim());

    const uniqueLower = [];
    const seen = new Set();
    
    for (const word of words) {
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

function mergeCommandPrefixes(text) {
    return text ? text.replace(/\b([abAB])\s+(\d+(?:[\.,]\d+)*)/g, '$1$2') : '';
}

function parseFinancialCommands(text) {
    const regex = /([abAB])(\d+(?:[\.,]\d+)*)/g;
    let match;
    let totalChange = 0;
    const detectedCmds = [];

    while ((match = regex.exec(text)) !== null) {
        const type = match[1].toLowerCase();
        const value = parseInt(match[2].replace(/[\.,]/g, ''), 10);

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

function extractTaskBaseName(text) {
    if (!text) return 'Nhiệm vụ không tên';
    const cleaned = text.replace(/([abAB])(\d+(?:[\.,]\d+)*)/g, '').trim();
    return capitalizeFirstLetter(cleaned) || text.trim();
}

function toggleClearInputBtn() {
    if (clearInputBtn && previewText) {
        clearInputBtn.style.display = previewText.value.trim().length > 0 ? 'flex' : 'none';
    }
}

// ==========================================
// 5. Đồng bộ Tài chính từ Khối Logs
// ==========================================
function recalculateFinanceFromLogs() {
    const logs = JSON.parse(localStorage.getItem('daily_logs')) || [];
    const chronologicalLogs = [...logs].reverse();

    let runningBalance = initialBalance;
    // Sửa lại dòng currentTimeStr trong recalculateFinanceFromLogs():
const now = new Date();
const currentTimeStr = now.toLocaleTimeString('vi-VN', { 
    hour: '2-digit', 
    minute: '2-digit', 
    second: '2-digit' // <-- Thêm dòng này
});

    
    const newHistory = [{
        time: currentTimeStr,
        balance: initialBalance
    }];

    chronologicalLogs.forEach(log => {
        const { totalChange } = parseFinancialCommands(log.content);
        if (totalChange !== 0) {
            runningBalance += totalChange;
            const timeOnly = log.time.split(' - ')[0] || log.time;
            newHistory.push({
                time: timeOnly,
                balance: runningBalance
            });
        }
    });

    currentBalance = runningBalance;
    financeHistory = newHistory;
    updateBalanceUI();
}

// ==========================================
// 6. Cấu hình Speech Engine
// ==========================================
if (!SpeechRecognition) {
    if (statusDiv) statusDiv.innerText = "Trình duyệt không hỗ trợ nhận diện giọng nói. Hãy dùng Chrome/Edge.";
    if (recordBtn) recordBtn.disabled = true;
} else {
    recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'vi-VN';

    recognition.onstart = () => {
        if (statusDiv) statusDiv.innerText = "Đang lắng nghe dữ liệu sóng âm...";
        if (recordBtn) {
            recordBtn.innerHTML = "🛑 Đang ghi âm... Nhấn để dừng";
            recordBtn.classList.add('recording');
        }
        isMinting = false; 
    };

    recognition.onresult = (event) => {
        if (isMinting || isCleared) return; 

        let currentSessionText = '';
        for (let i = event.resultIndex; i < event.results.length; ++i) {
            if (event.results[i].isFinal) {
                currentSessionText += event.results[i][0].transcript + ' ';
            }
        }
        const fullTextOnline = (baseText + ' ' + currentSessionText.trim()).trim();
        const mergedText = mergeCommandPrefixes(fullTextOnline);
        const cleanedText = removeDuplicates(mergedText);
        
        if (previewText) {
            previewText.value = capitalizeFirstLetter(cleanedText);
            toggleClearInputBtn();
        }
    };

    recognition.onerror = (event) => {
        if (statusDiv) statusDiv.innerText = "Lỗi Micro hoặc HTTPS: " + event.error;
        stopRecording();
    };

    recognition.onend = () => {
        if (isRecording) {
            if (!isMinting && !isCleared && previewText) {
                baseText = previewText.value.trim();
                if (baseText.length > 0) baseText += ' ';
            }
            setTimeout(() => { 
                try { if (isRecording) recognition.start(); } catch (e) {} 
            }, 100);
        }
    };
}

function stopRecording() {
    isRecording = false;
    isMinting = false;
    if (recognition) recognition.stop();
    if (recordBtn) {
        recordBtn.innerHTML = "🎙️ Nhấn để ghi âm";
        recordBtn.classList.remove('recording');
    }
}

// ==========================================
// 7. Chart.js & UI Tài chính
// ==========================================
function updateChart() {
    if (!window.Chart || !ctxCanvas) return;

    // Đọc màu động được tính toán từ CSS của Body hiện tại
    const computedStyle = getComputedStyle(document.body);
    const primaryColor = computedStyle.getPropertyValue('--royal-gold-light').trim() || '#fef08a';
    const accentColor = computedStyle.getPropertyValue('--royal-gold').trim() || '#d4af37';

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
                plugins: { legend: { display: false } },
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

function updateBalanceUI() {
    if (balanceDisplay) balanceDisplay.innerText = currentBalance.toLocaleString('en-US');
    localStorage.setItem('wallet_balance', currentBalance);
    localStorage.setItem('finance_history', JSON.stringify(financeHistory));
    updateChart();
}

function updateSortUI() {
    const iconSpan = document.getElementById('sort-icon');
    const labelSpan = document.getElementById('sort-label');
    
    if (iconSpan && labelSpan) {
        iconSpan.innerText = sortOrder === 'newest' ? '⬆️' : '⬇️';
        labelSpan.innerText = sortOrder === 'newest' ? 'Mới nhất' : 'Cũ nhất';
    }
}

// ==========================================
// 8. RENDER LOGS UI
// ==========================================
function displayLogs() {
    if (!logsContainer) return;
    logsContainer.innerHTML = '';
    const rawLogs = JSON.parse(localStorage.getItem('daily_logs')) || [];

    if (rawLogs.length === 0) {
        logsContainer.innerHTML = '<div style="text-align:center; color:var(--text-muted); font-size:13px; padding:20px 0;">Chưa có khối dữ liệu nào.</div>';
        if (clearAllBtn) clearAllBtn.style.display = 'none';
        return;
    }

    const totalLogs = rawLogs.length;
    const logGlobalIndexMap = new Map();
    rawLogs.forEach((log, index) => logGlobalIndexMap.set(log.id, totalLogs - index));

    const groupedMap = new Map();

    rawLogs.forEach(log => {
        const taskName = extractTaskBaseName(log.content);
        const { totalChange } = parseFinancialCommands(log.content);

        if (!groupedMap.has(taskName)) {
            groupedMap.set(taskName, {
                taskName: taskName,
                totalMoney: 0,
                latestId: log.id,
                entries: []
            });
        }

        const group = groupedMap.get(taskName);
        group.totalMoney += totalChange;
        if (log.id > group.latestId) group.latestId = log.id;

        group.entries.push({
            id: log.id,
            time: log.time,
            change: totalChange,
            globalNum: logGlobalIndexMap.get(log.id)
        });
    });

    const groupsArray = Array.from(groupedMap.values());
    groupsArray.sort((a, b) => b.latestId - a.latestId);

    if (sortOrder === 'oldest') groupsArray.reverse();

    groupsArray.forEach((group) => {
        group.entries.sort((a, b) => b.id - a.id);
        if (sortOrder === 'oldest') group.entries.reverse();

        const blockDisplayNum = `#${group.entries[0].globalNum}`;

        let moneyClass = 'zero';
        let moneySign = '';
        if (group.totalMoney > 0) { moneyClass = 'plus'; moneySign = '+'; }
        else if (group.totalMoney < 0) { moneyClass = 'minus'; }
        
        const formattedMoney = `${moneySign}${group.totalMoney.toLocaleString('en-US')}$`;

        let timestampsHTML = '';
        group.entries.forEach((entry) => {
            let entryBadge = '';
            if (entry.change > 0) entryBadge = `<span class="tx-badge tx-plus">+${entry.change.toLocaleString('en-US')}$</span>`;
            else if (entry.change < 0) entryBadge = `<span class="tx-badge tx-minus">${entry.change.toLocaleString('en-US')}$</span>`;

            timestampsHTML += `
                <div class="timestamp-item">
                    <div class="dd-left-col">
                        <div class="dd-row-1-num">#${entry.globalNum}</div>
                        <div class="dd-row-2-time">🕒 ${entry.time}</div>
                    </div>
                    <div>${entryBadge}</div>
                </div>
            `;
        });

        const item = document.createElement('div');
        item.className = 'log-item';
        item.innerHTML = `
            <div class="log-row-1">
                <span class="log-block-num">${blockDisplayNum}</span>
                <div class="log-actions-right">
                    <button class="btn-action-icon btn-dropdown" title="Mở danh sách giờ & ngày">▼</button>
                    <button class="btn-action-icon btn-edit" title="Đổi tên nhiệm vụ">✏️</button>
                    <button class="btn-action-icon btn-delete" title="Xóa nhóm nhiệm vụ">🗑️</button>
                </div>
            </div>
            <div class="log-row-2">
                <span class="log-task-name">${group.taskName}</span>
                <span class="log-total-money ${moneyClass}">${formattedMoney}</span>
            </div>
            <div class="log-dropdown-content">${timestampsHTML}</div>
        `;

        const btnDropdown = item.querySelector('.btn-dropdown');
        const dropdownContent = item.querySelector('.log-dropdown-content');

        btnDropdown.addEventListener('click', () => {
            const isExpanded = dropdownContent.style.display === 'block';
            dropdownContent.style.display = isExpanded ? 'none' : 'block';
            btnDropdown.classList.toggle('active', !isExpanded);
        });

        item.querySelector('.btn-edit').addEventListener('click', () => {
            const newName = prompt("Nhập tên mới cho nhiệm vụ:", group.taskName);
            if (newName && newName.trim() !== '') {
                const currentLogs = JSON.parse(localStorage.getItem('daily_logs')) || [];
                const cleanNewName = newName.trim();

                currentLogs.forEach(log => {
                    if (extractTaskBaseName(log.content) === group.taskName) {
                        const financialMatches = log.content.match(/([abAB])(\d+(?:[\.,]\d+)*)/g);
                        const finStr = financialMatches ? financialMatches.join(' ') : '';
                        log.content = `${cleanNewName} ${finStr}`.trim();
                    }
                });

                localStorage.setItem('daily_logs', JSON.stringify(currentLogs));
                recalculateFinanceFromLogs();
                displayLogs();
            }
        });

        item.querySelector('.btn-delete').addEventListener('click', () => {
            if (confirm(`Xóa toàn bộ khối [${group.taskName}]?`)) {
                let currentLogs = JSON.parse(localStorage.getItem('daily_logs')) || [];
                const targetIds = group.entries.map(e => e.id);
                currentLogs = currentLogs.filter(log => !targetIds.includes(log.id));
                
                localStorage.setItem('daily_logs', JSON.stringify(currentLogs));
                recalculateFinanceFromLogs();
                displayLogs();
            }
        });

        logsContainer.appendChild(item);
    });

    if (clearAllBtn) clearAllBtn.style.display = 'block';
}

// ==========================================
// 9. Khởi tạo App & Event Listeners
// ==========================================
window.addEventListener('DOMContentLoaded', () => {
    applyTheme(activeTheme);
    updateSortUI();
    displayLogs();
    updateBalanceUI();

    // --- XỬ LÝ CHUYỂN TAB ---
    const switchTab = (targetTabName) => {
        if (!targetTabName) return;
        const tabBtns = document.querySelectorAll('.tab-btn');
        const tabContents = document.querySelectorAll('.tab-content');

        tabBtns.forEach(b => b.classList.remove('active'));
        tabContents.forEach(c => c.classList.remove('active'));

        const targetBtn = document.querySelector(`.tab-btn[data-tab="${targetTabName}"]`);
        const targetContent = document.getElementById(`tab-${targetTabName}`);

        if (targetBtn && targetContent) {
            targetBtn.classList.add('active');
            targetContent.classList.add('active');

            if (targetTabName === 'finance') {
                requestAnimationFrame(() => {
                    if (myChart) {
                        myChart.resize();
                        myChart.update('none');
                    }
                });
            }
        }
    };

    // Kiểm tra URL Parameter từ Shortcut (?tab=finance / ?tab=timeline)
    const urlParams = new URLSearchParams(window.location.search);
    const targetTabParam = urlParams.get('tab');
    if (targetTabParam === 'finance' || targetTabParam === 'timeline') {
        switchTab(targetTabParam);
    }

    // Sự kiện bấm Tab thủ công
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', (e) => switchTab(e.currentTarget.dataset.tab));
    });

    // Toggle Sắp xếp
    if (sortToggleBtn) {
        sortToggleBtn.addEventListener('click', () => {
            sortOrder = sortOrder === 'newest' ? 'oldest' : 'newest';
            localStorage.setItem('log_sort_order', sortOrder);
            updateSortUI();
            displayLogs();
        });
    }

    // Resize Observer cho Chart
    const chartBox = document.getElementById('chart-box');
    if (chartBox && window.ResizeObserver) {
        const ro = new ResizeObserver(() => { if (myChart) myChart.resize(); });
        ro.observe(chartBox);
    }

    // Toggle Khung nhập số dư ban đầu
    if (toggleInitBoxBtn && initBalanceWrapper) {
        toggleInitBoxBtn.addEventListener('click', () => {
            initBalanceWrapper.classList.toggle('active');
        });
    }

    // Lưu Số dư khởi tạo
    if (initBalanceBtn) {
        initBalanceBtn.addEventListener('click', () => {
            const val = parseFloat(initBalanceInput.value);
            if (isNaN(val)) return alert("Vui lòng nhập số tiền hợp lệ!");
            
            initialBalance = val;
            currentBalance = val;
            localStorage.setItem('wallet_initial_balance', initialBalance);
            localStorage.setItem('wallet_balance', currentBalance);

            localStorage.removeItem('daily_logs');

const now = new Date();
const currentTimeStr = now.toLocaleTimeString('vi-VN', { 
    hour: '2-digit', 
    minute: '2-digit', 
    second: '2-digit'
});

            financeHistory = [{ time: currentTimeStr, balance: val }];

            if (initBalanceInput) initBalanceInput.value = '';
            if (initBalanceWrapper) initBalanceWrapper.classList.remove('active');
            
            displayLogs();
            updateBalanceUI();
            if (statusDiv) statusDiv.innerText = "Đã cấu hình số dư ban đầu và làm sạch toàn bộ nhật ký.";
        });
    }

    // Theme Switchers
    const themeSelect = document.getElementById('theme-select');
    if (themeSelect) {
        themeSelect.addEventListener('change', (e) => applyTheme(e.target.value));
    }

    const themeToggleBtn = document.getElementById('theme-toggle-btn');
    if (themeToggleBtn) {
        themeToggleBtn.addEventListener('click', () => {
            const nextIdx = (availableThemes.indexOf(activeTheme) + 1) % availableThemes.length;
            applyTheme(availableThemes[nextIdx]);
        });
    }

    // Record Button
    if (recordBtn) {
        recordBtn.addEventListener('click', () => {
            if (!isRecording) {
                isRecording = true;
                isCleared = false;
                baseText = previewText ? previewText.value.trim() : '';
                if (baseText.length > 0) baseText += ' ';
                try { recognition.start(); } catch (e) {}
            } else {
                stopRecording();
                if (statusDiv) statusDiv.innerText = "Đã dừng.";
            }
        });
    }

    // Text Preview Input
    if (previewText) {
        previewText.addEventListener('input', () => {
            isCleared = false;
            baseText = previewText.value;
            if (baseText.length > 0 && !baseText.endsWith(' ')) baseText += ' ';
            toggleClearInputBtn();
        });
    }

    // Clear Input Button
    if (clearInputBtn) {
        clearInputBtn.addEventListener('click', () => {
            isCleared = true;
            if (previewText) previewText.value = '';
            baseText = '';

            if (isRecording && recognition) {
                try { recognition.stop(); } catch(e) {}
                if (statusDiv) statusDiv.innerText = "Đang lắng nghe dữ liệu sóng âm...";
            } else {
                if (statusDiv) statusDiv.innerText = "Đã xóa toàn bộ nội dung ô nhập.";
            }

            toggleClearInputBtn();
            if (previewText) previewText.focus();
            setTimeout(() => { isCleared = false; }, 300);
        });
    }

    // Save Button
    if (saveBtn) {
        saveBtn.addEventListener('click', () => {
            let text = previewText ? previewText.value.trim() : '';
            if (!text) return alert("Vui lòng nhập hoặc nói nội dung dữ liệu!");

            text = mergeCommandPrefixes(text);
            isMinting = true; 

            const { detectedCmds } = parseFinancialCommands(text);
            
            const now = new Date();
            const timeString = now.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
            const fullDateString = timeString + ' - ' + now.toLocaleDateString('vi-VN');

            const logEntry = { 
                id: Date.now(), 
                time: fullDateString, 
                content: text,
                financeInfo: detectedCmds 
            };
            
            const logs = JSON.parse(localStorage.getItem('daily_logs')) || [];
            logs.unshift(logEntry);
            localStorage.setItem('daily_logs', JSON.stringify(logs));

            if (previewText) previewText.value = '';
            baseText = ''; 
            toggleClearInputBtn();
            if (statusDiv) statusDiv.innerText = "Khối dữ liệu đã được nạp thành công.";
            
            if (isRecording && recognition) {
                recognition.stop(); 
            } else {
                isMinting = false;
            }
            
            recalculateFinanceFromLogs();
            displayLogs();
        });
    }

    // Clear All Button
    if (clearAllBtn) {
        clearAllBtn.addEventListener('click', () => {
            if (confirm("⚠️ CẢNH BÁO: Bạn có chắc chắn muốn XÓA SẠCH toàn bộ dữ liệu?")) {
                localStorage.removeItem('daily_logs');
                localStorage.removeItem('wallet_balance');
                localStorage.removeItem('wallet_initial_balance');
                localStorage.removeItem('finance_history');

                initialBalance = 0;
                currentBalance = 0;
                financeHistory = [];

                displayLogs();
                updateBalanceUI();
                if (statusDiv) statusDiv.innerText = "Đã dọn dẹp toàn bộ dữ liệu!";
            }
        });
    }
});

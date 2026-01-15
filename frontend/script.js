const agentGrid = document.getElementById('agentGrid');
const missionControl = document.getElementById('missionControl');
const missionTitle = document.getElementById('missionTitle');

function setPreset(url, intent) {
    const urlInput = document.getElementById('targetUrl');
    const intentInput = document.getElementById('userIntent');

    urlInput.value = url;
    intentInput.value = intent;

    // Flash effect
    intentInput.style.borderColor = '#06b6d4';
    setTimeout(() => {
        intentInput.style.borderColor = '';
    }, 300);
}


async function sendRequest() {
    const targetUrl = document.getElementById('targetUrl').value;
    const userIntent = document.getElementById('userIntent').value;
    const btn = document.getElementById('sendBtn');
    const resultArea = document.getElementById('result');

    if (!userIntent) {
        alert("Please provide an Intent.");
        return;
    }

    // Loading State
    btn.disabled = true;
    btn.innerHTML = '<div class="spinner"></div> Processing Signal...';

    // UI Reset
    document.getElementById('consolePlaceholder').style.display = 'none';
    resultArea.style.display = 'block';
    resultArea.innerHTML = ''; // Start clean

    // Session Management
    let sessionId = localStorage.getItem('proxy_session_id');
    if (!sessionId) {
        sessionId = crypto.randomUUID();
        localStorage.setItem('proxy_session_id', sessionId);
    }
    console.log("Session ID:", sessionId);

    try {
        const response = await fetch('http://localhost:3000/proxy/execute', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ targetUrl, userIntent, sessionId })
        });

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });

            let boundary = buffer.indexOf('\n');
            while (boundary !== -1) {
                const line = buffer.substring(0, boundary).trim();
                buffer = buffer.substring(boundary + 1);

                if (line) {
                    try {
                        const event = JSON.parse(line);
                        handleStreamEvent(event, resultArea);
                    } catch (e) {
                        console.warn("Standard Parse Failed:", e);
                        // Fallback: Check for merged JSONs like }{
                        const fixedLine = line.replace(/}{/g, '}\n{');
                        const parts = fixedLine.split('\n');
                        for (const part of parts) {
                            try {
                                handleStreamEvent(JSON.parse(part), resultArea);
                            } catch (e2) {
                                console.error("Fatal Parse Error. Line:", part);
                                resultArea.innerHTML += `<div class="parse-error">Parse Error: ${e2.message} <br> Raw: ${part}</div>`;
                            }
                        }
                    }
                }
                boundary = buffer.indexOf('\n');
            }
        }

    } catch (error) {
        resultArea.innerHTML += `
                <div class="result-card result-card-error">
                    <div class="result-header result-header-error">Connection Error</div>
                    <div class="result-content">${error.message}</div>
                </div>
            `;
    } finally {
        btn.disabled = false;
        btn.innerHTML = 'Execute Protocol';
    }
}

function handleStreamEvent(event, globalContainer) {
    // Global events that don't fit into cards (like generic errors or done messages)
    if (event.type === 'error' && !event.agentName) {
        globalContainer.innerHTML += `
                <div class="result-card result-card-error">
                    <div class="result-header result-header-error">System Error</div>
                    <div class="result-content">${event.message}</div>
                </div>`;
        return;
    }

    if (event.type === 'done') {
        globalContainer.innerHTML += `<div class="mission-complete">✨ Mission Accomplished</div>`;
        return;
    }

    // --- MISSION START: Initialize Grid ---
    if (event.type === 'mission_start') {
        missionControl.style.display = 'block';
        missionTitle.textContent = event.missionName || "Mission Active";
        agentGrid.innerHTML = ''; // Interaction Reset

        event.tasks.forEach(task => {
            const card = document.createElement('div');
            card.id = `card-${task.agentName.replace(/\s+/g, '-')}`;
            card.className = 'agent-card';
            card.innerHTML = `
                    <div class="agent-header">
                        <span class="agent-name">${task.agentName}</span>
                        <span class="agent-status-icon" id="status-${task.agentName.replace(/\s+/g, '-')}">IDLE</span>
                    </div>
                    <div class="task-desc">
                        ${task.subIntent}
                    </div>
                    <div class="verification-box">
                        <strong>Verification Target</strong>
                        ${task.verification || "No specific criteria sent."}
                    </div>
                `;
            agentGrid.appendChild(card);
        });
        return;
    }

    // --- AGENT UPDATE: Status/Result ---
    if (event.agentName) {
        const safeName = event.agentName.replace(/\s+/g, '-');
        const card = document.getElementById(`card-${safeName}`);
        const statusBadge = document.getElementById(`status-${safeName}`);

        if (!card) return; // Should not happen if mission_start ran correctly

        if (event.type === 'status') {
            card.classList.add('active');
            // Spinner on Shadow/Right side or just cleaner
            statusBadge.innerHTML = `RUNNING <div class="spinner spinner-mini"></div>`;
            statusBadge.classList.add('running');
        }

        else if (event.type === 'result') {
            card.classList.remove('active');
            card.classList.add('success');
            statusBadge.textContent = 'DONE';
            statusBadge.classList.remove('running');
            statusBadge.classList.add('success');

            // Append Result Summary to card
            const summaryHtml = marked.parse(event.summary);
            const resultDiv = document.createElement('div');
            resultDiv.className = 'result-reasoning-divider';
            resultDiv.innerHTML = `
                    <div class="result-summary-text">${summaryHtml}</div>
                    <div class="result-reasoning-text">Reasoning: ${event.reasoning.split('\n')[0]}...</div>
                `;
            card.querySelector('.task-desc').appendChild(resultDiv);

            // ALSO Render in Detailed Stream (Legacy View)
            const resultArea = document.getElementById('result');
            resultArea.style.display = 'block'; // Ensure visible

            const detailedHtml = `
                <div class="result-card detailed-log-card">
                    <div class="result-header icon-summary detailed-log-header">
                        <span>
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="detailed-log-header-icon"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
                            ${event.agentName} Detailed Log
                        </span>
                    </div>
                    <div class="result-content">
                         <div class="detailed-log-content">
                            ${summaryHtml}
                        </div>
                         <div class="detailed-reasoning-box">
                            <strong class="detailed-reasoning-label">Reasoning:</strong>
                            ${event.reasoning ? marked.parse(event.reasoning) : 'None'}
                        </div>
                    </div>
                </div>`;
            const div = document.createElement('div');
            div.innerHTML = detailedHtml;
            resultArea.appendChild(div);
        }

        else if (event.type === 'error') {
            card.classList.remove('active');
            card.classList.add('error');
            statusBadge.textContent = 'FAILED';
            statusBadge.classList.remove('running');
            statusBadge.classList.add('failed');

            const errDiv = document.createElement('div');
            errDiv.style.color = '#ef4444';
            errDiv.style.fontSize = '0.9rem';
            errDiv.style.marginTop = '1rem';
            errDiv.textContent = event.message;
            card.appendChild(errDiv);
        }
    }
}


// Mission Control: Status Polling
async function updateStatus() {
    try {
        const res = await fetch('http://localhost:3000/api/v1/registry/status');
        const data = await res.json();

        const grid = document.getElementById('statusGrid');
        if (!grid) return;

        grid.innerHTML = '';
        if (data.length === 0) {
            grid.innerHTML = '<div style="color:#666;">No agents registered yet. Execute a task to discover.</div>';
            return;
        }

        data.forEach(item => {
            const el = document.createElement('div');
            el.className = 'status-item';
            el.innerHTML = `
                <div class="status-light status-${item.status}"></div>
                <div class="status-item-details">
                    <span class="status-item-url" style="font-size:0.9rem;">${item.name}</span>
                    <span class="status-item-meta" style="font-size:0.7em; opacity:0.7;">${item.url}</span>
                    <span class="status-item-meta">
                        ${item.status} ${item.failures > 0 ? `• Failures: ${item.failures}` : ''}
                    </span>
                </div>
            `;
            // Add click interaction to quick-fill URL
            el.style.cursor = 'pointer';
            el.title = item.description;
            el.onclick = () => {
                document.getElementById('targetUrl').value = item.url;
                // Visual feedback
                el.style.opacity = '0.5';
                setTimeout(() => el.style.opacity = '1', 200);
            };
            grid.appendChild(el);
        });
    } catch (e) {
        console.warn("Status poll failed", e);
    }
}

// Poll every 2 seconds
setInterval(updateStatus, 1000);
updateStatus();

document.getElementById('sendBtn').addEventListener('click', sendRequest);
// Auto-focus logic
window.addEventListener('load', () => {
    const intentInput = document.getElementById('userIntent');
    if (intentInput) intentInput.focus();
});

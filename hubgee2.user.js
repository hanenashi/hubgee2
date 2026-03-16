// ==UserScript==
// @name         Hubgee2 - Tactical Code Bridge
// @namespace    https://github.com/hanenashi
// @version      0.1
// @description  Send code blocks from Gemini directly into the GitHub web editor. Clipboard-free mobile workflow.
// @author       hanenashi
// @match        https://gemini.google.com/*
// @match        https://github.com/*/edit/*
// @icon         https://github.githubassets.com/favicons/favicon.svg
// @grant        GM_setValue
// @grant        GM_getValue
// @run-at       document-idle
// @updateURL    https://raw.githubusercontent.com/hanenashi/hubgee2/main/hubgee2.user.js
// @downloadURL  https://raw.githubusercontent.com/hanenashi/hubgee2/main/hubgee2.user.js
// @homepageURL  https://github.com/hanenashi/hubgee2
// @supportURL   https://github.com/hanenashi/hubgee2/issues
// ==/UserScript==

(function () {
    'use strict';

    const isGemini = window.location.hostname === 'gemini.google.com';
    const isGitHub = window.location.hostname === 'github.com';

    const KEYS = {
        payload: 'hubgee_payload',
        btnPos: 'hubgee_btn_pos',
        debugEnabled: 'hubgee_debug_enabled',
        debugPos: 'hubgee_debug_pos',
        debugLogs: 'hubgee_debug_logs'
    };

    function gmGet(key, fallback) {
        try {
            const v = GM_getValue(key, fallback);
            return v;
        } catch (err) {
            console.log('[Hubgee] GM_getValue fail', key, err);
            return fallback;
        }
    }

    function gmSet(key, value) {
        try {
            GM_setValue(key, value);
            return true;
        } catch (err) {
            console.log('[Hubgee] GM_setValue fail', key, err);
            return false;
        }
    }

    function showToast(message, bgColor = '#222') {
        const toast = document.createElement('div');
        toast.textContent = message;
        toast.style.cssText = `
            position: fixed;
            bottom: 90px;
            left: 50%;
            transform: translateX(-50%);
            background: ${bgColor};
            color: white;
            padding: 10px 14px;
            border-radius: 8px;
            font-family: monospace;
            font-size: 13px;
            font-weight: bold;
            box-shadow: 0 4px 12px rgba(0,0,0,0.35);
            z-index: 2147483647;
            pointer-events: none;
            white-space: pre-wrap;
            max-width: 90vw;
        `;
        document.body.appendChild(toast);
        setTimeout(() => toast.style.opacity = '0', 1800);
        setTimeout(() => toast.remove(), 2200);
    }

    function nowStamp() {
        const d = new Date();
        return d.toLocaleTimeString();
    }

    function loadLogs() {
        return gmGet(KEYS.debugLogs, []);
    }

    function saveLogs(logs) {
        gmSet(KEYS.debugLogs, logs.slice(-300));
    }

    function logDebug(msg, obj) {
        let line = `[${nowStamp()}] ${msg}`;
        if (obj !== undefined) {
            try {
                line += ' :: ' + JSON.stringify(obj);
            } catch (e) {
                line += ' :: [unserializable]';
            }
        }

        const logs = loadLogs();
        logs.push(line);
        saveLogs(logs);

        const body = document.getElementById('hubgee-debug-body');
        if (body) {
            appendDebugLine(body, line);
        }

        console.log('[Hubgee]', line);
    }

    function appendDebugLine(body, line) {
        const div = document.createElement('div');
        div.textContent = line;
        div.style.cssText = `
            border-bottom: 1px solid #333;
            padding: 4px 0;
            word-break: break-word;
        `;
        body.appendChild(div);
        body.scrollTop = body.scrollHeight;
    }

    function clearLogs() {
        saveLogs([]);
        const body = document.getElementById('hubgee-debug-body');
        if (body) body.innerHTML = '';
        logDebug('Logs cleared');
    }

    function makeDraggable(el, handle, saveKey) {
        let isDragging = false;
        let startX = 0;
        let startY = 0;
        let offsetX = 0;
        let offsetY = 0;

        function clamp(x, y) {
            const rect = el.getBoundingClientRect();
            const maxX = Math.max(0, window.innerWidth - rect.width);
            const maxY = Math.max(0, window.innerHeight - rect.height);
            return {
                x: Math.max(0, Math.min(x, maxX)),
                y: Math.max(0, Math.min(y, maxY))
            };
        }

        function start(clientX, clientY) {
            const rect = el.getBoundingClientRect();
            isDragging = true;
            offsetX = clientX - rect.left;
            offsetY = clientY - rect.top;
            el.style.transition = 'none';
        }

        function move(clientX, clientY) {
            if (!isDragging) return;
            const pos = clamp(clientX - offsetX, clientY - offsetY);
            el.style.left = pos.x + 'px';
            el.style.top = pos.y + 'px';
            el.style.right = 'auto';
            el.style.bottom = 'auto';
        }

        function end() {
            if (!isDragging) return;
            isDragging = false;
            const rect = el.getBoundingClientRect();
            gmSet(saveKey, { x: rect.left, y: rect.top });
        }

        handle.addEventListener('mousedown', e => {
            e.preventDefault();
            start(e.clientX, e.clientY);
        });

        document.addEventListener('mousemove', e => move(e.clientX, e.clientY));
        document.addEventListener('mouseup', end);

        handle.addEventListener('touchstart', e => {
            const t = e.touches[0];
            start(t.clientX, t.clientY);
        }, { passive: true });

        document.addEventListener('touchmove', e => {
            if (!isDragging) return;
            const t = e.touches[0];
            move(t.clientX, t.clientY);
        }, { passive: true });

        document.addEventListener('touchend', end);

        const saved = gmGet(saveKey, null);
        if (saved && typeof saved.x === 'number' && typeof saved.y === 'number') {
            el.style.left = saved.x + 'px';
            el.style.top = saved.y + 'px';
            el.style.right = 'auto';
            el.style.bottom = 'auto';
        }
    }

    function ensureDebugUI() {
        if (document.getElementById('hubgee-debug-toggle')) return;

        const toggle = document.createElement('button');
        toggle.id = 'hubgee-debug-toggle';
        toggle.textContent = '🐞 DEBUG';
        toggle.style.cssText = `
            position: fixed;
            top: 16px;
            right: 16px;
            z-index: 2147483647;
            background: #111;
            color: #0f0;
            border: 1px solid #0f0;
            border-radius: 8px;
            padding: 10px 12px;
            font-size: 12px;
            font-weight: bold;
            font-family: monospace;
        `;
        document.body.appendChild(toggle);

        const panel = document.createElement('div');
        panel.id = 'hubgee-debug-panel';
        panel.style.cssText = `
            position: fixed;
            left: 16px;
            top: 60px;
            width: min(92vw, 430px);
            height: min(55vh, 420px);
            background: rgba(10,10,10,0.95);
            color: #d6ffd6;
            border: 1px solid #3a3;
            border-radius: 10px;
            z-index: 2147483647;
            font-family: monospace;
            display: none;
            overflow: hidden;
            box-shadow: 0 10px 28px rgba(0,0,0,0.5);
        `;

        panel.innerHTML = `
            <div id="hubgee-debug-header" style="padding:10px;background:#161616;border-bottom:1px solid #2d2d2d;display:flex;gap:8px;align-items:center;justify-content:space-between;cursor:move;">
                <div style="font-weight:bold;color:#9f9;">Hubgee Debug</div>
                <div style="display:flex;gap:6px;">
                    <button id="hubgee-debug-copy" style="background:#222;color:#fff;border:1px solid #666;border-radius:6px;padding:4px 8px;">Copy</button>
                    <button id="hubgee-debug-clear" style="background:#222;color:#fff;border:1px solid #666;border-radius:6px;padding:4px 8px;">Clear</button>
                    <button id="hubgee-debug-close" style="background:#300;color:#fff;border:1px solid #844;border-radius:6px;padding:4px 8px;">X</button>
                </div>
            </div>
            <div id="hubgee-debug-body" style="padding:10px;height:calc(100% - 48px);overflow:auto;font-size:12px;line-height:1.35;"></div>
        `;
        document.body.appendChild(panel);

        const enabled = !!gmGet(KEYS.debugEnabled, false);
        panel.style.display = enabled ? 'block' : 'none';

        toggle.onclick = () => {
            const open = panel.style.display !== 'none';
            panel.style.display = open ? 'none' : 'block';
            gmSet(KEYS.debugEnabled, !open);
            logDebug(`Debug panel ${open ? 'hidden' : 'shown'}`);
        };

        panel.querySelector('#hubgee-debug-close').onclick = () => {
            panel.style.display = 'none';
            gmSet(KEYS.debugEnabled, false);
            logDebug('Debug panel hidden');
        };

        panel.querySelector('#hubgee-debug-clear').onclick = () => clearLogs();

        panel.querySelector('#hubgee-debug-copy').onclick = async () => {
            const logs = loadLogs().join('\n');
            try {
                await navigator.clipboard.writeText(logs);
                showToast('Debug log copied', '#166534');
            } catch (err) {
                showToast('Copy failed', '#b91c1c');
                logDebug('Clipboard copy failed', { error: String(err) });
            }
        };

        const body = panel.querySelector('#hubgee-debug-body');
        loadLogs().forEach(line => appendDebugLine(body, line));

        makeDraggable(panel, panel.querySelector('#hubgee-debug-header'), KEYS.debugPos);
    }

    function safeStringPreview(text, max = 80) {
        if (typeof text !== 'string') return '[non-string]';
        return text.slice(0, max).replace(/\n/g, '\\n');
    }

    function locateGitHubEditor() {
        const candidates = [
            'textarea.file-editor-textarea',
            'textarea[spellcheck="false"]',
            'textarea',
            '[data-testid="codemirror-editor"] textarea',
            '.cm-content',
            '.cm-editor textarea'
        ];

        const results = [];
        for (const sel of candidates) {
            const el = document.querySelector(sel);
            if (el) {
                results.push({
                    selector: sel,
                    tag: el.tagName,
                    className: el.className || '',
                    isTextarea: el.tagName === 'TEXTAREA'
                });
                return { el, selector: sel, results };
            }
            results.push({ selector: sel, found: false });
        }

        return { el: null, selector: null, results };
    }

    function injectIntoGitHubEditor(newText) {
        logDebug('Inject requested', { len: newText.length, preview: safeStringPreview(newText) });

        const found = locateGitHubEditor();
        logDebug('Editor lookup', found.results);

        let target = found.el;

        if (!target && document.activeElement) {
            target = document.activeElement;
            logDebug('Falling back to activeElement', {
                tag: target.tagName,
                className: target.className || ''
            });
        }

        if (!target) {
            showToast('No editor found', '#b91c1c');
            logDebug('FAIL: no editor target');
            return false;
        }

        try {
            target.focus();
            logDebug('Focus attempted', { tag: target.tagName });
        } catch (err) {
            logDebug('Focus failed', { error: String(err) });
        }

        if (target.tagName === 'TEXTAREA') {
            try {
                const nativeSetter = Object.getOwnPropertyDescriptor(
                    HTMLTextAreaElement.prototype,
                    'value'
                )?.set;

                if (nativeSetter) {
                    nativeSetter.call(target, newText);
                    logDebug('Native textarea setter used');
                } else {
                    target.value = newText;
                    logDebug('Direct textarea.value used');
                }

                target.dispatchEvent(new InputEvent('input', {
                    bubbles: true,
                    data: newText,
                    inputType: 'insertText'
                }));
                target.dispatchEvent(new Event('change', { bubbles: true }));
                target.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: ' ' }));
                target.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, key: ' ' }));

                logDebug('Textarea post-inject length', {
                    valueLength: target.value.length
                });

                return true;
            } catch (err) {
                logDebug('Textarea inject failed', { error: String(err) });
            }
        }

        try {
            document.execCommand('selectAll');
            const ok = document.execCommand('insertText', false, newText);
            logDebug('execCommand fallback result', { ok });
            return !!ok;
        } catch (err) {
            logDebug('execCommand fallback failed', { error: String(err) });
        }

        showToast('Injection failed', '#b91c1c');
        return false;
    }

    function triggerNukeEffects() {
        try {
            if (navigator.vibrate) navigator.vibrate([60, 40, 120]);
        } catch (err) {
            logDebug('Vibrate failed', { error: String(err) });
        }

        const flash = document.createElement('div');
        flash.style.cssText = `
            position: fixed;
            inset: 0;
            background: rgba(255,0,0,0.25);
            z-index: 2147483646;
            pointer-events: none;
            transition: opacity .35s ease;
            opacity: 1;
        `;
        document.body.appendChild(flash);
        requestAnimationFrame(() => requestAnimationFrame(() => flash.style.opacity = '0'));
        setTimeout(() => flash.remove(), 400);
    }

    function initGemini() {
        logDebug('Gemini mode init', { ua: navigator.userAgent });

        setInterval(() => {
            const codeBlocks = document.querySelectorAll('pre');
            codeBlocks.forEach((block, index) => {
                if (block.classList.contains('hubgee-injected')) return;
                block.classList.add('hubgee-injected');

                const btn = document.createElement('button');
                btn.textContent = `📦 Push Block #${index + 1}`;
                btn.style.cssText = `
                    display:block;
                    width:100%;
                    padding:14px;
                    margin-bottom:8px;
                    background:#2563eb;
                    color:white;
                    border:none;
                    border-radius:6px;
                    font-size:16px;
                    font-weight:bold;
                `;

                btn.onclick = (e) => {
                    e.preventDefault();

                    const rawCode = block.innerText || '';
                    const ok = gmSet(KEYS.payload, rawCode);

                    logDebug('Gemini push', {
                        success: ok,
                        len: rawCode.length,
                        preview: safeStringPreview(rawCode)
                    });

                    if (!ok) {
                        showToast('GM_setValue failed', '#b91c1c');
                        return;
                    }

                    const verify = gmGet(KEYS.payload, '');
                    logDebug('Gemini re-read after write', {
                        len: typeof verify === 'string' ? verify.length : -1
                    });

                    btn.textContent = `✅ Stored ${rawCode.length} chars`;
                    btn.style.background = '#15803d';
                    showToast(`Stored ${rawCode.length} chars`, '#166534');

                    setTimeout(() => {
                        btn.textContent = `📦 Push Block #${index + 1}`;
                        btn.style.background = '#2563eb';
                    }, 1800);
                };

                block.parentNode.insertBefore(btn, block);
                logDebug('Push button injected', { block: index + 1 });
            });
        }, 1500);
    }

    function initGitHub() {
        logDebug('GitHub mode init', { ua: navigator.userAgent, url: location.href });

        setInterval(() => {
            if (!window.location.href.includes('/edit/')) return;
            if (document.getElementById('hubgee-github-container')) return;

            const wrap = document.createElement('div');
            wrap.id = 'hubgee-github-container';
            wrap.style.cssText = `
                position:fixed;
                right:20px;
                bottom:20px;
                z-index:2147483645;
                display:flex;
                flex-direction:column;
                gap:8px;
            `;

            const nukeBtn = document.createElement('button');
            nukeBtn.textContent = '☢️ NUKE & PULL';
            nukeBtn.style.cssText = `
                padding:16px 20px;
                background:#dc2626;
                color:white;
                border:none;
                border-radius:8px;
                font-weight:bold;
                font-size:16px;
                box-shadow:0 4px 10px rgba(0,0,0,.35);
            `;

            const testBtn = document.createElement('button');
            testBtn.textContent = '🧪 TEST';
            testBtn.style.cssText = `
                padding:12px 16px;
                background:#1d4ed8;
                color:white;
                border:none;
                border-radius:8px;
                font-weight:bold;
                font-size:14px;
            `;

            wrap.appendChild(nukeBtn);
            wrap.appendChild(testBtn);
            document.body.appendChild(wrap);

            makeDraggable(wrap, wrap, KEYS.btnPos);
            logDebug('GitHub buttons injected');

            testBtn.onclick = (e) => {
                e.preventDefault();
                const probe = 'HUBGEE_TEST_' + Date.now();
                logDebug('Running TEST inject', { probe });
                const ok = injectIntoGitHubEditor(probe);
                showToast(ok ? 'TEST inject OK' : 'TEST inject FAIL', ok ? '#166534' : '#b91c1c');
            };

            nukeBtn.onclick = (e) => {
                e.preventDefault();

                let incoming = gmGet(KEYS.payload, '');
                logDebug('GitHub pull read', {
                    type: typeof incoming,
                    len: typeof incoming === 'string' ? incoming.length : -1,
                    preview: typeof incoming === 'string' ? safeStringPreview(incoming) : '[not string]'
                });

                if (!incoming) {
                    showToast('Buffer empty', '#b91c1c');
                    logDebug('FAIL: empty payload');
                    return;
                }

                try {
                    const parsed = JSON.parse(incoming);
                    if (parsed && parsed.text) {
                        incoming = parsed.text;
                        logDebug('Payload JSON-unwrapped', { len: incoming.length });
                    }
                } catch (_) {}

                triggerNukeEffects();

                const ok = injectIntoGitHubEditor(incoming);
                if (ok) {
                    showToast(`Pulled ${incoming.length} chars`, '#166534');
                    logDebug('SUCCESS: pull complete', { len: incoming.length });
                } else {
                    showToast('Pull failed', '#b91c1c');
                    logDebug('FAIL: pull failed');
                }
            };
        }, 1200);
    }

    ensureDebugUI();
    logDebug('Hubgee boot', {
        mode: isGemini ? 'gemini' : isGitHub ? 'github' : 'other',
        url: location.href
    });

    if (isGemini) initGemini();
    if (isGitHub) initGitHub();
})();

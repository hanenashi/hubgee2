// ==UserScript==
// @name         Hubgee2 - Tactical Code Bridge DEBUG
// @namespace    https://github.com/hanenashi
// @version      0.2
// @description  Send code blocks from Gemini directly into the GitHub web editor. Clipboard-free mobile workflow with on-page debug tools.
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
        payload: 'hubgee2_payload',
        btnPos: 'hubgee2_btn_pos',
        debugEnabled: 'hubgee2_debug_enabled',
        debugPos: 'hubgee2_debug_pos',
        debugLogs: 'hubgee2_debug_logs'
    };

    function gmGet(key, fallback) {
        try {
            return GM_getValue(key, fallback);
        } catch (err) {
            console.log('[Hubgee2] GM_getValue failed:', key, err);
            return fallback;
        }
    }

    function gmSet(key, value) {
        try {
            GM_setValue(key, value);
            return true;
        } catch (err) {
            console.log('[Hubgee2] GM_setValue failed:', key, err);
            return false;
        }
    }

    function nowStamp() {
        const d = new Date();
        const hh = String(d.getHours()).padStart(2, '0');
        const mm = String(d.getMinutes()).padStart(2, '0');
        const ss = String(d.getSeconds()).padStart(2, '0');
        return `${hh}:${mm}:${ss}`;
    }

    function loadLogs() {
        const logs = gmGet(KEYS.debugLogs, []);
        return Array.isArray(logs) ? logs : [];
    }

    function saveLogs(logs) {
        gmSet(KEYS.debugLogs, logs.slice(-400));
    }

    function appendDebugLine(body, line) {
        const div = document.createElement('div');
        div.textContent = line;
        div.style.borderBottom = '1px solid #333';
        div.style.padding = '4px 0';
        div.style.wordBreak = 'break-word';
        body.appendChild(div);
        body.scrollTop = body.scrollHeight;
    }

    function logDebug(msg, obj) {
        let line = `[${nowStamp()}] ${msg}`;
        if (obj !== undefined) {
            try {
                line += ' :: ' + JSON.stringify(obj);
            } catch (err) {
                line += ' :: [unserializable]';
            }
        }

        const logs = loadLogs();
        logs.push(line);
        saveLogs(logs);

        const body = document.getElementById('hubgee2-debug-body');
        if (body) appendDebugLine(body, line);

        console.log('[Hubgee2]', line);
    }

    function clearLogs() {
        saveLogs([]);
        const body = document.getElementById('hubgee2-debug-body');
        if (body) body.textContent = '';
        logDebug('Logs cleared');
    }

    function safePreview(text, maxLen) {
        const max = maxLen || 120;
        if (typeof text !== 'string') return '[non-string]';
        return text.slice(0, max).replace(/\n/g, '\\n');
    }

    function showToast(message, bgColor) {
        const toast = document.createElement('div');
        toast.textContent = message;
        toast.style.position = 'fixed';
        toast.style.bottom = '90px';
        toast.style.left = '50%';
        toast.style.transform = 'translateX(-50%)';
        toast.style.background = bgColor || '#222';
        toast.style.color = '#fff';
        toast.style.padding = '10px 14px';
        toast.style.borderRadius = '8px';
        toast.style.fontFamily = 'monospace';
        toast.style.fontSize = '13px';
        toast.style.fontWeight = 'bold';
        toast.style.boxShadow = '0 4px 12px rgba(0,0,0,0.35)';
        toast.style.zIndex = '2147483647';
        toast.style.pointerEvents = 'none';
        toast.style.whiteSpace = 'pre-wrap';
        toast.style.maxWidth = '90vw';
        toast.style.opacity = '1';
        toast.style.transition = 'opacity 0.25s ease';
        document.body.appendChild(toast);

        setTimeout(() => {
            toast.style.opacity = '0';
        }, 1800);

        setTimeout(() => {
            if (toast.parentNode) toast.parentNode.removeChild(toast);
        }, 2200);
    }

    function clampToViewport(el, x, y) {
        const rect = el.getBoundingClientRect();
        const maxX = Math.max(0, window.innerWidth - rect.width);
        const maxY = Math.max(0, window.innerHeight - rect.height);
        return {
            x: Math.max(0, Math.min(x, maxX)),
            y: Math.max(0, Math.min(y, maxY))
        };
    }

    function applySavedPosition(el, key, fallbackX, fallbackY) {
        const saved = gmGet(key, null);
        if (saved && typeof saved.x === 'number' && typeof saved.y === 'number') {
            el.style.left = saved.x + 'px';
            el.style.top = saved.y + 'px';
            el.style.right = 'auto';
            el.style.bottom = 'auto';
        } else {
            if (typeof fallbackX === 'number') el.style.left = fallbackX + 'px';
            if (typeof fallbackY === 'number') el.style.top = fallbackY + 'px';
        }
    }

    function makeDraggable(el, handle, saveKey) {
        let isDragging = false;
        let moved = false;
        let offsetX = 0;
        let offsetY = 0;

        function start(clientX, clientY) {
            const rect = el.getBoundingClientRect();
            isDragging = true;
            moved = false;
            offsetX = clientX - rect.left;
            offsetY = clientY - rect.top;
        }

        function move(clientX, clientY) {
            if (!isDragging) return;
            moved = true;
            const pos = clampToViewport(el, clientX - offsetX, clientY - offsetY);
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

        handle.addEventListener('mousedown', function (e) {
            start(e.clientX, e.clientY);
        });

        document.addEventListener('mousemove', function (e) {
            move(e.clientX, e.clientY);
        });

        document.addEventListener('mouseup', function () {
            end();
        });

        handle.addEventListener('touchstart', function (e) {
            if (!e.touches || !e.touches.length) return;
            const t = e.touches[0];
            start(t.clientX, t.clientY);
        }, { passive: true });

        document.addEventListener('touchmove', function (e) {
            if (!isDragging || !e.touches || !e.touches.length) return;
            const t = e.touches[0];
            move(t.clientX, t.clientY);
        }, { passive: true });

        document.addEventListener('touchend', function () {
            end();
        });

        return function wasDragged() {
            return moved;
        };
    }

    function ensureDebugUI() {
        if (document.getElementById('hubgee2-debug-toggle')) return;

        const toggle = document.createElement('button');
        toggle.id = 'hubgee2-debug-toggle';
        toggle.textContent = 'DEBUG';
        toggle.style.position = 'fixed';
        toggle.style.top = '16px';
        toggle.style.right = '16px';
        toggle.style.zIndex = '2147483647';
        toggle.style.background = '#111';
        toggle.style.color = '#0f0';
        toggle.style.border = '1px solid #0f0';
        toggle.style.borderRadius = '8px';
        toggle.style.padding = '10px 12px';
        toggle.style.fontSize = '12px';
        toggle.style.fontWeight = 'bold';
        toggle.style.fontFamily = 'monospace';
        document.body.appendChild(toggle);

        const panel = document.createElement('div');
        panel.id = 'hubgee2-debug-panel';
        panel.style.position = 'fixed';
        panel.style.left = '16px';
        panel.style.top = '60px';
        panel.style.width = 'min(92vw, 430px)';
        panel.style.height = 'min(55vh, 420px)';
        panel.style.background = 'rgba(10,10,10,0.95)';
        panel.style.color = '#d6ffd6';
        panel.style.border = '1px solid #3a3';
        panel.style.borderRadius = '10px';
        panel.style.zIndex = '2147483647';
        panel.style.fontFamily = 'monospace';
        panel.style.display = 'none';
        panel.style.overflow = 'hidden';
        panel.style.boxShadow = '0 10px 28px rgba(0,0,0,0.5)';

        const header = document.createElement('div');
        header.id = 'hubgee2-debug-header';
        header.style.padding = '10px';
        header.style.background = '#161616';
        header.style.borderBottom = '1px solid #2d2d2d';
        header.style.display = 'flex';
        header.style.gap = '8px';
        header.style.alignItems = 'center';
        header.style.justifyContent = 'space-between';
        header.style.cursor = 'move';

        const title = document.createElement('div');
        title.textContent = 'Hubgee2 Debug';
        title.style.fontWeight = 'bold';
        title.style.color = '#9f9';

        const buttonWrap = document.createElement('div');
        buttonWrap.style.display = 'flex';
        buttonWrap.style.gap = '6px';

        function smallButton(label, bg, border) {
            const btn = document.createElement('button');
            btn.textContent = label;
            btn.style.background = bg;
            btn.style.color = '#fff';
            btn.style.border = '1px solid ' + border;
            btn.style.borderRadius = '6px';
            btn.style.padding = '4px 8px';
            btn.style.fontFamily = 'monospace';
            btn.style.fontSize = '12px';
            return btn;
        }

        const copyBtn = smallButton('Copy', '#222', '#666');
        const clearBtn = smallButton('Clear', '#222', '#666');
        const closeBtn = smallButton('X', '#300', '#844');

        const body = document.createElement('div');
        body.id = 'hubgee2-debug-body';
        body.style.padding = '10px';
        body.style.height = 'calc(100% - 48px)';
        body.style.overflow = 'auto';
        body.style.fontSize = '12px';
        body.style.lineHeight = '1.35';

        buttonWrap.appendChild(copyBtn);
        buttonWrap.appendChild(clearBtn);
        buttonWrap.appendChild(closeBtn);
        header.appendChild(title);
        header.appendChild(buttonWrap);
        panel.appendChild(header);
        panel.appendChild(body);
        document.body.appendChild(panel);

        const enabled = !!gmGet(KEYS.debugEnabled, false);
        panel.style.display = enabled ? 'block' : 'none';

        toggle.addEventListener('click', function () {
            const open = panel.style.display !== 'none';
            panel.style.display = open ? 'none' : 'block';
            gmSet(KEYS.debugEnabled, !open);
            logDebug('Debug panel ' + (open ? 'hidden' : 'shown'));
        });

        closeBtn.addEventListener('click', function () {
            panel.style.display = 'none';
            gmSet(KEYS.debugEnabled, false);
            logDebug('Debug panel hidden');
        });

        clearBtn.addEventListener('click', function () {
            clearLogs();
        });

        copyBtn.addEventListener('click', async function () {
            const logs = loadLogs().join('\n');
            try {
                await navigator.clipboard.writeText(logs);
                showToast('Debug log copied', '#166534');
            } catch (err) {
                showToast('Copy failed', '#b91c1c');
                logDebug('Clipboard copy failed', { error: String(err) });
            }
        });

        loadLogs().forEach(function (line) {
            appendDebugLine(body, line);
        });

        applySavedPosition(panel, KEYS.debugPos, 16, 60);
        makeDraggable(panel, header, KEYS.debugPos);
    }

    function triggerNukeEffects() {
        try {
            if (navigator.vibrate) navigator.vibrate([60, 40, 120]);
        } catch (err) {
            logDebug('Vibrate failed', { error: String(err) });
        }

        const flash = document.createElement('div');
        flash.style.position = 'fixed';
        flash.style.left = '0';
        flash.style.top = '0';
        flash.style.width = '100vw';
        flash.style.height = '100vh';
        flash.style.background = 'rgba(255, 0, 0, 0.25)';
        flash.style.zIndex = '2147483646';
        flash.style.pointerEvents = 'none';
        flash.style.opacity = '1';
        flash.style.transition = 'opacity 0.35s ease';
        document.body.appendChild(flash);

        requestAnimationFrame(function () {
            requestAnimationFrame(function () {
                flash.style.opacity = '0';
            });
        });

        setTimeout(function () {
            if (flash.parentNode) flash.parentNode.removeChild(flash);
        }, 400);
    }

    function findGeminiCodeText(block) {
        if (!block) return '';
        let raw = block.innerText || block.textContent || '';
        raw = raw.replace(/\u00a0/g, ' ');
        return raw;
    }

    function locateGitHubEditor() {
        const selectors = [
            'textarea.file-editor-textarea',
            'textarea[spellcheck="false"]',
            'textarea',
            '.cm-editor textarea',
            '[data-testid="codemirror-editor"] textarea'
        ];

        const results = [];

        for (let i = 0; i < selectors.length; i++) {
            const sel = selectors[i];
            const el = document.querySelector(sel);
            if (el) {
                results.push({
                    selector: sel,
                    tag: el.tagName,
                    className: el.className || '',
                    ok: true
                });
                return {
                    el: el,
                    selector: sel,
                    results: results
                };
            }
            results.push({
                selector: sel,
                ok: false
            });
        }

        return {
            el: null,
            selector: null,
            results: results
        };
    }

    function injectIntoGitHubEditor(newText) {
        logDebug('Inject requested', {
            len: newText.length,
            preview: safePreview(newText)
        });

        const found = locateGitHubEditor();
        logDebug('Editor lookup', found.results);

        let target = found.el;

        if (!target && document.activeElement) {
            target = document.activeElement;
            logDebug('Fallback activeElement', {
                tag: target.tagName || '',
                className: target.className || ''
            });
        }

        if (!target) {
            logDebug('FAIL: no editor target found');
            showToast('No GitHub editor found', '#b91c1c');
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
                const desc = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value');
                const nativeSetter = desc && desc.set ? desc.set : null;

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

                logDebug('Textarea post-inject length', {
                    valueLength: target.value.length
                });

                return true;
            } catch (err) {
                logDebug('Textarea inject failed', { error: String(err) });
            }
        }

        try {
            const okSelect = document.execCommand('selectAll');
            const okInsert = document.execCommand('insertText', false, newText);
            logDebug('execCommand fallback', {
                selectAll: okSelect,
                insertText: okInsert
            });
            return !!okInsert;
        } catch (err) {
            logDebug('execCommand fallback failed', { error: String(err) });
        }

        showToast('Injection failed', '#b91c1c');
        return false;
    }

    function initGemini() {
        logDebug('Gemini mode init', {
            url: location.href,
            ua: navigator.userAgent
        });

        setInterval(function () {
            const codeBlocks = document.querySelectorAll('pre');
            logDebug('Gemini scan', { preCount: codeBlocks.length });

            codeBlocks.forEach(function (block, index) {
                if (block.classList.contains('hubgee2-injected')) return;
                block.classList.add('hubgee2-injected');

                const btn = document.createElement('button');
                btn.textContent = 'Push Block #' + (index + 1);
                btn.style.display = 'block';
                btn.style.width = '100%';
                btn.style.padding = '14px';
                btn.style.marginBottom = '8px';
                btn.style.background = '#2563eb';
                btn.style.color = '#fff';
                btn.style.border = 'none';
                btn.style.borderRadius = '6px';
                btn.style.fontSize = '16px';
                btn.style.fontWeight = 'bold';
                btn.style.fontFamily = 'sans-serif';
                btn.style.cursor = 'pointer';

                btn.addEventListener('click', function (e) {
                    e.preventDefault();

                    const rawCode = findGeminiCodeText(block);
                    const ok = gmSet(KEYS.payload, rawCode);

                    logDebug('Gemini push', {
                        success: ok,
                        len: rawCode.length,
                        preview: safePreview(rawCode)
                    });

                    if (!ok) {
                        showToast('GM_setValue failed', '#b91c1c');
                        return;
                    }

                    const verify = gmGet(KEYS.payload, '');
                    logDebug('Gemini re-read after write', {
                        len: typeof verify === 'string' ? verify.length : -1
                    });

                    btn.textContent = 'Stored ' + rawCode.length + ' chars';
                    btn.style.background = '#15803d';
                    showToast('Stored ' + rawCode.length + ' chars', '#166534');

                    setTimeout(function () {
                        btn.textContent = 'Push Block #' + (index + 1);
                        btn.style.background = '#2563eb';
                    }, 1800);
                });

                if (block.parentNode) {
                    block.parentNode.insertBefore(btn, block);
                    logDebug('Push button injected', { blockIndex: index + 1 });
                }
            });
        }, 1500);
    }

    function initGitHub() {
        logDebug('GitHub mode init', {
            url: location.href,
            ua: navigator.userAgent
        });

        setInterval(function () {
            if (!window.location.href.includes('/edit/')) return;
            if (document.getElementById('hubgee2-github-container')) return;

            const wrap = document.createElement('div');
            wrap.id = 'hubgee2-github-container';
            wrap.style.position = 'fixed';
            wrap.style.right = '20px';
            wrap.style.bottom = '20px';
            wrap.style.zIndex = '2147483645';
            wrap.style.display = 'flex';
            wrap.style.flexDirection = 'column';
            wrap.style.gap = '8px';

            const nukeBtn = document.createElement('button');
            nukeBtn.textContent = 'NUKE & PULL';
            nukeBtn.style.padding = '16px 20px';
            nukeBtn.style.background = '#dc2626';
            nukeBtn.style.color = '#fff';
            nukeBtn.style.border = 'none';
            nukeBtn.style.borderRadius = '8px';
            nukeBtn.style.fontWeight = 'bold';
            nukeBtn.style.fontSize = '16px';
            nukeBtn.style.fontFamily = 'sans-serif';
            nukeBtn.style.boxShadow = '0 4px 10px rgba(0,0,0,.35)';
            nukeBtn.style.cursor = 'pointer';

            const testBtn = document.createElement('button');
            testBtn.textContent = 'TEST';
            testBtn.style.padding = '12px 16px';
            testBtn.style.background = '#1d4ed8';
            testBtn.style.color = '#fff';
            testBtn.style.border = 'none';
            testBtn.style.borderRadius = '8px';
            testBtn.style.fontWeight = 'bold';
            testBtn.style.fontSize = '14px';
            testBtn.style.fontFamily = 'sans-serif';
            testBtn.style.cursor = 'pointer';

            wrap.appendChild(nukeBtn);
            wrap.appendChild(testBtn);
            document.body.appendChild(wrap);

            applySavedPosition(wrap, KEYS.btnPos);
            const wasDragged = makeDraggable(wrap, wrap, KEYS.btnPos);

            logDebug('GitHub buttons injected');

            testBtn.addEventListener('click', function (e) {
                e.preventDefault();
                if (wasDragged()) return;

                const probe = 'HUBGEE2_TEST_' + Date.now();
                logDebug('Running TEST inject', { probe: probe });
                const ok = injectIntoGitHubEditor(probe);
                showToast(ok ? 'TEST inject OK' : 'TEST inject FAIL', ok ? '#166534' : '#b91c1c');
            });

            nukeBtn.addEventListener('click', function (e) {
                e.preventDefault();
                if (wasDragged()) return;

                let incoming = gmGet(KEYS.payload, '');
                logDebug('GitHub pull read', {
                    type: typeof incoming,
                    len: typeof incoming === 'string' ? incoming.length : -1,
                    preview: typeof incoming === 'string' ? safePreview(incoming) : '[not-string]'
                });

                if (!incoming) {
                    showToast('Buffer empty', '#b91c1c');
                    logDebug('FAIL: empty payload');
                    return;
                }

                try {
                    const parsed = JSON.parse(incoming);
                    if (parsed && typeof parsed.text === 'string') {
                        incoming = parsed.text;
                        logDebug('Payload JSON-unwrapped', { len: incoming.length });
                    }
                } catch (err) {
                    // Not JSON. Fine.
                }

                triggerNukeEffects();

                const ok = injectIntoGitHubEditor(incoming);
                if (ok) {
                    showToast('Pulled ' + incoming.length + ' chars', '#166534');
                    logDebug('SUCCESS: pull complete', { len: incoming.length });
                } else {
                    showToast('Pull failed', '#b91c1c');
                    logDebug('FAIL: pull failed');
                }
            });
        }, 1200);
    }

    ensureDebugUI();
    logDebug('Hubgee2 boot', {
        mode: isGemini ? 'gemini' : isGitHub ? 'github' : 'other',
        url: location.href
    });

    if (isGemini) initGemini();
    if (isGitHub) initGitHub();
})();

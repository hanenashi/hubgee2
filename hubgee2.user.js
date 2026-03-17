// ==UserScript==
// @name         Hubgee2 - Copy Paste Bridge
// @namespace    https://github.com/hanenashi
// @version      1.17
// @description  Copy code blocks from Gemini or ChatGPT directly into GitHub. Includes bulletproof generation detection, animated feedback, and CodeMirror refocusing.
// @author       hanenashi
// @match        *://*.gemini.google.com/*
// @match        *://gemini.google.com/*
// @match        *://*.chatgpt.com/*
// @match        *://chatgpt.com/*
// @match        *://*.openai.com/*
// @match        *://*.github.com/*
// @match        *://github.com/*
// @icon         https://raw.githubusercontent.com/hanenashi/hubgee2/main/icon.svg
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

    const host = window.location.hostname;

    const isGemini = host.includes('gemini.google.com');
    const isChatGPT = host.includes('chatgpt.com') || host.includes('openai.com');
    const isGitHub = host.includes('github.com');

    const KEYS = {
        payload: 'hubgee2_payload',
        btnPos: 'hubgee2_btn_pos',
        mode: 'hubgee2_mode'
    };

    const MODES = ['paste', 'download'];

    function log(...args) {
        console.log('[Hubgee2]', ...args);
    }

    function warn(...args) {
        console.warn('[Hubgee2]', ...args);
    }

    function gmGet(key, fallback) {
        try {
            return GM_getValue(key, fallback);
        } catch (err) {
            return fallback;
        }
    }

    function gmSet(key, value) {
        try {
            GM_setValue(key, value);
            return true;
        } catch (err) {
            return false;
        }
    }

    function getMode() {
        const mode = gmGet(KEYS.mode, 'paste');
        return MODES.includes(mode) ? mode : 'paste';
    }

    function setMode(mode) {
        if (!MODES.includes(mode)) return;
        gmSet(KEYS.mode, mode);
    }

    function cycleMode() {
        const current = getMode();
        const next = MODES[(MODES.indexOf(current) + 1) % MODES.length];
        setMode(next);
        return next;
    }

    function modeLabel(mode) {
        return mode === 'download' ? 'Download' : 'Paste';
    }

    function showToast(message, bgColor) {
        const toast = document.createElement('div');
        toast.textContent = message;
        toast.style.cssText = `
            position: fixed;
            bottom: 90px;
            left: 50%;
            transform: translateX(-50%);
            background: ${bgColor || '#222'};
            color: #fff;
            padding: 10px 14px;
            border-radius: 8px;
            font-family: sans-serif;
            font-size: 13px;
            font-weight: bold;
            box-shadow: 0 4px 12px rgba(0,0,0,0.35);
            z-index: 2147483647;
            pointer-events: none;
            white-space: pre-wrap;
            max-width: 90vw;
            opacity: 1;
            transition: opacity 0.25s ease;
        `;
        document.body.appendChild(toast);
        setTimeout(() => {
            toast.style.opacity = '0';
        }, 1600);
        setTimeout(() => {
            if (toast.parentNode) toast.parentNode.removeChild(toast);
        }, 2000);
    }

    function nextFrame() {
        return new Promise(resolve => requestAnimationFrame(resolve));
    }

    function isNodeVisible(node) {
        if (!node) return false;
        const style = window.getComputedStyle(node);
        if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') {
            return false;
        }
        const rect = node.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
    }

    function isBlockGenerating(block, isGPT) {
        const now = Date.now();
        const currentLen = block.innerText.length;

        if (block._hubgeeLastLen !== currentLen) {
            block._hubgeeLastLen = currentLen;
            block._hubgeeLastChange = now;
        }

        const recentlyChanged = (now - (block._hubgeeLastChange || 0)) < 1500;
        const allPres = document.querySelectorAll('pre');
        const isLastBlock = allPres[allPres.length - 1] === block;

        if (isGPT) {
            const msgContainer = block.closest('[data-message-author-role="assistant"], article, [role="article"]') || document;
            const hasSpinner = !!(block.parentElement && block.parentElement.querySelector('svg.animate-spin'));
            const isStreaming = !!block.closest('.result-streaming');

            let hasVisibleStopBtn = false;
            const stopBtns = msgContainer.querySelectorAll('button[aria-label*="stop" i]');
            stopBtns.forEach(btn => {
                if (isNodeVisible(btn)) hasVisibleStopBtn = true;
            });

            const wrapper = block.parentElement && block.parentElement.parentElement;
            const hasNativeCopy = !!(wrapper && wrapper.querySelector('button[aria-label="Copy" i]'));

            return recentlyChanged || hasSpinner || isStreaming || (hasVisibleStopBtn && isLastBlock && !hasNativeCopy);
        } else {
            let hasVisibleStopBtn = false;
            const stopBtns = document.querySelectorAll('button[aria-label*="stop" i], button[aria-label*="Stop stream" i]');
            stopBtns.forEach(btn => {
                if (isNodeVisible(btn)) hasVisibleStopBtn = true;
            });

            return recentlyChanged || (hasVisibleStopBtn && isLastBlock);
        }
    }

    function armWorkingOnPress(eventTarget, visualTarget) {
        if (!eventTarget || !visualTarget) return null;

        function showWorkingSoon() {
            if (visualTarget.disabled || visualTarget.classList.contains('hubgee2-generating')) return;
            visualTarget.dataset.hubgeePressArmed = '1';
            visualTarget.dataset.hubgeePrevLabel = visualTarget.textContent;
            visualTarget.textContent = 'Working...';
            visualTarget.classList.add('hubgee2-working');
        }

        function cancelWorkingSoon() {
            if (visualTarget.dataset.hubgeePressArmed !== '1') return;
            visualTarget.dataset.hubgeePressArmed = '0';
            visualTarget.classList.remove('hubgee2-working');
            visualTarget.textContent = visualTarget.dataset.hubgeePrevLabel || visualTarget.textContent;
        }

        eventTarget.addEventListener('pointerdown', showWorkingSoon);
        eventTarget.addEventListener('mousedown', showWorkingSoon);
        eventTarget.addEventListener('touchstart', showWorkingSoon, { passive: true });

        eventTarget.addEventListener('pointerleave', cancelWorkingSoon);
        eventTarget.addEventListener('mouseleave', cancelWorkingSoon);
        eventTarget.addEventListener('touchcancel', cancelWorkingSoon, { passive: true });

        return {
            confirmWorking: function () {
                visualTarget.dataset.hubgeePressArmed = '0';
                visualTarget.disabled = true;
                visualTarget.textContent = 'Working...';
                visualTarget.classList.add('hubgee2-working');
                visualTarget.classList.remove('hubgee2-pop');
            },
            resetWorking: function (label) {
                visualTarget.dataset.hubgeePressArmed = '0';
                visualTarget.disabled = false;
                visualTarget.classList.remove('hubgee2-working');
                visualTarget.textContent = label || visualTarget.dataset.hubgeePrevLabel || visualTarget.textContent;

                visualTarget.classList.add('hubgee2-pop');
                setTimeout(() => visualTarget.classList.remove('hubgee2-pop'), 300);
            }
        };
    }

    function injectStyles() {
        if (document.getElementById('hubgee2-style')) return;

        const style = document.createElement('style');
        style.id = 'hubgee2-style';
        style.textContent = `
            .hubgee2-btn {
                transition: transform 0.14s ease, box-shadow 0.14s ease, filter 0.14s ease, opacity 0.14s ease, background 0.2s ease;
                will-change: transform;
            }
            .hubgee2-btn:not(:disabled):hover {
                transform: translateY(-1px);
                filter: brightness(1.04);
            }
            .hubgee2-btn:not(:disabled):active {
                transform: scale(0.92);
                filter: brightness(0.92);
            }
            .hubgee2-btn.hubgee2-working {
                animation: hubgee2Pulse 0.9s ease-in-out infinite;
                cursor: progress !important;
                opacity: 0.96;
            }
            .hubgee2-btn.hubgee2-generating {
                background: #4b5563 !important;
                cursor: wait !important;
                opacity: 0.8;
                animation: hubgee2PulseSlow 2.5s ease-in-out infinite;
                pointer-events: none;
            }
            .hubgee2-pop {
                animation: hubgee2PopAnim 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275) !important;
            }
            @keyframes hubgee2Pulse {
                0%   { transform: scale(1); box-shadow: 0 4px 10px rgba(0,0,0,.25); }
                50%  { transform: scale(1.03); box-shadow: 0 6px 18px rgba(0,0,0,.35); }
                100% { transform: scale(1); box-shadow: 0 4px 10px rgba(0,0,0,.25); }
            }
            @keyframes hubgee2PulseSlow {
                0%   { filter: brightness(1); }
                50%  { filter: brightness(1.15); }
                100% { filter: brightness(1); }
            }
            @keyframes hubgee2PopAnim {
                0% { transform: scale(1); }
                50% { transform: scale(1.08); }
                100% { transform: scale(1); }
            }
        `;
        document.head.appendChild(style);
    }

    function locateGitHubEditor() {
        const selectors = [
            '.cm-content[contenteditable="true"]', // TOP PRIORITY
            'textarea.file-editor-textarea',
            'textarea[aria-label*="file editor" i]',
            'textarea[aria-label*="editor" i]',
            '.cm-editor textarea',
            '[data-testid="codemirror-editor"] textarea',
            'textarea'
        ];

        for (const selector of selectors) {
            const els = document.querySelectorAll(selector);

            for (const el of els) {
                const cls = (el.className || '').toLowerCase();
                const aria = (el.getAttribute('aria-label') || '').toLowerCase();
                const name = (el.getAttribute('name') || '').toLowerCase();
                const id = (el.id || '').toLowerCase();

                if (
                    cls.includes('form-control') ||
                    aria.includes('commit') ||
                    aria.includes('description') ||
                    aria.includes('pull request') ||
                    name.includes('message') ||
                    name.includes('description') ||
                    name.includes('feedback') ||
                    name.includes('filename') ||
                    id.includes('commit') ||
                    id.includes('search')
                ) {
                    continue;
                }

                return el;
            }
        }

        return null;
    }

    function refocusGitHubEditor(target) {
        try {
            const cmInput = document.querySelector('.cm-editor textarea');
            if (cmInput) {
                cmInput.focus();
                return;
            }
            if (target && typeof target.focus === 'function') {
                target.focus();
            }
        } catch (err) {
            warn('refocusGitHubEditor failed:', err);
        }
    }

    async function injectIntoGitHubEditor(newText) {
        const target = locateGitHubEditor();

        if (!target) {
            showToast('No GitHub editor found', '#b91c1c');
            return false;
        }

        try {
            target.focus();
        } catch (err) {}

        let ok = false;

        if (target.tagName === 'TEXTAREA') {
            try {
                const desc = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value');
                const nativeSetter = desc && desc.set ? desc.set : null;

                if (nativeSetter) {
                    nativeSetter.call(target, newText);
                } else {
                    target.value = newText;
                }

                target.dispatchEvent(new InputEvent('input', { bubbles: true, data: newText, inputType: 'insertText' }));
                target.dispatchEvent(new Event('change', { bubbles: true }));
                ok = true;
            } catch (err) {}
        }

        if (!ok && target.isContentEditable) {
            try {
                target.focus();

                const sel = window.getSelection();
                if (sel) sel.removeAllRanges();

                const range = document.createRange();
                range.selectNodeContents(target);
                if (sel) sel.addRange(range);

                try {
                    const dt = new DataTransfer();
                    dt.setData('text/plain', newText);
                    const pasteEvent = new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData: dt });
                    target.dispatchEvent(pasteEvent);
                    
                    // If CodeMirror intercepted and handled the paste event, it will prevent default.
                    // If it handled it, we DO NOT fire execCommand, preventing the double paste!
                    if (pasteEvent.defaultPrevented) {
                        ok = true;
                    }
                } catch (e) {}

                if (!ok) {
                    ok = await new Promise(resolve => {
                        requestAnimationFrame(() => {
                            try {
                                const worked = document.execCommand('insertText', false, newText);
                                resolve(!!worked);
                            } catch (err) {
                                resolve(false);
                            }
                        });
                    });
                }

                if (ok) {
                    setTimeout(() => refocusGitHubEditor(target), 30);
                }
            } catch (err) {}
        }

        return ok;
    }

    function downloadPayload(text) {
        try {
            const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'code.txt';
            a.style.display = 'none';
            document.body.appendChild(a);
            a.click();

            setTimeout(() => {
                URL.revokeObjectURL(url);
                if (a.parentNode) a.parentNode.removeChild(a);
            }, 1000);

            return true;
        } catch (err) {
            return false;
        }
    }

    function setPayloadFromText(text) {
        if (!gmSet(KEYS.payload, text)) {
            showToast('Copy failed', '#b91c1c');
            return false;
        }

        showToast('Copied ' + text.length + ' chars', '#166534');
        return true;
    }

    function createSourceButton(label) {
        const btn = document.createElement('button');
        btn.textContent = label;
        btn.className = 'hubgee2-btn';
        btn.style.cssText = `
            display: block;
            width: 100%;
            padding: 14px;
            margin-bottom: 8px;
            background: #2563eb;
            color: #fff;
            border: none;
            border-radius: 6px;
            font-size: 16px;
            font-weight: bold;
            font-family: sans-serif;
            cursor: pointer;
            box-shadow: 0 4px 10px rgba(0,0,0,.18);
        `;
        return btn;
    }

    function initGemini() {
        setInterval(function () {
            if (!window.location.pathname.startsWith('/app/')) return;

            document.querySelectorAll('pre').forEach(function (block, index) {
                const blockNum = index + 1;
                const defaultLabel = `📦 Copy Block #${blockNum}`;
            
                const isGenerating = isBlockGenerating(block, false);

                if (!block.classList.contains('hubgee2-injected')) {
                    block.classList.add('hubgee2-injected');
                    const btn = createSourceButton(defaultLabel);
                    block._hubgeeBtn = btn;

                    const pressState = armWorkingOnPress(btn, btn);

                    btn.addEventListener('click', async function (e) {
                        e.preventDefault();
                        if (btn.classList.contains('hubgee2-generating')) return;

                        pressState.confirmWorking();
                        await nextFrame();

                        let rawCode = block.innerText || block.textContent || '';
                        rawCode = rawCode.replace(/\u00a0/g, ' ');
                        const ok = setPayloadFromText(rawCode);

                        pressState.resetWorking(ok ? `✅ Copied #${blockNum}` : defaultLabel);

                        setTimeout(() => {
                            if (block._hubgeeBtn && !block._hubgeeBtn.classList.contains('hubgee2-generating')) {
                                block._hubgeeBtn.textContent = defaultLabel;
                            }
                        }, 1600);
                    });

                    if (block.parentNode) block.parentNode.insertBefore(btn, block);
                }

                const btn = block._hubgeeBtn;

                if (btn && btn.dataset.hubgeePressArmed !== '1' && !btn.classList.contains('hubgee2-working') && !btn.textContent.includes('✅')) {
                    if (isGenerating) {
                        btn.disabled = true;
                        btn.classList.add('hubgee2-generating');
                        btn.textContent = `⏳ Generating #${blockNum}...`;
                    } else {
                        btn.disabled = false;
                        btn.classList.remove('hubgee2-generating');
                        btn.textContent = defaultLabel;
                    }
                }
            });
        }, 1200);
    }

    function extractChatGPTCodeText(pre) {
        const cmReadonly = pre.querySelector('.cm-content.q9tKkq_readonly') ||
            pre.querySelector('.cm-content');
        if (cmReadonly) {
            return (cmReadonly.innerText || cmReadonly.textContent || '').replace(/\u00a0/g, ' ');
        }
        return (pre.innerText || pre.textContent || '').replace(/\u00a0/g, ' ');
    }

    function initChatGPT() {
        setInterval(function () {
            document.querySelectorAll('pre').forEach(function (pre, index) {
                if (pre.classList.contains('hubgee2-injected')) return;

                if (!pre.querySelector('#code-block-viewer') && !pre.querySelector('.cm-editor') && !pre.querySelector('.cm-content')) return;
                pre.classList.add('hubgee2-injected');

                const blockNum = index + 1;
                const defaultLabel = `📦 Copy Block #${blockNum}`;
                const btn = createSourceButton(defaultLabel);
                pre._hubgeeBtn = btn;

                const pressState = armWorkingOnPress(btn, btn);

                btn.addEventListener('click', async function (e) {
                    e.preventDefault();
                    if (btn.classList.contains('hubgee2-generating')) return;

                    pressState.confirmWorking();
                    await nextFrame();

                    const rawCode = extractChatGPTCodeText(pre);
                    const ok = setPayloadFromText(rawCode);

                    pressState.resetWorking(ok ? `✅ Copied #${blockNum}` : defaultLabel);

                    setTimeout(() => {
                        if (pre._hubgeeBtn && !pre._hubgeeBtn.classList.contains('hubgee2-generating')) {
                            pre._hubgeeBtn.textContent = defaultLabel;
                        }
                    }, 1600);
                });

                if (pre.parentNode) pre.parentNode.insertBefore(btn, pre);
            });

            document.querySelectorAll('pre.hubgee2-injected').forEach(function (pre, index) {
                const btn = pre._hubgeeBtn;
                const isGenerating = isBlockGenerating(pre, true);
                const defaultLabel = `📦 Copy Block #${index + 1}`;

                if (btn && btn.dataset.hubgeePressArmed !== '1' && !btn.classList.contains('hubgee2-working') && !btn.textContent.includes('✅')) {
                    if (isGenerating) {
                        btn.disabled = true;
                        btn.classList.add('hubgee2-generating');
                        btn.textContent = `⏳ Generating #${index + 1}...`;
                    } else {
                        btn.disabled = false;
                        btn.classList.remove('hubgee2-generating');
                        btn.textContent = defaultLabel;
                    }
                }
            });
        }, 1200);
    }

    function ensureGitHubButton() {
        if (!window.location.pathname.includes('/edit/')) {
            const existing = document.getElementById('hubgee2-github-container');
            if (existing) existing.remove();
            return;
        }

        const existing = document.getElementById('hubgee2-github-container');

        if (existing) {
            const btn = existing.querySelector('button');

            if (btn && !btn.classList.contains('hubgee2-working')) btn.textContent = modeLabel(getMode());
            return;
        }

        const wrap = document.createElement('div');

        wrap.id = 'hubgee2-github-container';
        wrap.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            z-index: 2147483645;
            touch-action: none;
            user-select: none;
            -webkit-user-select: none;
            transition: transform 0.15s cubic-bezier(0.34, 1.56, 0.64, 1);
            cursor: pointer;
            -webkit-tap-highlight-color: transparent;
            width: max-content;
            height: max-content;
            display: inline-block;
        `;

        let savedPos = gmGet(KEYS.btnPos, null);

        if (!savedPos || typeof savedPos.x !== 'number') {
            savedPos = { x: window.innerWidth - 110, y: window.innerHeight - 80 };
        }

        const initMaxX = Math.max(0, window.innerWidth - 110);
        const initMaxY = Math.max(0, window.innerHeight - 60);

        savedPos.x = Math.max(5, Math.min(savedPos.x, initMaxX));
        savedPos.y = Math.max(5, Math.min(savedPos.y, initMaxY));

        wrap.style.transform = `translate(${savedPos.x}px, ${savedPos.y}px)`;

        const actionBtn = document.createElement('button');
        actionBtn.textContent = modeLabel(getMode());
        actionBtn.className = 'hubgee2-btn';

        actionBtn.style.cssText = `
            padding: 16px 20px;
            background: #dc2626;
            color: #fff;
            border: none;
            border-radius: 8px;
            font-weight: bold;
            font-size: 16px;
            font-family: sans-serif;
            box-shadow: 0 4px 10px rgba(0,0,0,.35);
            pointer-events: none;
        `;

        wrap.appendChild(actionBtn);
        document.body.appendChild(wrap);

        const pressState = {
            confirmWorking: function () {
                actionBtn.dataset.hubgeePrevLabel = actionBtn.textContent;
                actionBtn.disabled = true;
                actionBtn.textContent = 'Working...';
                actionBtn.classList.add('hubgee2-working');
                actionBtn.classList.remove('hubgee2-pop');
            },
            resetWorking: function (label) {
                actionBtn.disabled = false;
                actionBtn.classList.remove('hubgee2-working');
                actionBtn.textContent = label || actionBtn.dataset.hubgeePrevLabel || actionBtn.textContent;
                
                actionBtn.classList.add('hubgee2-pop');
                setTimeout(() => actionBtn.classList.remove('hubgee2-pop'), 300);
            }
        };

        let isTouching = false;
        let isLongPress = false;
        let hasMoved = false;
        let longPressTimer;

        function executeLongPress() {
            if (isLongPress || hasMoved) return;

            isLongPress = true;

            const next = cycleMode();
            if (!actionBtn.classList.contains('hubgee2-working')) actionBtn.textContent = modeLabel(next);
            showToast('Mode: ' + modeLabel(next), '#7c3aed');

            wrap.style.transform = `translate(${savedPos.x}px, ${savedPos.y}px) scale(1.1)`;
            setTimeout(() => {
                if (isTouching && !hasMoved) {
                    wrap.style.transform = `translate(${savedPos.x}px, ${savedPos.y}px) scale(0.92)`;
                } else if (!isTouching) {
                    wrap.style.transform = `translate(${savedPos.x}px, ${savedPos.y}px) scale(1.0)`;
                }
            }, 150);
        }

        wrap.addEventListener('contextmenu', function (e) {
            e.preventDefault();
            executeLongPress();
        });

        async function triggerAction() {
            const incoming = gmGet(KEYS.payload, '');

            if (!incoming || typeof incoming !== 'string') {
                showToast('Buffer empty', '#b91c1c');
                return;
            }

            const mode = getMode();
            pressState.confirmWorking();
            await nextFrame();

            try {
                if (mode === 'download') {
                    const ok = downloadPayload(incoming);
                    pressState.resetWorking(modeLabel(getMode()));
                    showToast(ok ? `Downloaded ${incoming.length} chars` : 'Download failed', ok ? '#166534' : '#b91c1c');
                    return;
                }

                const ok = await injectIntoGitHubEditor(incoming);
                pressState.resetWorking(modeLabel(getMode()));
                showToast(ok ? `Pasted ${incoming.length} chars` : 'Paste failed', ok ? '#166534' : '#b91c1c');

            } catch (err) {
                pressState.resetWorking(modeLabel(getMode()));
                showToast('Action failed', '#b91c1c');
            }
        }

        const handleStart = (e) => {
            if (e.pointerType === 'mouse' && e.button !== 0) return;

            if (e.cancelable) e.preventDefault();

            isTouching = true;
            isLongPress = false;
            hasMoved = false;

            const startX = e.clientX;
            const startY = e.clientY;
            const initialPos = { ...savedPos };

            wrap.style.transform = `translate(${initialPos.x}px, ${initialPos.y}px) scale(0.92)`;

            longPressTimer = setTimeout(() => {
                executeLongPress();
            }, 550);

            const handleMove = (moveEvent) => {
                if (moveEvent.cancelable) moveEvent.preventDefault();

                const dx = moveEvent.clientX - startX;
                const dy = moveEvent.clientY - startY;

                if (!hasMoved && (Math.abs(dx) > 5 || Math.abs(dy) > 5)) {
                    hasMoved = true;
                    clearTimeout(longPressTimer);
                }

                if (hasMoved) {
                    let nextX = initialPos.x + dx;
                    let nextY = initialPos.y + dy;

                    const rect = wrap.getBoundingClientRect();
                    const maxX = window.innerWidth - (rect.width / 0.92);
                    const maxY = window.innerHeight - (rect.height / 0.92);

                    savedPos.x = Math.max(5, Math.min(nextX, maxX - 5));
                    savedPos.y = Math.max(5, Math.min(nextY, maxY - 5));

                    wrap.style.transform = `translate(${savedPos.x}px, ${savedPos.y}px) scale(0.92)`;
                }
            };

            const handleEnd = () => {
                clearTimeout(longPressTimer);

                window.removeEventListener('pointermove', handleMove);
                window.removeEventListener('pointerup', handleEnd);
                window.removeEventListener('pointercancel', handleEnd);

                isTouching = false;
                wrap.style.transform = `translate(${savedPos.x}px, ${savedPos.y}px) scale(1.0)`;

                if (hasMoved) {
                    gmSet(KEYS.btnPos, savedPos);
                } else if (!isLongPress) {
                    triggerAction();
                    isLongPress = true;
                }
            };

            window.addEventListener('pointermove', handleMove, { passive: false });
            window.addEventListener('pointerup', handleEnd, { passive: false });
            window.addEventListener('pointercancel', handleEnd, { passive: false });
        };

        wrap.addEventListener('pointerdown', handleStart);
        wrap.hubgeePos = savedPos;
    }

    function initGitHub() {
        ensureGitHubButton();
        setInterval(ensureGitHubButton, 800);

        let lastUrl = location.href;
        setInterval(function () {
            if (location.href !== lastUrl) {
                lastUrl = location.href;
                ensureGitHubButton();
            }
        }, 500);

        window.addEventListener('resize', () => {
            const wrap = document.getElementById('hubgee2-github-container');
            if (wrap && wrap.hubgeePos) {
                const rect = wrap.getBoundingClientRect();
                const maxX = window.innerWidth - rect.width;
                const maxY = window.innerHeight - rect.height;

                let clampedX = Math.max(5, Math.min(wrap.hubgeePos.x, maxX - 5));
                let clampedY = Math.max(5, Math.min(wrap.hubgeePos.y, maxY - 5));

                if (clampedX !== wrap.hubgeePos.x || clampedY !== wrap.hubgeePos.y) {
                    wrap.hubgeePos.x = clampedX;
                    wrap.hubgeePos.y = clampedY;
                    wrap.style.transform = `translate(${wrap.hubgeePos.x}px, ${wrap.hubgeePos.y}px) scale(1.0)`;
                    gmSet(KEYS.btnPos, wrap.hubgeePos);
                }
            }
        }, { passive: true });
    }

    injectStyles();

    if (isGemini) initGemini();
    if (isChatGPT) initChatGPT();
    if (isGitHub) initGitHub();
})();

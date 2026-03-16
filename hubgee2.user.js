// ==UserScript==
// @name         Hubgee2 - Copy Paste Bridge
// @namespace    https://github.com/hanenashi
// @version      1.3
// @description  Copy code blocks from Gemini or ChatGPT directly into the GitHub web editor or download them as a file, without using the clipboard.
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
    const path = window.location.pathname;

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
            warn('GM_getValue failed for', key, err);
            return fallback;
        }
    }

    function gmSet(key, value) {
        try {
            GM_setValue(key, value);
            return true;
        } catch (err) {
            warn('GM_setValue failed for', key, err);
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
        const index = MODES.indexOf(current);
        const next = MODES[(index + 1) % MODES.length];
        setMode(next);
        log('Mode changed to', next);
        return next;
    }

    function modeLabel(mode) {
        return mode === 'download' ? 'Download' : 'Paste';
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
        toast.style.fontFamily = 'sans-serif';
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

        setTimeout(function () {
            toast.style.opacity = '0';
        }, 1600);

        setTimeout(function () {
            if (toast.parentNode) toast.parentNode.removeChild(toast);
        }, 2000);
    }

    function nextFrame() {
        return new Promise(function (resolve) {
            requestAnimationFrame(function () {
                resolve();
            });
        });
    }

    function armWorkingOnPress(eventTarget, visualTarget) {
        if (!eventTarget || !visualTarget) return null;

        function showWorkingSoon() {
            if (visualTarget.disabled) return;
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
            },
            resetWorking: function (label) {
                visualTarget.dataset.hubgeePressArmed = '0';
                visualTarget.disabled = false;
                visualTarget.classList.remove('hubgee2-working');
                visualTarget.textContent = label || visualTarget.dataset.hubgeePrevLabel || visualTarget.textContent;
            }
        };
    }

    function injectStyles() {
        if (document.getElementById('hubgee2-style')) return;

        const style = document.createElement('style');
        style.id = 'hubgee2-style';
        style.textContent = `
            .hubgee2-btn {
                transition: transform 0.14s ease, box-shadow 0.14s ease, filter 0.14s ease, opacity 0.14s ease;
                will-change: transform;
            }
            .hubgee2-btn:hover {
                transform: translateY(-1px);
                filter: brightness(1.04);
            }
            .hubgee2-btn:active {
                transform: scale(0.97);
                filter: brightness(0.96);
            }
            .hubgee2-btn.hubgee2-working {
                animation: hubgee2Pulse 0.9s ease-in-out infinite;
                cursor: progress !important;
                opacity: 0.96;
            }
            .hubgee2-btn:disabled {
                pointer-events: none;
            }
            @keyframes hubgee2Pulse {
                0%   { transform: scale(1); box-shadow: 0 4px 10px rgba(0,0,0,.25); }
                50%  { transform: scale(1.03); box-shadow: 0 6px 18px rgba(0,0,0,.35); }
                100% { transform: scale(1); box-shadow: 0 4px 10px rgba(0,0,0,.25); }
            }
        `;
        document.head.appendChild(style);
    }

    function locateGitHubEditor() {
        const candidates = [];

        function add(selector) {
            const els = document.querySelectorAll(selector);
            els.forEach(function (el) {
                candidates.push({
                    el: el,
                    selector: selector,
                    tag: el.tagName || '',
                    className: el.className || '',
                    ariaLabel: el.getAttribute('aria-label') || '',
                    name: el.getAttribute('name') || ''
                });
            });
        }

        add('textarea.file-editor-textarea');
        add('textarea[aria-label*="file editor" i]');
        add('textarea[aria-label*="editor" i]');
        add('.cm-editor textarea');
        add('[data-testid="codemirror-editor"] textarea');
        add('.cm-content[contenteditable="true"]');
        add('[contenteditable="true"].cm-content');
        add('[role="textbox"][contenteditable="true"]');
        add('textarea');

        for (const c of candidates) {
            const cls = (c.className || '').toLowerCase();
            const aria = (c.ariaLabel || '').toLowerCase();
            const name = (c.name || '').toLowerCase();

            const looksLikeCommitBox =
                cls.includes('form-control') ||
                aria.includes('commit') ||
                aria.includes('description') ||
                name.includes('message') ||
                name.includes('description') ||
                name.includes('feedback') ||
                name.includes('filename');

            if (looksLikeCommitBox) continue;

            const looksLikeEditor =
                c.selector !== 'textarea' ||
                cls.includes('file-editor') ||
                cls.includes('cm-') ||
                aria.includes('editor') ||
                aria.includes('code') ||
                aria.includes('file');

            if (looksLikeEditor) {
                return c.el;
            }
        }

        return null;
    }

    async function injectIntoGitHubEditor(newText) {
        const target = locateGitHubEditor();

        if (!target) {
            warn('No GitHub editor target found');
            showToast('No GitHub editor found', '#b91c1c');
            return false;
        }

        log('Chosen editor target:', {
            tag: target.tagName || '',
            className: target.className || '',
            ariaLabel: target.getAttribute('aria-label') || '',
            name: target.getAttribute('name') || '',
            isContentEditable: !!target.isContentEditable
        });

        try {
            target.focus();
        } catch (err) {
            warn('Focus failed:', err);
        }

        if (target.tagName === 'TEXTAREA') {
            try {
                const desc = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value');
                const nativeSetter = desc && desc.set ? desc.set : null;

                if (nativeSetter) {
                    nativeSetter.call(target, newText);
                } else {
                    target.value = newText;
                }

                target.dispatchEvent(new InputEvent('input', {
                    bubbles: true,
                    data: newText,
                    inputType: 'insertText'
                }));
                target.dispatchEvent(new Event('change', { bubbles: true }));

                log('Textarea inject OK, len =', target.value.length);
                return true;
            } catch (err) {
                warn('Textarea inject failed:', err);
            }
        }

        if (target.isContentEditable) {
            try {
                target.focus();

                const sel = window.getSelection();
                if (sel) sel.removeAllRanges();

                const range = document.createRange();
                range.selectNodeContents(target);
                range.collapse(true);

                if (sel) sel.addRange(range);

                const ok = await new Promise(function (resolve) {
                    requestAnimationFrame(function () {
                        try {
                            const worked = document.execCommand('selectAll') &&
                                           document.execCommand('insertText', false, newText);
                            resolve(!!worked);
                        } catch (err) {
                            resolve(false);
                        }
                    });
                });

                if (ok) {
                    log('Contenteditable inject OK via execCommand');
                    return true;
                }

                target.textContent = newText;
                target.dispatchEvent(new InputEvent('input', {
                    bubbles: true,
                    data: newText,
                    inputType: 'insertText'
                }));

                log('Contenteditable inject OK via fallback');
                return true;
            } catch (err) {
                warn('Contenteditable inject failed:', err);
            }
        }

        showToast('Paste failed', '#b91c1c');
        return false;
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

            setTimeout(function () {
                URL.revokeObjectURL(url);
                if (a.parentNode) a.parentNode.removeChild(a);
            }, 1000);

            log('Download triggered, len =', text.length);
            return true;
        } catch (err) {
            warn('Download failed:', err);
            return false;
        }
    }

    async function setPayloadFromText(text, sourceName) {
        const ok = gmSet(KEYS.payload, text);

        if (!ok) {
            warn('Failed to store payload from', sourceName);
            showToast('Copy failed', '#b91c1c');
            return false;
        }

        log(sourceName + ' copied payload, len =', text.length);
        showToast('Copied ' + text.length + ' chars', '#166534');
        return true;
    }

    function createSourceButton(label) {
        const btn = document.createElement('button');
        btn.textContent = label;
        btn.className = 'hubgee2-btn';
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
        btn.style.boxShadow = '0 4px 10px rgba(0,0,0,.18)';
        return btn;
    }

    function initGemini() {
        log('Gemini init at', location.href);

        setInterval(function () {
            if (!window.location.pathname.startsWith('/app/')) return;

            const codeBlocks = document.querySelectorAll('pre');

            codeBlocks.forEach(function (block, index) {
                if (block.classList.contains('hubgee2-injected')) return;
                block.classList.add('hubgee2-injected');

                const blockNum = index + 1;
                const defaultLabel = `📦 Copy Block #${blockNum}`;
                const btn = createSourceButton(defaultLabel);
                
                // Using the updated dual-target armWorkingOnPress
                const pressState = armWorkingOnPress(btn, btn);

                btn.addEventListener('click', async function (e) {
                    e.preventDefault();

                    pressState.confirmWorking();
                    await new Promise(r => setTimeout(r, 150));

                    try {
                        let rawCode = block.innerText || block.textContent || '';
                        rawCode = rawCode.replace(/\u00a0/g, ' ');
                        const ok = await setPayloadFromText(rawCode, 'Gemini');

                        pressState.resetWorking(ok ? `✅ Copied #${blockNum}` : defaultLabel);

                        setTimeout(function () {
                            btn.textContent = defaultLabel;
                        }, 1600);
                    } catch (err) {
                        warn('Gemini copy failed:', err);
                        pressState.resetWorking(defaultLabel);
                        showToast('Copy failed', '#b91c1c');
                    }
                });

                if (block.parentNode) {
                    block.parentNode.insertBefore(btn, block);
                }
            });
        }, 1200);
    }

    function extractChatGPTCodeText(pre) {
        const cmReadonly = pre.querySelector('.cm-content.q9tKkq_readonly');
        if (cmReadonly) {
            return (cmReadonly.innerText || cmReadonly.textContent || '').replace(/\u00a0/g, ' ');
        }

        const cmContent = pre.querySelector('.cm-content');
        if (cmContent) {
            return (cmContent.innerText || cmContent.textContent || '').replace(/\u00a0/g, ' ');
        }

        return (pre.innerText || pre.textContent || '').replace(/\u00a0/g, ' ');
    }

    function initChatGPT() {
        log('ChatGPT init at', location.href);

        setInterval(function () {
            const codeBlocks = document.querySelectorAll('pre');

            codeBlocks.forEach(function (pre, index) {
                if (pre.classList.contains('hubgee2-injected')) return;

                const hasCodeViewer =
                    pre.querySelector('#code-block-viewer') ||
                    pre.querySelector('.cm-editor') ||
                    pre.querySelector('.cm-content');

                if (!hasCodeViewer) return;

                pre.classList.add('hubgee2-injected');

                const blockNum = index + 1;
                const defaultLabel = `📦 Copy Block #${blockNum}`;
                const btn = createSourceButton(defaultLabel);
                const pressState = armWorkingOnPress(btn, btn);

                btn.addEventListener('click', async function (e) {
                    e.preventDefault();

                    pressState.confirmWorking();
                    await new Promise(r => setTimeout(r, 150));

                    try {
                        const rawCode = extractChatGPTCodeText(pre);
                        const ok = await setPayloadFromText(rawCode, 'ChatGPT');

                        pressState.resetWorking(ok ? `✅ Copied #${blockNum}` : defaultLabel);

                        setTimeout(function () {
                            btn.textContent = defaultLabel;
                        }, 1600);
                    } catch (err) {
                        warn('ChatGPT copy failed:', err);
                        pressState.resetWorking(defaultLabel);
                        showToast('Copy failed', '#b91c1c');
                    }
                });

                if (pre.parentNode) {
                    pre.parentNode.insertBefore(btn, pre);
                }
            });
        }, 1200);
    }

    function ensureGitHubButton() {
        const onEditPage = window.location.pathname.includes('/edit/');
        const existing = document.getElementById('hubgee2-github-container');

        if (!onEditPage) {
            if (existing) existing.remove();
            return;
        }

        if (existing) {
            const btn = existing.querySelector('button');
            if (btn && !btn.classList.contains('hubgee2-working')) {
                btn.textContent = modeLabel(getMode());
            }
            return;
        }

        // ==========================================
        // YTMNT DRAG ENGINE INTEGRATION
        // ==========================================
        const wrap = document.createElement('div');
        wrap.id = 'hubgee2-github-container';
        wrap.style.cssText = `
            position: fixed; top: 0; left: 0; z-index: 2147483645;
            touch-action: none; user-select: none; -webkit-user-select: none;
            transition: transform 0.15s cubic-bezier(0.34, 1.56, 0.64, 1);
            cursor: pointer; -webkit-tap-highlight-color: transparent;
        `;

        let savedPos = gmGet(KEYS.btnPos, null);
        if (!savedPos || typeof savedPos.x !== 'number') {
            savedPos = { x: window.innerWidth - 110, y: window.innerHeight - 80 };
        }
        
        // Initial clamp just in case screen size changed while offline
        const initMaxX = Math.max(0, window.innerWidth - 110);
        const initMaxY = Math.max(0, window.innerHeight - 60);
        savedPos.x = Math.max(5, Math.min(savedPos.x, initMaxX));
        savedPos.y = Math.max(5, Math.min(savedPos.y, initMaxY));
        wrap.style.transform = `translate(${savedPos.x}px, ${savedPos.y}px)`;

        const actionBtn = document.createElement('button');
        actionBtn.textContent = modeLabel(getMode());
        actionBtn.className = 'hubgee2-btn';
        actionBtn.style.padding = '16px 20px';
        actionBtn.style.background = '#dc2626';
        actionBtn.style.color = '#fff';
        actionBtn.style.border = 'none';
        actionBtn.style.borderRadius = '8px';
        actionBtn.style.fontWeight = 'bold';
        actionBtn.style.fontSize = '16px';
        actionBtn.style.fontFamily = 'sans-serif';
        actionBtn.style.boxShadow = '0 4px 10px rgba(0,0,0,.35)';
        // Pass pointer events through to the wrapper so dragging is uninterrupted
        actionBtn.style.pointerEvents = 'none'; 

        wrap.appendChild(actionBtn);
        document.body.appendChild(wrap);

        // The wrapper accepts the touch, but the button visually updates
        const pressState = armWorkingOnPress(wrap, actionBtn);

        wrap.addEventListener('contextmenu', function (e) {
            e.preventDefault();
            const next = cycleMode();
            if (!actionBtn.classList.contains('hubgee2-working')) {
                actionBtn.textContent = modeLabel(next);
            }
            showToast('Mode: ' + modeLabel(next), '#7c3aed');
        });

        async function triggerAction() {
            const incoming = gmGet(KEYS.payload, '');

            if (!incoming || typeof incoming !== 'string') {
                warn('Payload empty or invalid');
                showToast('Buffer empty', '#b91c1c');
                return;
            }

            const mode = getMode();
            log('Action mode =', mode, 'len =', incoming.length);

            pressState.confirmWorking();
            await nextFrame();

            try {
                if (mode === 'download') {
                    const ok = downloadPayload(incoming);
                    pressState.resetWorking(modeLabel(getMode()));

                    if (ok) {
                        showToast('Downloaded ' + incoming.length + ' chars', '#166534');
                    } else {
                        showToast('Download failed', '#b91c1c');
                    }
                    return;
                }

                const ok = await injectIntoGitHubEditor(incoming);
                pressState.resetWorking(modeLabel(getMode()));

                if (ok) {
                    showToast('Pasted ' + incoming.length + ' chars', '#166534');
                } else {
                    warn('Paste failed');
                    showToast('Paste failed', '#b91c1c');
                }
            } catch (err) {
                warn('Action failed:', err);
                pressState.resetWorking(modeLabel(getMode()));
                showToast('Action failed', '#b91c1c');
            }
        }

        let isDragging = false;
        let isLongPress = false;
        let longPressTimer;

        const handleStart = (e) => {
            if (e.pointerType === 'mouse' && e.button !== 0) return;
            if (e.cancelable) e.preventDefault();

            isDragging = true;
            isLongPress = false;
            let hasMoved = false;

            const startX = e.clientX;
            const startY = e.clientY;
            const initialPos = { ...savedPos };

            wrap.style.transform = `translate(${initialPos.x}px, ${initialPos.y}px) scale(0.92)`;

            longPressTimer = setTimeout(() => {
                isLongPress = true;
                const next = cycleMode();
                if (!actionBtn.classList.contains('hubgee2-working')) {
                    actionBtn.textContent = modeLabel(next);
                }
                showToast('Mode: ' + modeLabel(next), '#7c3aed');

                wrap.style.transform = `translate(${savedPos.x}px, ${savedPos.y}px) scale(1.1)`;
                setTimeout(() => {
                    if (isDragging) {
                        wrap.style.transform = `translate(${savedPos.x}px, ${savedPos.y}px) scale(0.92)`;
                    }
                }, 150);
            }, 550);

            const handleMove = (moveEvent) => {
                if (moveEvent.cancelable) moveEvent.preventDefault();
                const dx = moveEvent.clientX - startX;
                const dy = moveEvent.clientY - startY;

                if (Math.abs(dx) > 5 || Math.abs(dy) > 5) {
                    hasMoved = true;
                    clearTimeout(longPressTimer);

                    let nextX = initialPos.x + dx;
                    let nextY = initialPos.y + dy;

                    const rect = wrap.getBoundingClientRect();
                    // Divide by scale factor to get raw bounds
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

                isDragging = false;
                wrap.style.transform = `translate(${savedPos.x}px, ${savedPos.y}px) scale(1.0)`;

                if (hasMoved) {
                    gmSet(KEYS.btnPos, savedPos);
                } else if (!isLongPress) {
                    triggerAction();
                }
            };

            window.addEventListener('pointermove', handleMove, { passive: false });
            window.addEventListener('pointerup', handleEnd, { passive: false });
            window.addEventListener('pointercancel', handleEnd, { passive: false });
        };

        wrap.addEventListener('pointerdown', handleStart);

        // Expose state so the resize listener can dynamically fix the bounds
        wrap.hubgeePos = savedPos;

        log('Action button added at', location.href, 'mode =', getMode());
    }

    function initGitHub() {
        log('GitHub init at', location.href);

        ensureGitHubButton();
        setInterval(ensureGitHubButton, 800);

        let lastUrl = location.href;
        setInterval(function () {
            if (location.href !== lastUrl) {
                lastUrl = location.href;
                log('GitHub URL changed to', lastUrl);
                ensureGitHubButton();
            }
        }, 500);

        // Auto-Recovery on resize / rotation (from YTMNT logic)
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

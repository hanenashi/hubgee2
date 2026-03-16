// ==UserScript==
// @name         Hubgee2 - Copy Paste Bridge
// @namespace    https://github.com/hanenashi
// @version      0.5
// @description  Copy code blocks from Gemini directly into the GitHub web editor without using the clipboard.
// @author       hanenashi
// @match        https://gemini.google.com/*
// @match        https://github.com/*
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

    const isGemini = window.location.hostname === 'gemini.google.com' &&
                     window.location.pathname.startsWith('/app/');
    const isGitHub = window.location.hostname === 'github.com';

    const KEYS = {
        payload: 'hubgee2_payload',
        btnPos: 'hubgee2_btn_pos'
    };

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

    function clampToViewport(el, x, y) {
        const rect = el.getBoundingClientRect();
        const maxX = Math.max(0, window.innerWidth - rect.width);
        const maxY = Math.max(0, window.innerHeight - rect.height);
        return {
            x: Math.max(0, Math.min(x, maxX)),
            y: Math.max(0, Math.min(y, maxY))
        };
    }

    function applySavedPosition(el, key) {
        const saved = gmGet(key, null);
        if (saved && typeof saved.x === 'number' && typeof saved.y === 'number') {
            el.style.left = saved.x + 'px';
            el.style.top = saved.y + 'px';
            el.style.right = 'auto';
            el.style.bottom = 'auto';
        }
    }

    function makeDraggable(el, handle, saveKey) {
        let isDragging = false;
        let moved = false;
        let startClientX = 0;
        let startClientY = 0;
        let offsetX = 0;
        let offsetY = 0;
        const dragThreshold = 6;

        function start(clientX, clientY) {
            const rect = el.getBoundingClientRect();
            isDragging = true;
            moved = false;
            startClientX = clientX;
            startClientY = clientY;
            offsetX = clientX - rect.left;
            offsetY = clientY - rect.top;
        }

        function move(clientX, clientY) {
            if (!isDragging) return;

            const dx = clientX - startClientX;
            const dy = clientY - startClientY;
            const distance = Math.sqrt(dx * dx + dy * dy);

            if (!moved && distance < dragThreshold) {
                return;
            }

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

            if (moved) {
                const rect = el.getBoundingClientRect();
                gmSet(saveKey, { x: rect.left, y: rect.top });
            }
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

    function findGeminiCodeText(block) {
        if (!block) return '';
        let raw = block.innerText || block.textContent || '';
        raw = raw.replace(/\u00a0/g, ' ');
        return raw;
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

    function injectIntoGitHubEditor(newText) {
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

                // A tiny delay helps CodeMirror settle focus before insertText.
                return new Promise(function (resolve) {
                    requestAnimationFrame(function () {
                        try {
                            const ok = document.execCommand('selectAll') &&
                                       document.execCommand('insertText', false, newText);

                            if (ok) {
                                log('Contenteditable inject OK via execCommand');
                                resolve(true);
                                return;
                            }

                            target.textContent = newText;
                            target.dispatchEvent(new InputEvent('input', {
                                bubbles: true,
                                data: newText,
                                inputType: 'insertText'
                            }));

                            log('Contenteditable inject OK via fallback');
                            resolve(true);
                        } catch (err) {
                            warn('Contenteditable inject failed:', err);
                            resolve(false);
                        }
                    });
                });
            } catch (err) {
                warn('Contenteditable inject failed:', err);
            }
        }

        showToast('Paste failed', '#b91c1c');
        return false;
    }

    function initGemini() {
        log('Gemini init at', location.href);

        setInterval(function () {
            if (!window.location.pathname.startsWith('/app/')) return;

            const codeBlocks = document.querySelectorAll('pre');

            codeBlocks.forEach(function (block) {
                if (block.classList.contains('hubgee2-injected')) return;
                block.classList.add('hubgee2-injected');

                const btn = document.createElement('button');
                btn.textContent = 'Copy';
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

                    if (!ok) {
                        warn('Failed to store payload');
                        showToast('Copy failed', '#b91c1c');
                        return;
                    }

                    log('Copied payload, len =', rawCode.length);

                    btn.textContent = 'Copied';
                    btn.style.background = '#15803d';
                    showToast('Copied ' + rawCode.length + ' chars', '#166534');

                    setTimeout(function () {
                        btn.textContent = 'Copy';
                        btn.style.background = '#2563eb';
                    }, 1600);
                });

                if (block.parentNode) {
                    block.parentNode.insertBefore(btn, block);
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

        if (existing) return;

        const wrap = document.createElement('div');
        wrap.id = 'hubgee2-github-container';
        wrap.style.position = 'fixed';
        wrap.style.right = '20px';
        wrap.style.bottom = '20px';
        wrap.style.zIndex = '2147483645';

        const pasteBtn = document.createElement('button');
        pasteBtn.textContent = 'Paste';
        pasteBtn.style.padding = '16px 20px';
        pasteBtn.style.background = '#dc2626';
        pasteBtn.style.color = '#fff';
        pasteBtn.style.border = 'none';
        pasteBtn.style.borderRadius = '8px';
        pasteBtn.style.fontWeight = 'bold';
        pasteBtn.style.fontSize = '16px';
        pasteBtn.style.fontFamily = 'sans-serif';
        pasteBtn.style.boxShadow = '0 4px 10px rgba(0,0,0,.35)';
        pasteBtn.style.cursor = 'pointer';

        wrap.appendChild(pasteBtn);
        document.body.appendChild(wrap);

        applySavedPosition(wrap, KEYS.btnPos);
        const wasDragged = makeDraggable(wrap, wrap, KEYS.btnPos);

        log('Paste button added at', location.href);

        pasteBtn.addEventListener('click', async function (e) {
            e.preventDefault();
            if (wasDragged()) return;

            const incoming = gmGet(KEYS.payload, '');

            if (!incoming || typeof incoming !== 'string') {
                warn('Payload empty or invalid');
                showToast('Buffer empty', '#b91c1c');
                return;
            }

            log('Pasting payload, len =', incoming.length);

            const ok = await injectIntoGitHubEditor(incoming);
            if (ok) {
                showToast('Pasted ' + incoming.length + ' chars', '#166534');
            } else {
                warn('Paste failed');
                showToast('Paste failed', '#b91c1c');
            }
        });
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
    }

    if (isGemini) initGemini();
    if (isGitHub) initGitHub();
})();

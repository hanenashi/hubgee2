# Hubgee2 🚀

**[📦 Install Hubgee2 Userscript](https://raw.githubusercontent.com/hanenashi/hubgee2/main/hubgee2.user.js)**

## TL;DR
Hubgee2 is a Tampermonkey userscript that transfers code blocks directly from Gemini or ChatGPT into the GitHub web editor (or downloads them as a file), completely bypassing the mobile device's clipboard limitations.

## Why this exists
When coding on mobile:
- The Android clipboard often truncates long text payloads.
- The GitHub web editor virtualizes lines, making standard "Select All" and manual pasting buggy and unreliable.
- Transferring large scripts between AI chats and repositories breaks or requires multiple tedious chunks.

Hubgee2 bridges your AI chat tabs and GitHub tabs using Tampermonkey's internal storage (`GM_setValue` / `GM_getValue`) instead of the system clipboard, allowing for massive, instant code transfers. Designed specifically to make mobile development workflows painless.

## ✨ Features
* **Multi-AI Support:** Works natively on `gemini.google.com` and `chatgpt.com`.
* **Zero-Clipboard Transfer:** Payload routes through browser extension storage.
* **Dual Modes:** Paste directly into the GitHub UI, or download the payload instantly as a `.txt` file.
* **Draggable HUD:** The GitHub action button can be dragged anywhere on the screen and remembers its position, with auto-rescue if your mobile keyboard resizes the viewport.

## Basic Usage
1. Install the script from the link above.
2. Open Gemini or ChatGPT and generate your code.
3. Tap the **📦 Copy Block #n** button injected directly above the code block.
4. Open your target file in the GitHub web editor (`github.com/*/edit/*`).
5. Tap the floating **Paste** button in the corner of your screen. The editor's contents will be instantly replaced with your new code.

## ⚙️ Changing Modes (Paste vs. Download)
If you'd rather download the code as a file instead of injecting it into the GitHub editor:
* **Mobile:** Long-press the floating action button to toggle modes.
* **Desktop:** Right-click the floating action button to toggle modes.
The button will update to say **Download**, and tapping it will instantly save your copied payload as `code.txt`.

## 🔬 The Technical Deep Dive (How it actually works)
For the nerds, here is exactly how Hubgee2 bypasses modern frontend security and virtualization traps:

### 1. The Heist (Extraction)
* **On Gemini:** The script hunts for standard `<pre>` tags. When you tap copy, it rips the `innerText`, specifically scrubbing out hidden non-breaking spaces (`\u00a0`) that Google uses for formatting, which would otherwise break code compilation.
* **On ChatGPT:** OpenAI uses a read-only CodeMirror 6 instance. The script specifically targets `.cm-content.q9tKkq_readonly` or `.cm-content` to extract the raw string directly from the syntax highlighter's DOM layer before falling back to the raw `<pre>` wrapper.

### 2. The Smuggling (Transfer)
Instead of passing the massive string to the Android OS clipboard (which has aggressive memory limits and truncation algorithms), it writes the payload directly into Tampermonkey's local database using `GM_setValue`. The GitHub tab constantly monitors this isolated SQLite/LevelDB storage bridge.

### 3. The Nuke (Injection)
GitHub's web editor is a heavily virtualized React application (running Monaco or CodeMirror). If you just change the HTML, React ignores it. If you use `document.execCommand('selectAll')`, it only grabs the 200 lines currently rendered on your screen. Hubgee2 uses two brute-force methods to bypass this:
* **The React Setter Hack:** If the target is a `<textarea>`, the script reaches into the browser's raw prototype (`Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set`) to steal the native setter function that React hijacked. It force-feeds the text directly into the element, then manually fires synthetic `InputEvent` and `change` events to trick React's state manager into thinking a human rapidly typed it.
* **The ContentEditable Bypass:** If GitHub is using the newer `contenteditable` CodeMirror engine, the script mathematically selects the entire node range (`window.getSelection().addRange()`), collapses it, and fires a native `document.execCommand('insertText')`. This executes at the browser engine level, forcing the virtual DOM to accept the entire payload at once, regardless of how many lines are currently hidden off-screen.

## Requirements
* An Android browser with extension support (Kiwi, Edge, etc.).
* A userscript manager like Tampermonkey or Violentmonkey.
* Both the AI tab (Gemini/ChatGPT) and the GitHub tab must be open in the same browser profile.

Hubgee2

Install:
https://raw.githubusercontent.com/hanenashi/hubgee2/main/hubgee2.user.js


TL;DR

Hubgee2 is a Tampermonkey userscript that sends code blocks directly from the Gemini web UI into the GitHub web editor.

It bypasses the mobile clipboard, which often truncates large code blocks on Android browsers.


Why this exists

When coding on mobile:

- Android clipboard cuts long text
- GitHub web editor virtualizes lines
- Copy/paste becomes unreliable
- large scripts break during transfer

Hubgee2 bridges Gemini and GitHub tabs using Tampermonkey storage instead of the system clipboard.


Requirements

- Android browser with extension support
  (Kiwi, Edge, etc.)
- Tampermonkey or Violentmonkey
- Both Gemini and GitHub open in the same browser


Basic usage

1. Install the script from the link above.
2. Open Gemini and generate code.
3. Press the "Push" button above the code block.
4. Open a GitHub file editor page.
5. Press "NUKE & PULL".
6. The editor is replaced with the pushed code.


Notes

The script uses GM_setValue / GM_getValue to transfer payloads between tabs.
No clipboard is used.

Designed mainly for mobile development workflows.


Repository

https://github.com/hanenashi/hubgee2

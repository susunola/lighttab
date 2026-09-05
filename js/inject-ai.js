/**
 * LightTab - AI site auto-search injection (Doubao / ChatGPT, generic)
 * (The version number lives solely in manifest.json; file headers no longer track it.)
 *
 * Runs automatically when LightTab opens <site>/?lt_auto=1&lt_k=<nonce>:
 * 1) Read lt.pending.<nonce> = { p, t } from extension storage to recover the full prompt (never in the URL).
 * 2) Wait for the chat input to appear -> fill in the text -> trigger send (send button first, Enter as fallback).
 * 3) On success, strip lt_k / lt_auto / q from the URL so a refresh does not resend.
 *
 * Graceful degradation: without extension storage (opened with a plaintext ?q=) it reads the q parameter instead.
 * v3 changes:
 *  - Adds the lt_k nonce channel. Concurrent targets share one nonce, so the content script only reads
 *    and never deletes; replay protection is URL cleanup after send + TTL orphan sweeping on newtab boot.
 *  - Plaintext ?q= remains a fallback (preview mode, or storage unavailable).
 * v2 fixes (retained):
 *  - Injected at run_at=document_start and snapshots URL params immediately, so an SPA cannot clear
 *    the search string before the guard reads it.
 *  - Input detection now prefers visibility + largest area (ChatGPT puts a new chat's input mid-page).
 *  - Send-button detection adds a visibility filter and a priority order (data-testid=send-button -> aria-label -> class name).
 *  - Three fallbacks for filling text: execCommand insertText -> a synthetic clipboard paste event -> direct assignment.
 *  - After sending, polls until the input clears to confirm success; logs each stage to the console for debugging.
 */
(() => {
  'use strict';
  const log = (...a) => { try { console.info('[LightTab]', ...a); } catch (_) {} };

  // Snapshot the params immediately (we run at document_start, before the SPA takes over the URL).
  const qs = new URLSearchParams(location.search);
  const armed = qs.get('lt_auto') === '1';
  if (!armed) return;
  const q = (qs.get('q') || '').trim();
  const ltK = qs.get('lt_k') || '';
  if (!q && !ltK) return;
  log('armed, url q =', q.length, ', lt_k =', ltK ? 'yes' : 'no');

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const INPUT_SELECTORS = [
    '#prompt-textarea',
    'div[contenteditable="true"][role="textbox"]',
    'div[contenteditable="true"]',
    '[role="textbox"]',
    'textarea'
  ];
  const PENDING_PREFIX = 'lt.pending.';

  /** Read the prompt for this nonce from extension storage (shared across targets: read-only, never deleted; returns null on failure so the URL fallback kicks in). */
  function readPending(nonce) {
    return new Promise((resolve) => {
      let done = false;
      const finish = (v) => { if (!done) { done = true; resolve(v); } };
      // Never hang main(): if the extension context is torn down mid-read the callback never
      // fires, so time out and let the plaintext-URL fallback take over.
      setTimeout(() => finish(null), 3000);
      try {
        if (window.chrome && chrome.storage && chrome.storage.local) {
          chrome.storage.local.get(PENDING_PREFIX + nonce, (r) => {
            try {
              if (chrome.runtime && chrome.runtime.lastError) return finish(null);
              const rec = r && r[PENDING_PREFIX + nonce];
              finish(rec && typeof rec.p === 'string' ? rec.p : null);
            } catch (_) { finish(null); }
          });
        } else {
          finish(null);
        }
      } catch (_) { finish(null); }
    });
  }

  function clearParams() {
    try {
      const sp = new URLSearchParams(location.search);
      sp.delete('q');
      sp.delete('lt_auto');
      sp.delete('lt_k');
      const s = sp.toString();
      history.replaceState(null, '', location.pathname + (s ? '?' + s : '') + location.hash);
    } catch (_) { /* ignore */ }
  }

  /** Roughly visible in the viewport (covers fixed and normal flow elements). */
  function isVisible(el) {
    try {
      const st = getComputedStyle(el);
      if (st.display === 'none' || st.visibility === 'hidden') return false;
      const r = el.getBoundingClientRect();
      if (r.width < 16 || r.height < 8) return false; // send buttons are often 28-40px icons, so keep the threshold loose
      if (r.bottom < 0 || r.top > window.innerHeight) return false;
      return true;
    } catch (_) {
      return false;
    }
  }

  /** Find the visible chat input: filter by visibility, then take the largest area (matches ChatGPT's centred box and Doubao's bottom bar). */
  function pickInput() {
    let best = null, bestArea = 0;
    for (const sel of INPUT_SELECTORS) {
      const nodes = document.querySelectorAll(sel);
      for (const el of nodes) {
        if (!isVisible(el)) continue;
        const r = el.getBoundingClientRect();
        const area = r.width * r.height;
        if (area > bestArea) { bestArea = area; best = el; }
      }
    }
    return best;
  }

  /** Find the send button: data-testid=send-button > aria-label (English or Chinese) > class name. All must be visible and enabled. */
  function findSendBtn() {
    const cands = document.querySelectorAll('button, [role="button"], [data-testid]');
    let fallback = null;
    for (const b of cands) {
      if (b.disabled || b.getAttribute('aria-disabled') === 'true') continue;
      if (!isVisible(b)) continue;
      const tid = (b.getAttribute && (b.getAttribute('data-testid') || '')) || '';
      const label = (b.getAttribute && (b.getAttribute('aria-label') || '')) || '';
      const text = (b.textContent || '').trim();
      const cls = typeof b.className === 'string' ? b.className : '';
      if (tid === 'send-button') return b;                                     // 1) official ChatGPT testid
      if (/^(send prompt|发送|发送消息|send)$/i.test(label.trim()) || /发送|send prompt/i.test(label)) return b; // 2) exact aria-label (Chinese literals match Doubao's localised UI)
      if (/send/i.test(tid + ' ' + label + ' ' + text)) return b;
      if (!fallback && /send/i.test(cls)) fallback = b;                        // 3) class-name fallback (keep the first match)
    }
    return fallback;
  }

  function currentValue(el) {
    try { return (el.value !== undefined ? el.value : el.textContent) || ''; } catch (_) { return ''; }
  }

  function tryExec(el, text) {
    try {
      el.focus();
      const range = document.createRange();
      range.selectNodeContents(el);
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
      document.execCommand('insertText', false, text);
      sel.removeAllRanges();
      return true;
    } catch (_) { return false; }
  }

  function tryPaste(el, text) {
    try {
      el.focus();
      const dt = new DataTransfer();
      dt.setData('text/plain', text);
      const ev = new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true });
      if (ev.clipboardData && ev.clipboardData.getData('text/plain')) {
        el.dispatchEvent(ev);
        return true;
      }
    } catch (_) { /* ClipboardEvent construction may be unsupported */ }
    return false;
  }

  async function fillInput(el, text) {
    if (el.tagName === 'TEXTAREA' || el.tagName === 'INPUT') {
      const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      const setter = Object.getOwnPropertyDescriptor(proto, 'value').set;
      setter.call(el, text);
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    }
    // contenteditable: try execCommand first, then a synthetic InputEvent, then the paste path.
    tryExec(el, text);
    await sleep(150);
    if (currentValue(el).trim() === text) return true;
    el.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: text }));
    await sleep(150);
    if (currentValue(el).trim() === text) return true;
    tryPaste(el, text);
    await sleep(200);
    return currentValue(el).trim() === text;
  }

  async function pressSend(input) {
    // 1) Prefer clicking the send button (wait for it to render and become enabled).
    for (let i = 0; i < 60; i++) {
      const btn = findSendBtn();
      if (btn) {
        try { btn.click(); log('clicked send button'); } catch (_) {}
        return true;
      }
      await sleep(150);
    }
    // 2) Fall back to pressing Enter.
    log('no send button found, fallback Enter');
    try {
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true, cancelable: true }));
      input.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true }));
    } catch (_) {}
    return true;
  }

  /** After sending, poll until the input clears to confirm success (0.2s x 25 ~= 5s). */
  async function waitCleared(input) {
    for (let i = 0; i < 25; i++) {
      await sleep(200);
      if (!currentValue(input).trim()) { log('input cleared, send confirmed'); return true; }
    }
    log('input not cleared within 5s (may still be sent)');
    return false;
  }

  async function main(text) {
    for (let i = 0; i < 80; i++) { // up to ~20s (SPA boot / login redirects)
      const input = pickInput();
      if (input) {
        log('input found:', input.tagName, input.id || input.className || '');
        await sleep(400); // give the site's own URL prefill a chance to run first
        let filled = currentValue(input).trim();
        if (!filled) {
          filled = await fillInput(input, text);
          log('fill result:', filled ? 'ok' : 'FAILED', '| now =', (currentValue(input) || '').slice(0, 30));
        } else {
          log('site pre-filled already, skip manual fill');
        }
        if (filled) {
          await pressSend(input);
          await waitCleared(input);
        } else {
          log('give up: could not fill text into input');
          fallbackCopyAndNotify('未能把 Prompt 填入输入框', 'could not fill the prompt into the input box', text);
        }
        setTimeout(clearParams, 800);
        return;
      }
      await sleep(250);
    }
    log('timeout: no input box found (maybe not logged in)');
    fallbackCopyAndNotify('未找到对话输入框（可能未登录或页面结构已变更）', 'no chat input box found (maybe not logged in, or the page layout changed)', text);
    clearParams();
  }

  // ---------- Failure fallback: copy the prompt to the clipboard + show an in-page notice ----------
  async function copyPrompt(text) {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text);
        return true;
      }
    } catch (_) { /* fails when the page is not focused, etc. - fall through to execCommand */ }
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.cssText = 'position:fixed;opacity:0';
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand('copy');
      ta.remove();
      return !!ok;
    } catch (_) { return false; }
  }

  // The content script has no access to the newtab toast, so inject a floating notice bar instead.
  function notify(msg) {
    try {
      const tip = document.createElement('div');
      tip.style.cssText = 'position:fixed;left:50%;bottom:32px;transform:translateX(-50%);max-width:72vw;'
        + 'background:rgba(20,26,44,.94);color:#fff;padding:10px 16px;border-radius:10px;font-size:13px;'
        + 'line-height:1.5;z-index:2147483647;border:1px solid rgba(255,255,255,.2);box-shadow:0 8px 24px rgba(0,0,0,.35)';
      tip.textContent = msg;
      (document.body || document.documentElement).appendChild(tip);
      setTimeout(() => tip.remove(), 8000);
    } catch (_) { /* ignore */ }
  }

  // The content script does not load i18n.js (it is not declared in the manifest), so the notice is
  // bilingual and picks a language from the browser locale.
  const isZh = () => String(navigator.language || 'zh').toLowerCase().startsWith('zh');
  async function fallbackCopyAndNotify(reasonZh, reasonEn, text) {
    const ok = await copyPrompt(text);
    const reason = isZh() ? reasonZh : reasonEn;
    notify(ok
      ? (isZh() ? `LightTab：${reason}，Prompt 已复制到剪贴板，请在输入框粘贴后手动发送`
                : `LightTab: ${reason}. The prompt has been copied to your clipboard — paste and send it manually`)
      : (isZh() ? `LightTab：${reason}，且复制到剪贴板失败，请手动输入 Prompt`
                : `LightTab: ${reason}, and copying to the clipboard failed — please type the prompt manually`));
  }

  // Resolve the final text: lt_k wins (extension channel); otherwise fall back to the plaintext q in the URL.
  (async () => {
    let text = q;
    if (ltK) {
      const fromStorage = await readPending(ltK);
      if (fromStorage) { text = fromStorage; log('prompt from storage nonce, len =', text.length); }
      else log('nonce not found in storage, fallback to url q');
    }
    if (!text) { log('no prompt text, abort'); clearParams(); return; }
    if (document.visibilityState === 'visible') main(text);
    else document.addEventListener('visibilitychange', () => main(text), { once: true });
  })();
})();

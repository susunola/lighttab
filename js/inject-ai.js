/**
 * LightTab v1.10.0 · AI 站点自动搜索注入（豆包 / ChatGPT 通用 · v3）
 *
 * 由 LightTab 打开 <site>/?lt_auto=1&lt_k=<nonce> 时自动执行：
 * 1) 从扩展 storage 读取 lt.pending.<nonce> = { p, t } 取回完整 prompt（明文不落 URL）
 * 2) 等待聊天输入框出现 → 填入文本 → 触发发送（发送按钮优先，回车兜底）
 * 3) 成功后清理 URL 上的 lt_k / lt_auto / q 参数，避免刷新重复发送
 *
 * 兼容降级：无扩展 storage 时（直接 ?q= 明文方式打开）退回读 URL 的 q 参数。
 * v3 变更：
 *  - 支持 lt_k nonce 通道（多目标并发共用一个 nonce，内容脚本不删除、只读；
 *    防重放靠发送后清 URL + newtab 启动时按 TTL 清理孤儿）
 *  - ?q= 明文仍作为 fallback（预览模式 / storage 不可用）
 * v2 修复（保留）：
 *  - run_at=document_start 注入并立即快照 URL 参数，避免 SPA 提前清掉 search 导致守卫失效
 *  - 输入框识别改为可见性 + 面积优先（ChatGPT 新会话输入框在页面中部）
 *  - 发送按钮识别增加可见性过滤与优先级（data-testid=send-button → aria-label → 类名）
 *  - 填词三路兜底：execCommand insertText → 剪贴板 paste 事件 → 直接赋值
 *  - 发送后轮询输入框清空判定成功；全程 console 分阶段日志便于排查
 * 仅当 URL 带 lt_auto=1 才激活；无网络请求、无数据上传、全程 try/catch。
 */
(() => {
  'use strict';
  const log = (...a) => { try { console.info('[LightTab]', ...a); } catch (_) {} };

  // 立即快照参数（document_start 执行，SPA 尚未接管 URL）
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

  /** 从扩展 storage 取 nonce 对应的 prompt（多目标共用，只读不删；读失败返回 null 走 URL 兜底） */
  function readPending(nonce) {
    return new Promise((resolve) => {
      try {
        if (window.chrome && chrome.storage && chrome.storage.local) {
          chrome.storage.local.get(PENDING_PREFIX + nonce, (r) => {
            try {
              const rec = r && r[PENDING_PREFIX + nonce];
              resolve(rec && typeof rec.p === 'string' ? rec.p : null);
            } catch (_) { resolve(null); }
          });
        } else {
          resolve(null);
        }
      } catch (_) { resolve(null); }
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

  /** 是否在视口内可见（粗判，覆盖 fixed / 常规流） */
  function isVisible(el) {
    try {
      const st = getComputedStyle(el);
      if (st.display === 'none' || st.visibility === 'hidden') return false;
      const r = el.getBoundingClientRect();
      if (r.width < 16 || r.height < 8) return false; // 发送按钮常为 28-40px 小图标，阈值不可过严
      if (r.bottom < 0 || r.top > window.innerHeight) return false;
      return true;
    } catch (_) {
      return false;
    }
  }

  /** 找可见聊天输入框：可见性过滤 + 面积降序（ChatGPT 居中大框 / 豆包底部框都能命中） */
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

  /** 找发送按钮：data-testid=send-button > aria-label(中英) > 类名；全部要求可见且可用 */
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
      if (tid === 'send-button') return b;                                     // 1) ChatGPT 官方 testid
      if (/^(send prompt|发送|发送消息|send)$/i.test(label.trim()) || /发送|send prompt/i.test(label)) return b; // 2) 精确 aria-label
      if (/send/i.test(tid + ' ' + label + ' ' + text)) return b;
      if (!fallback && /send/i.test(cls)) fallback = b;                        // 3) 类名兜底（保留首个）
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
    } catch (_) { /* ClipboardEvent 构造可能不支持 clipboardData */ }
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
    // contenteditable：execCommand 优先，失败补 InputEvent，再失败走 paste
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
    // 1) 优先点击发送按钮（等它渲染并可用）
    for (let i = 0; i < 60; i++) {
      const btn = findSendBtn();
      if (btn) {
        try { btn.click(); log('clicked send button'); } catch (_) {}
        return true;
      }
      await sleep(150);
    }
    // 2) 回车兜底
    log('no send button found, fallback Enter');
    try {
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true, cancelable: true }));
      input.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true }));
    } catch (_) {}
    return true;
  }

  /** 发送后轮询输入框清空判定成功（0.2s × 25 ≈ 5s） */
  async function waitCleared(input) {
    for (let i = 0; i < 25; i++) {
      await sleep(200);
      if (!currentValue(input).trim()) { log('input cleared, send confirmed'); return true; }
    }
    log('input not cleared within 5s (may still be sent)');
    return false;
  }

  async function main(text) {
    for (let i = 0; i < 80; i++) { // 最长约 20s（SPA / 登录跳转延迟）
      const input = pickInput();
      if (input) {
        log('input found:', input.tagName, input.id || input.className || '');
        await sleep(400); // 留出站点自身 URL 预填生效时间
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
        }
        setTimeout(clearParams, 800);
        return;
      }
      await sleep(250);
    }
    log('timeout: no input box found (maybe not logged in)');
    clearParams();
  }

  // 解析最终文本：lt_k 优先（扩展通道），取不到回落 URL 明文 q
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

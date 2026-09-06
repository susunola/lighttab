/* LightTab - prompts.js
   Prompt template UI: the active chip, the "/" palette, and the Settings -> Templates manager.
   Split out of app.js unchanged. Loads BEFORE app.js (see newtab.html) and reaches shared
   state through window.LT_APP at call time; exposes window.LT_PROMPTS for app.js to call.
*/
(() => {
  'use strict';

  const A = () => window.LT_APP; // lazy: app.js loads after this file

  // ---------- Prompt template UI: active chip + the "/" palette ----------
  function clearActiveTemplate() {
    A().setActivePrompt(null);
    const chip = document.getElementById('tpl-chip');
    if (chip) chip.hidden = true;
    A().setEngine(A().getCurrentEngine().id); // restore the default placeholder text
    const q = document.getElementById('q');
    // Cancelling a template preserves the user input.
  }
  function renderTemplateChip(p) {
    const chip = document.getElementById('tpl-chip');
    if (!p || !chip) return;
    chip.innerHTML = '';
    const nm = document.createElement('span');
    nm.className = 'tpl-name';
    nm.textContent = p.name || A().t('tpl.default');
    nm.title = p.name || A().t('tpl.default');
    const x = document.createElement('button');
    x.type = 'button';
    x.className = 'tpl-x';
    x.setAttribute('aria-label', A().t('tpl.cancel'));
    x.textContent = '×';
    x.addEventListener('click', () => { clearActiveTemplate(); document.getElementById('q').focus(); });
    chip.append(nm, x);
    chip.hidden = false;
  }
  function chooseTemplate(p) {
    if (!p) return;
    closePalette(false);
    A().setActivePrompt(p);
    renderTemplateChip(p);
    const q = document.getElementById('q');
    q.placeholder = p.hint || A().t('tpl.enter_hint');
    if (q.value === '/') q.value = '';
    q.focus();
  }

  // Palette: opened with "/", supports filtering and keyboard selection.
  let palItems = [], palIdx = 0;
  function paletteRows() {
    const inp = document.getElementById('palette-q');
    const kw = (inp ? inp.value : '').trim().toLowerCase();
    const src = A().state.prompts.filter(p => p && typeof p.tmpl === 'string');
    if (!kw) {
      // No query: recently used float to the top (lastUsedAt desc; the sort is stable so unused ones keep their original order).
      return src.slice().sort((a, b) => Number(!!b.favorite)-Number(!!a.favorite) || (b.lastUsedAt || 0) - (a.lastUsedAt || 0));
    }
    return src.filter(p =>
      (p.name || '').toLowerCase().includes(kw) ||
      (p.hint || '').toLowerCase().includes(kw) ||
      (p.tmpl || '').toLowerCase().includes(kw));
  }
  function renderPalette() {
    palItems = paletteRows();
    if (palIdx > palItems.length - 1) palIdx = Math.max(0, palItems.length - 1);
    const ul = document.getElementById('palette-list');
    ul.innerHTML = palItems.map((p, i) => {
      const dots = (p.targets || []).map(id => {
        const e = A().allEngines().find(x => x.id === id);
        return e ? `<i class="p-dot" style="background:${e.color}" title="${A().escapeHtml(A().engName(e))}"></i>` : '';
      }).join('');
      const preview = (p.tmpl || '').replace(/\{q\}/g, '').replace(/\s+/g, ' ').trim().slice(0, 46);
      return `
        <li class="${i === palIdx ? 'active' : ''}" data-i="${i}">
          <span class="p-name">${A().escapeHtml(p.name)}</span>
          <span class="p-dots">${dots || `<span class="p-nodots">${A().t('tpl.no_target')}</span>`}</span>
          <span class="p-preview">${A().escapeHtml(preview || p.hint || '')}</span>
        </li>`;
    }).join('');
    document.getElementById('palette-empty').hidden = palItems.length > 0;
    const act = ul.querySelector('li.active');
    if (act) act.scrollIntoView({ block: 'nearest' });
  }
  function openPalette() {
    const p = document.getElementById('palette');
    if (p.hidden === false) return;
    p.hidden = false;
    document.getElementById('engine-list').hidden = true;
    document.getElementById('palette-q').value = '';
    palIdx = 0;
    renderPalette();
    document.getElementById('palette-q').focus();
  }
  function closePalette(refocus) {
    const p = document.getElementById('palette');
    if (!p || p.hidden) return;
    p.hidden = true;
    if (refocus !== false) document.getElementById('q').focus();
  }
  function bindPalette() {
    const inp = document.getElementById('palette-q');
    inp.addEventListener('input', () => { palIdx = 0; renderPalette(); });
    inp.addEventListener('keydown', e => {
      if (e.key === 'ArrowDown') { e.preventDefault(); palIdx = Math.min(palIdx + 1, palItems.length - 1); renderPalette(); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); palIdx = Math.max(palIdx - 1, 0); renderPalette(); }
      else if (e.key === 'Enter') { e.preventDefault(); const it = palItems[palIdx]; if (it) chooseTemplate(it); }
      else if (e.key === 'Escape') { e.preventDefault(); closePalette(); }
      e.stopPropagation();
    });
    document.getElementById('palette-list').addEventListener('click', e => {
      const li = e.target.closest('li');
      if (!li) return;
      const it = palItems[+li.dataset.i];
      if (it) chooseTemplate(it);
    });
    document.getElementById('palette-close').addEventListener('click', () => closePalette());
    document.getElementById('tpl-open').addEventListener('click', () => {
      const p = document.getElementById('palette');
      if (p.hidden) openPalette(); else closePalette();
    });
  }
  // Template manager (Settings -> Templates): row list + inline editor.
  let promptEditingId = null;
  async function savePrompts() {
    await A().Store.set(A().K.prompts, A().state.prompts);
  }
  function renderPromptManager() {
    const box = document.getElementById('prompt-manage');
    if (!box) return;
    const rows = A().state.prompts.map(p => `
      <div class="prompt-row ${promptEditingId === p.id ? 'open' : ''}" data-id="${A().escapeHtml(p.id)}">
        <div class="pr-main">
          <span class="pr-name" title="${A().escapeHtml(p.name)}">${A().escapeHtml(p.name)}</span>
          <span class="pr-tmpl" title="${A().escapeHtml(p.tmpl || '')}">${A().escapeHtml((p.tmpl || '').slice(0, 40))}</span>
          <span class="pr-tags">${(p.targets || []).map(id => {
            const e = A().allEngines().find(x => x.id === id);
            return e ? `<span class="ptag" style="--pc:${e.color};background:${e.color}20;color:${e.color}">${A().escapeHtml(A().engName(e))}</span>` : '';
          }).join('') || `<span class="ptag dim">${A().t('tpl.no_target')}</span>`}</span>
          <span class="pr-acts">
            <button class="btn ghost sm" data-act="favorite" aria-label="收藏模板" aria-pressed="${!!p.favorite}">${p.favorite?'★':'☆'}</button>
            <button class="btn ghost sm" data-act="clone">${document.documentElement.lang.startsWith('en')?'Duplicate':'复制'}</button>
            <button class="btn ghost sm" data-act="edit">${A().t('prompt.edit')}</button>
            <button class="btn ghost sm danger" data-act="del">${A().t('prompt.del')}</button>
          </span>
        </div>
        ${promptEditingId === p.id ? promptEditorHtml(p) : ''}
      </div>`).join('');
    box.innerHTML = (A().state.prompts.length
      ? rows
      : `<div class="pr-empty">${A().t('prompt.empty')}</div>`)
      + (promptEditingId === 'new' ? promptEditorHtml(null) : '');
    const tools=document.createElement('div');tools.className='pr-acts';
    const en=document.documentElement.lang.startsWith('en');
    const exportButton=document.createElement('button');exportButton.className='btn ghost sm';exportButton.textContent=en?'Export templates':'导出模板';
    exportButton.onclick=()=>{const blob=new Blob([JSON.stringify({format:'lighttab-prompts',prompts:A().state.prompts},null,2)],{type:'application/json'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download='lighttab-prompts.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
    const importButton=document.createElement('button');importButton.className='btn ghost sm';importButton.textContent=en?'Import templates':'导入模板';
    importButton.onclick=()=>{const input=document.createElement('input');input.type='file';input.accept='.json,application/json';input.onchange=async()=>{try{const file=input.files[0];if(!file)return;if(file.size>1000000)throw Error();const data=JSON.parse(await file.text());if(data.format!=='lighttab-prompts'||!Array.isArray(data.prompts))throw Error();const items=window.LT_PURE.sanitizePrompts(data.prompts);if(!items||!items.length)throw Error();if(items.length+A().state.prompts.length>30)return A().showToast(A().t('toast.prompt_limit'));A().state.prompts.push(...items.map(p=>({...p,id:A().nid()})));await savePrompts();renderPromptManager();A().showToast(en?'Templates imported':'模板已导入');}catch(_){A().showToast(en?'Invalid template file':'模板文件无效');}};input.click();};
    tools.append(importButton,exportButton);box.prepend(tools);
    box.querySelectorAll('[data-act]').forEach(b => b.addEventListener('click', () => {
      const row = b.closest('.prompt-row');
      const id = row ? row.dataset.id : null;
      if (b.dataset.act === 'favorite') {const p=A().state.prompts.find(x=>x.id===id);if(p){p.favorite=!p.favorite;savePrompts();renderPromptManager();}}
      if (b.dataset.act === 'clone') {
        if(A().state.prompts.length>=30)return A().showToast(A().t('toast.prompt_limit'));
        const p=A().state.prompts.find(x=>x.id===id);if(p){const copy=JSON.parse(JSON.stringify(p));copy.id=A().nid();copy.name=(copy.name+' 副本').slice(0,24);A().state.prompts.push(copy);savePrompts();renderPromptManager();}
      }
      if (b.dataset.act === 'edit') { promptEditingId = promptEditingId === id ? null : id; renderPromptManager(); }
      if (b.dataset.act === 'del') {
        const p = A().state.prompts.find(x => x.id === id);
        if (p && confirm(A().t('toast.prompt_del_confirm', { name: p.name }))) {
          A().state.prompts = A().state.prompts.filter(x => x.id !== id);
          promptEditingId = null;
          savePrompts();
          renderPromptManager();
          A().showToast(A().t('toast.prompt_deleted'));
        }
      }
    }));
    if (promptEditingId) bindPromptEditor();
  }
  function promptEditorHtml(p) {
    const pv = p || { name: '', tmpl: '', hint: '', targets: [], wb: {} };
    const tg = pv.targets || [];
    const wb = pv.wb || {};
    return `
      <p class="form-tip">${document.documentElement.lang.startsWith('en')?'Use {q} for the main input; add fields such as {language} or {style}.':'用 {q} 表示输入内容，也可添加 {语言}、{风格} 等字段。'}</p>
      <div class="prompt-editor" data-edit-id="${promptEditingId}">
        <label class="pe-field"><span class="pe-lbl">${A().t('prompt.name')}</span>
          <input class="pe-name" type="text" maxlength="24" placeholder="${A().escapeHtml(A().t('prompt.name_ph'))}" value="${A().escapeHtml(pv.name || '')}"></label>
        <label class="pe-field"><span class="pe-lbl">${A().t('prompt.tmpl_label')}</span>
          <textarea class="pe-tmpl" rows="3" maxlength="4000" placeholder="${A().escapeHtml(A().t('prompt.tmpl_ph')).replace(/\n/g, '&#10;')}">${A().escapeHtml(pv.tmpl || '')}</textarea></label>
        <label class="pe-field"><span class="pe-lbl">${A().t('prompt.hint_label')}</span>
          <input class="pe-hint" type="text" maxlength="60" placeholder="${A().escapeHtml(A().t('prompt.hint_ph'))}" value="${A().escapeHtml(pv.hint || '')}"></label>
        <div class="pe-field"><span class="pe-lbl">${A().t('prompt.targets')}</span>
          <div class="pe-targets">${A().allEngines().map(e => `
            <label class="pe-t"><input type="checkbox" value="${e.id}" ${tg.includes(e.id) ? 'checked' : ''}>
            <span class="ptag" style="--pc:${e.color};background:${e.color}20;color:${e.color}">${A().escapeHtml(A().engName(e))}</span></label>`).join('')}
          </div>
        </div>
        <div class="wb-fields" ${tg.includes('wbai') ? '' : 'hidden'}>
          <span class="pe-lbl">${A().t('prompt.wb_label')}</span>
          <div class="wb-grid">
            <input class="pe-wb" data-wbk="expertId" placeholder="expertId" value="${A().escapeHtml(wb.expertId || '')}">
            <input class="pe-wb" data-wbk="model" placeholder="model" value="${A().escapeHtml(wb.model || '')}">
            <input class="pe-wb" data-wbk="mode" placeholder="mode" value="${A().escapeHtml(wb.mode || '')}">
            <input class="pe-wb" data-wbk="cwd" placeholder="cwd" value="${A().escapeHtml(wb.cwd || '')}">
          </div>
        </div>
        <div class="modal-actions">
          <button type="button" class="btn ghost" data-act="cancel">${A().t('prompt.cancel')}</button>
          <button type="button" class="btn primary" data-act="save">${A().t('prompt.save')}</button>
        </div>
      </div>`;
  }
  function bindPromptEditor() {
    const ed = document.querySelector('#prompt-manage .prompt-editor');
    if (!ed) return;
    ed.querySelector('[data-act="cancel"]').addEventListener('click', () => { promptEditingId = null; renderPromptManager(); });
    ed.querySelector('[data-act="save"]').addEventListener('click', () => savePromptEditor(ed));
    ed.querySelectorAll('.pe-targets input').forEach(cb => cb.addEventListener('change', () => {
      const wf = ed.querySelector('.wb-fields');
      if (wf) wf.hidden = !ed.querySelector('.pe-targets input[value="wbai"]').checked;
    }));
  }
  function savePromptEditor(ed) {
    const id = ed.dataset.editId;
    const name = (ed.querySelector('.pe-name').value || '').trim();
    const tmpl = ed.querySelector('.pe-tmpl').value;
    const hint = (ed.querySelector('.pe-hint').value || '').trim();
    if (!name) return A().showToast(A().t('toast.prompt_name_required'));
    if (!tmpl.trim()) return A().showToast(A().t('toast.prompt_tmpl_required'));
    const targets = [...ed.querySelectorAll('.pe-targets input:checked')].map(x => x.value).slice(0, 4);
    const wbOn = targets.includes('wbai');
    const wb = wbOn ? {} : null;
    if (wb) {
      ed.querySelectorAll('.pe-wb').forEach(inp => {
        const v = inp.value.trim();
        if (v) wb[inp.dataset.wbk] = v;
      });
    }
    const rec = { name: name.slice(0, 24), tmpl: tmpl.slice(0, 4000), hint: hint.slice(0, 60), targets, wb };
    if (id === 'new') {
      if (A().state.prompts.length >= 30) return A().showToast(A().t('toast.prompt_limit'));
      A().state.prompts.push({ id: A().nid(), ...rec });
    } else {
      const p = A().state.prompts.find(x => x.id === id);
      if (p) Object.assign(p, rec);
    }
    promptEditingId = null;
    savePrompts();
    renderPromptManager();
    A().showToast(A().t(id === 'new' ? 'toast.prompt_added' : 'toast.prompt_saved'));
  }

  // Settings -> Templates "+" button: toggle the inline editor for a new template.
  function toggleNewPromptEditor() {
    promptEditingId = promptEditingId === 'new' ? null : 'new';
    renderPromptManager();
    const ed = document.querySelector('#prompt-manage .prompt-editor');
    if (ed) { ed.scrollIntoView({ block: 'nearest' }); ed.querySelector('.pe-name').focus(); }
  }

  window.LT_PROMPTS = {
    bindPalette, openPalette, closePalette, clearActiveTemplate,
    renderPromptManager, savePrompts, toggleNewPromptEditor
  };
})();

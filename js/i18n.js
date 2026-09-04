/* LightTab - i18n.js
   Bilingual (zh / en): a pure local dictionary plus t(key, vars) interpolation.
   Exposes window.LT_I18N = { t, setLang, getLang, applyStatic, DICT }.
   - t(key, vars)   look up the current language, interpolating {name} placeholders
   - setLang(lang)  switch language and re-apply every static DOM hook
   ([data-i18n] / -ph / -title / -aria / -html)
   - getLang()      current language ('zh' | 'en')
*/
(function () {
  'use strict';

  const LANGS = ['zh', 'en'];
  let lang = 'zh';

  const DICT = {
    // ---------- Greeting / date ----------
    'greet.morning':   { zh: '早上好', en: 'Good morning' },
    'greet.noon':      { zh: '中午好', en: 'Good afternoon' },
    'greet.afternoon': { zh: '下午好', en: 'Good afternoon' },
    'greet.evening':   { zh: '晚上好', en: 'Good evening' },
    'greet.night':     { zh: '夜深了', en: 'Good night' },
    'chip.morning':    { zh: '早上', en: 'Morning' },
    'chip.noon':       { zh: '中午', en: 'Noon' },
    'chip.afternoon':  { zh: '下午', en: 'Afternoon' },
    'chip.evening':    { zh: '晚上', en: 'Evening' },
    'chip.night':      { zh: '夜深了', en: 'Night' },

    // ---------- Top icon buttons ----------
    'top.wallpaper': { zh: '壁纸', en: 'Wallpaper' },
    'top.settings':  { zh: '设置', en: 'Settings' },

    // ---------- Widget titles ----------
    'widget.clock':    { zh: '时钟', en: 'Clock' },
    'widget.calendar': { zh: '日历', en: 'Calendar' },
    'widget.todo':     { zh: '待办', en: 'To-dos' },

    // ---------- To-dos ----------
    'todo.placeholder': { zh: '添加一件事…', en: 'Add a task…' },
    'todo.aria':        { zh: '待办内容', en: 'To-do item' },
    'todo.add':         { zh: '添加', en: 'Add' },
    'todo.empty':       { zh: '今天要做点什么？', en: 'What needs doing today?' },
    'todo.del':         { zh: '删除', en: 'Delete' },

    // ---------- Calendar ----------
    'cal.prev': { zh: '上月', en: 'Previous month' },
    'cal.next': { zh: '下月', en: 'Next month' },
    'cal.d0': { zh: '日', en: 'Su' },
    'cal.d1': { zh: '一', en: 'Mo' },
    'cal.d2': { zh: '二', en: 'Tu' },
    'cal.d3': { zh: '三', en: 'We' },
    'cal.d4': { zh: '四', en: 'Th' },
    'cal.d5': { zh: '五', en: 'Fr' },
    'cal.d6': { zh: '六', en: 'Sa' },

    // ---------- Search ----------
    'search.label':     { zh: '搜索', en: 'Search' },
    'search.placeholder': { zh: '搜索或输入网址', en: 'Search or enter a URL' },
    'search.placeholder_engine': { zh: '使用 {engine} 搜索，或输入网址回车', en: 'Search with {engine}, or enter a URL' },

    // ---------- AI template palette ----------
    'tpl.title':   { zh: 'AI 模板 ( / )', en: 'AI templates ( / )' },
    'tpl.aria':    { zh: 'AI 模板调色板', en: 'AI template palette' },
    'tpl.cancel':  { zh: '取消模板', en: 'Cancel template' },
    'tpl.default': { zh: '模板', en: 'Template' },
    'tpl.no_target': { zh: '未设目标', en: 'No targets' },
    'tpl.enter_hint': { zh: '输入内容，Enter 发射…', en: 'Type content, Enter to launch…' },
    'palette.search_ph': { zh: '搜索模板…', en: 'Search templates…' },
    'palette.empty': { zh: '没有匹配的模板 —— 到「设置 → 模板」新建一个', en: 'No matching templates — create one in Settings → Templates' },
    'palette.foot_select': { zh: '选择', en: 'select' },
    'palette.foot_use':    { zh: '选用', en: 'use' },
    'palette.foot_close':  { zh: '关闭', en: 'close' },
    'palette.foot_edit': { zh: '设置 → 模板 可增改', en: 'Manage in Settings → Templates' },

    // ---------- Search engine names ----------
    'eng.baidu':    { zh: '百度', en: 'Baidu' },
    'eng.bing':     { zh: '必应', en: 'Bing' },
    'eng.google':   { zh: '谷歌', en: 'Google' },
    'eng.sogou':    { zh: '搜狗', en: 'Sogou' },
    'eng.github':   { zh: 'GitHub', en: 'GitHub' },
    'eng.bilibili': { zh: 'B 站', en: 'Bilibili' },
    'eng.doubao':   { zh: '豆包 AI', en: 'Doubao AI' },
    'eng.openai':   { zh: 'ChatGPT', en: 'ChatGPT' },
    'eng.wbai':     { zh: 'WorkBuddy', en: 'WorkBuddy' },

    // ---------- Wallpapers ----------
    'wp.midnight': { zh: '暮色蓝', en: 'Dusk Blue' },
    'wp.aurora':   { zh: '极光', en: 'Aurora' },
    'wp.violet':   { zh: '暗夜紫', en: 'Night Violet' },
    'wp.teal':     { zh: '青黛', en: 'Teal' },
    'wp.graphite': { zh: '石墨', en: 'Graphite' },
    'wp.rose':     { zh: '暮红', en: 'Dusk Red' },
    'wp.custom':   { zh: '自定义', en: 'Custom' },

    // ---------- Card / context menu ----------
    'card.edit': { zh: '编辑', en: 'Edit' },
    'card.del':  { zh: '删除', en: 'Delete' },
    'ctx.open':  { zh: '在新标签页打开', en: 'Open in new tab' },
    'ctx.copy':  { zh: '复制链接', en: 'Copy link' },
    'ctx.edit':  { zh: '编辑', en: 'Edit' },
    'ctx.del':   { zh: '删除', en: 'Delete' },

    // ---------- Grid empty states ----------
    'grid.empty':      { zh: '暂无快捷方式，点右下角 ＋ 添加', en: 'No shortcuts yet — click ＋ to add' },
    'grid.empty_view': { zh: '该视图暂无快捷方式，点右下角 ＋ 添加', en: 'No shortcuts in this view — click ＋ to add' },

    // ---------- Groups ----------
    'group.new':       { zh: '＋ 新建分组', en: '＋ New group' },
    'group.all':       { zh: '全部', en: 'All' },
    'group.ungrouped': { zh: '未分组', en: 'Ungrouped' },
    'group.del':       { zh: '删除分组', en: 'Delete group' },
    'group.name_ph':   { zh: '分组名称', en: 'Group name' },

    // ---------- Shortcut modal ----------
    'site.add':    { zh: '添加快捷方式', en: 'Add shortcut' },
    'site.edit':   { zh: '编辑快捷方式', en: 'Edit shortcut' },
    'site.name':   { zh: '名称', en: 'Name' },
    'site.name_ph':{ zh: '例如 腾讯云', en: 'e.g. Tencent Cloud' },
    'site.url':    { zh: '网址', en: 'URL' },
    'site.url_ph': { zh: 'https://cloud.tencent.com', en: 'https://cloud.tencent.com' },
    'site.group':  { zh: '分组', en: 'Group' },
    'site.tip':    { zh: '知名站点自动匹配内置品牌图标；未收录站点显示首字图标。拖拽卡片可重新排序。', en: 'Known sites get brand icons automatically; others show an initial. Drag cards to reorder.' },
    'site.cancel': { zh: '取消', en: 'Cancel' },
    'site.save':   { zh: '保存', en: 'Save' },

    // #50 custom per-card icon (shortcut modal)
    'icon.label':  { zh: '图标', en: 'Icon' },
    'icon.upload': { zh: '上传图标', en: 'Upload icon' },
    'icon.remove': { zh: '移除', en: 'Remove' },
    'icon.tip':    { zh: '可选：上传方形图片作为此卡图标（PNG / JPG / WebP / GIF，≤4MB，自动裁成方形）。留空则继续使用内置品牌图标或首字母。', en: 'Optional: upload a square image as this card\'s icon (PNG/JPG/WebP/GIF, \u22644MB, auto-cropped square). Leave empty to keep the brand icon or initial.' },

    // ---------- Settings modal tabs ----------
    'set.wall':    { zh: '壁纸', en: 'Wallpaper' },
    'set.general': { zh: '常规', en: 'General' },
    'set.prompt':  { zh: '模板', en: 'Templates' },
    'set.sync':    { zh: '同步', en: 'Sync' },
    'set.close':   { zh: '关闭', en: 'Close' },

    // ---------- Wallpaper tab ----------
    'wall.lib_title': { zh: '壁纸库 · 必应每日', en: 'Wallpaper library · Bing Daily' },
    'wall.fetch':     { zh: '获取最新', en: 'Get latest' },
    'wall.lib_tip':   { zh: '精选必应每日壁纸，点击即可应用；需联网获取（图片来源见版权信息）。', en: 'Curated Bing daily wallpapers; click to apply. Requires network (see credits).' },
    'wall.upload':    { zh: '上传自定义图片', en: 'Upload custom image' },
    'wall.reset':     { zh: '重置为渐变', en: 'Reset to gradient' },
    'wall.format_tip':{ zh: '支持 JPG / PNG / WebP / GIF；最大 4MB；仅保存在本地浏览器。', en: 'Supports JPG / PNG / WebP / GIF; max 4MB; stored locally only.' },
    'wall.loading':   { zh: '加载中…', en: 'Loading…' },
    'wall.got':       { zh: '已获取 {n} 张必应每日壁纸 · 点击应用（图片来源见版权信息）', en: 'Got {n} Bing daily wallpapers · click to apply (see credits)' },
    'wall.fail':      { zh: '壁纸库加载失败：{err}（需联网）', en: 'Wallpaper library failed to load: {err} (requires network)' },
    'wall.got_cached':{ zh: '离线模式：显示上次缓存的 {n} 张壁纸（「获取最新」需联网）', en: 'Offline — showing {n} cached wallpapers (Get latest needs network)' },
    'wall.rotate':    { zh: '每日自动更换必应壁纸', en: 'Daily Bing wallpaper auto-rotate' },
    'wall.rotate_tip':{ zh: '开启后，每个自然日自动应用一张壁纸库中的必应图片；当天手动选择的壁纸不会被自动覆盖。', en: 'When on, a Bing image from the library is applied each calendar day. Manual picks are kept for the rest of that day.' },

    // ---------- General tab ----------
    'gen.name':     { zh: '显示名称（问候语用）', en: 'Display name (used in greeting)' },
    'gen.name_ph':  { zh: '留空则不显示名字', en: 'Leave empty to hide the name' },
    'gen.engine':   { zh: '默认搜索引擎', en: 'Default search engine' },
    'gen.lang':     { zh: '语言', en: 'Language' },
    'gen.theme':    { zh: '主题', en: 'Theme' },
    'theme.dark':   { zh: '深色', en: 'Dark' },
    'theme.light':  { zh: '浅色', en: 'Light' },
    'theme.system': { zh: '跟随系统', en: 'Follow system' },
    'gen.data':     { zh: '数据管理', en: 'Data management' },
    'gen.export':   { zh: '导出数据', en: 'Export data' },
    'gen.import':   { zh: '导入数据', en: 'Import data' },
    'gen.import_bookmarks': { zh: '从书签导入', en: 'Import from bookmarks' },
    'gen.data_tip': { zh: '备份/恢复全部数据（快捷方式、待办、设置、壁纸）。导出文件可跨浏览器迁移。', en: 'Back up / restore all data (shortcuts, to-dos, settings, wallpaper). Export file is portable across browsers.' },
    'gen.reset':    { zh: '恢复默认数据', en: 'Reset to defaults' },
    'gen.done':     { zh: '完成', en: 'Done' },
    'gen.version':  { zh: 'LightTab v1.18.1 · 极简新标签页 · 本地优先，可选云同步', en: 'LightTab v1.18.1 · Minimal new tab · Local-first, optional cloud sync' },

    // ---------- Templates tab ----------
    'prompt.title':  { zh: 'Prompt 模板 · AI 发射台', en: 'Prompt templates · AI launcher' },
    'prompt.add':    { zh: '＋ 新建模板', en: '＋ New template' },
    'prompt.help':   { zh: '主界面按 <b>/</b> 打开模板面板：选用模板 → 输入内容 → Enter 一次性发射到多个 AI。<code>{q}</code> 是内容插槽；不含 <code>{q}</code> 的模板作为固定指令、选中即发射。', en: 'Press <b>/</b> to open the template panel: pick a template → type → Enter to launch to multiple AIs. <code>{q}</code> is the content slot; templates without <code>{q}</code> act as fixed commands and fire on selection.' },
    'prompt.done':   { zh: '完成', en: 'Done' },
    'prompt.empty':  { zh: '还没有模板：主界面按 / 打开模板面板即可选用；或点右上角「＋ 新建」创建。', en: 'No templates yet: press / to pick one, or click ＋ New to create.' },
    'prompt.edit':   { zh: '编辑', en: 'Edit' },
    'prompt.del':    { zh: '删除', en: 'Delete' },
    'prompt.name':   { zh: '名称', en: 'Name' },
    'prompt.name_ph':{ zh: '例如 翻译成中文', en: 'e.g. Translate to Chinese' },
    'prompt.tmpl_label': { zh: '提示词模板（{q} = 内容插槽；不含 {q} 则作为固定指令，选中即发射）', en: 'Prompt template ({q} = content slot; without {q} it is a fixed command that fires on selection)' },
    'prompt.tmpl_ph':    { zh: '例如 请把下面的内容翻译成地道中文：\n\n{q}', en: 'e.g. Translate the following into natural Chinese:\n\n{q}' },
    'prompt.hint_label': { zh: '输入框占位提示（选用后显示）', en: 'Input placeholder (shown after selecting)' },
    'prompt.hint_ph':    { zh: '例如 粘贴要翻译的内容…', en: 'e.g. Paste text to translate…' },
    'prompt.targets':    { zh: '发射目标（多选；勾选 WorkBuddy 可填附加参数）', en: 'Targets (multi-select; check WorkBuddy for extra params)' },
    'prompt.wb_label':   { zh: 'WorkBuddy 附加参数（可选，官方深链：expertId / model / mode / cwd）', en: 'WorkBuddy extra params (optional deep link: expertId / model / mode / cwd)' },
    'prompt.cancel':     { zh: '取消', en: 'Cancel' },
    'prompt.save':       { zh: '保存', en: 'Save' },

    // ---------- Toasts / notices ----------
    'toast.wall_applied':  { zh: '已应用壁纸', en: 'Wallpaper applied' },
    'toast.wall_reset':    { zh: '已恢复默认渐变', en: 'Default gradient restored' },
    'toast.wall_rotate_on':{ zh: '已开启每日壁纸轮换', en: 'Daily wallpaper rotation on' },
    'toast.copied':        { zh: '已复制到剪贴板', en: 'Copied to clipboard' },
    'toast.deleted':       { zh: '已删除', en: 'Deleted' },
    // #60 left-column widget removal
    'widget.removed':      { zh: '组件已移除', en: 'Widget removed' },
    'widget.remove':       { zh: '移除该组件', en: 'Remove this widget' },
    'gen.widgets':         { zh: '左栏组件', en: 'Left column widgets' },
    'gen.widgets_tip':     { zh: '取消勾选即移除；三个都移除后左栏收起，图标网格自动占满整宽。', en: 'Uncheck to remove. With all three removed the left column collapses and the icon grid spans the full width.' },
    // #61 clock placement + WorkBuddy desktop detection
    'gen.clock_pos':       { zh: '时钟位置', en: 'Clock placement' },
    'clockpos.left':       { zh: '左栏卡片', en: 'Left column card' },
    'clockpos.top':        { zh: '搜索框上方', en: 'Above the search box' },
    'wb.running':          { zh: 'WorkBuddy 正在运行（v{v}）', en: 'WorkBuddy is running (v{v})' },
    'wb.not_running':      { zh: '未检测到 WorkBuddy 在运行', en: 'WorkBuddy not detected' },
    'wb.not_detected':     { zh: '没检测到 WorkBuddy 桌面端，可能未安装', en: 'Could not reach WorkBuddy Desktop — it may not be installed' },
    'wb.get':              { zh: '去下载', en: 'Get it' },
    'toast.undo':          { zh: '撤销', en: 'Undo' },
    'toast.name_required': { zh: '名称不能为空', en: 'Name is required' },
    'toast.url_invalid':   { zh: '网址格式不正确', en: 'Invalid URL format' },
    'toast.group_exists':  { zh: '分组已存在', en: 'Group already exists' },
    'toast.group_deleted': { zh: '已删除分组「{name}」', en: 'Deleted group "{name}"' },
    'toast.group_del_confirm': { zh: '删除分组「{name}」？\n组内 {n} 个快捷方式将移到「未分组」，不会被删除。', en: 'Delete group "{name}"?\n{n} shortcuts will move to Ungrouped (not deleted).' },
    'toast.prompt_deleted':    { zh: '模板已删除', en: 'Template deleted' },
    'toast.prompt_added':      { zh: '模板已添加', en: 'Template added' },
    'toast.prompt_saved':      { zh: '模板已保存', en: 'Template saved' },
    'toast.prompt_del_confirm':{ zh: '删除模板「{name}」？', en: 'Delete template "{name}"?' },
    'toast.prompt_name_required': { zh: '请填写模板名称', en: 'Please enter a template name' },
    'toast.prompt_tmpl_required': { zh: '请填写提示词内容', en: 'Please enter prompt content' },
    'toast.prompt_limit':      { zh: '模板数量已达上限（30）', en: 'Template limit reached (30)' },
    'toast.export_ok':         { zh: '已导出数据文件（JSON）', en: 'Data exported (JSON)' },
    'toast.export_fail':       { zh: '导出失败', en: 'Export failed' },
    'toast.import_not_json':   { zh: '文件不是有效的 JSON', en: 'File is not valid JSON' },
    'toast.import_bad':        { zh: '文件格式不正确', en: 'Invalid file format' },
    'toast.import_not_lighttab':{ zh: '不是 LightTab 的备份文件', en: 'Not a LightTab backup file' },
    'toast.import_confirm':    { zh: '导入将覆盖当前全部数据（快捷方式/待办/模板/设置/壁纸），确定继续？', en: 'Importing will overwrite all current data (shortcuts/to-dos/templates/settings/wallpaper). Continue?' },
    'toast.import_done':       { zh: '导入完成：{items} 个快捷方式 · {todos} 条待办', en: 'Imported: {items} shortcuts · {todos} to-dos' },
    'toast.bookmarks_unavailable': { zh: '书签导入需在 Chrome 扩展中启用，当前预览模式不可用', en: 'Bookmark import requires the Chrome extension (unavailable in preview)' },
    'toast.bookmarks_denied':  { zh: '未授权书签权限，导入已取消', en: 'Bookmark permission denied, import canceled' },
    'toast.bookmarks_empty':   { zh: '书签列表为空', en: 'No bookmarks' },
    'toast.bookmarks_dup':     { zh: '没有导入新书签（跳过 {n} 个重复）', en: 'No new bookmarks (skipped {n} duplicates)' },
    'toast.bookmarks_done':    { zh: '已导入 {n} 个书签', en: 'Imported {n} bookmarks' },
    'toast.bookmarks_dup_suffix': { zh: '，跳过 {n} 个重复', en: ', skipped {n} duplicates' },
    'toast.bookmarks_group':   { zh: '（归入当前分组）', en: ' (added to current group)' },
    'toast.image_too_big':     { zh: '图片超过 4MB，请压缩后再试', en: 'Image exceeds 4MB, please compress and retry' },
    'toast.icon_invalid':      { zh: '图片无法读取，请换一张重试', en: 'Could not read that image, please try another' },
    'toast.reset_confirm':     { zh: '确认重置所有数据？\n（名称、引擎、壁纸、快捷方式、分组、模板、待办都会被清空）', en: 'Reset all data?\n(Name, engine, wallpaper, shortcuts, groups, templates, and to-dos will be cleared.)' },
    'toast.reset_done':        { zh: '已恢复默认数据', en: 'Restored defaults' },
    'toast.unnamed':           { zh: '未命名', en: 'Untitled' },
    'toast.unnamed_tpl':       { zh: '未命名模板', en: 'Untitled template' },
    'toast.bookmark_fallback': { zh: '书签', en: 'Bookmark' },

    // ---------- AI 发射 ----------
    'ai.enter':       { zh: '输入内容后按 Enter 发射（{q} 为内容插槽）', en: 'Type content then press Enter to launch ({q} is the content slot)' },
    'ai.wb_launched': { zh: '已拉起 WorkBuddy · Prompt 已预填，在窗口按 Enter 发送', en: 'WorkBuddy launched · prompt pre-filled, press Enter in the window to send' },
    'ai.copied':      { zh: 'Prompt 已复制 · 对话页打开后 Ctrl+V 粘贴发送', en: 'Prompt copied · paste with Ctrl+V on the chat page' },
    'ai.empty':       { zh: '内容为空，未发射', en: 'Content is empty, nothing launched' },
    'ai.no_target':   { zh: '模板未配置可用发射目标', en: 'Template has no usable targets' },
    'ai.fail':        { zh: '发射失败：没有成功打开任何目标', en: 'Launch failed: no target opened' },
    'ai.wb_multi':    { zh: '已拉起 WorkBuddy，并向 {n} 个网页目标发射', en: 'WorkBuddy launched and {n} web targets fired' },
    'ai.launched':    { zh: '已发射到 {n} 个目标：{names}', en: 'Launched to {n} targets: {names}' },
    'ai.blocked':     { zh: '若浏览器拦截了弹窗，请允许本站弹窗后重试', en: 'If the popup was blocked, allow popups for this site and retry' },

    // ---------- 云同步 ----------
    'sync.desc':      { zh: '登录后可在多台设备间同步快捷方式、待办、设置、壁纸与模板。数据经 HTTPS 加密传输，密码仅存加密哈希，本地数据始终可用。', en: 'Sync shortcuts, to-dos, settings, wallpaper, and templates across devices. Data travels over HTTPS; passwords are stored as hashes only; local data is always available.' },
    'sync.email':     { zh: '邮箱', en: 'Email' },
    'sync.pass':      { zh: '密码', en: 'Password' },
    'sync.pass_ph':   { zh: '至少 8 位', en: 'At least 8 characters' },
    'sync.login':     { zh: '登录', en: 'Log in' },
    'sync.register':  { zh: '注册新账号', en: 'Create account' },
    'sync.resend':    { zh: '重发验证邮件', en: 'Resend verification email' },
    'sync.logged_in': { zh: '已登录', en: 'Logged in' },
    'sync.now':       { zh: '立即同步', en: 'Sync now' },
    'sync.logout':    { zh: '登出', en: 'Log out' },
    'sync.status.syncing': { zh: '同步中…', en: 'Syncing…' },
    'sync.status.offline': { zh: '离线，已保留本地修改', en: 'Offline, local changes kept' },
    'sync.status.error':   { zh: '同步出错', en: 'Sync error' },
    'sync.status.synced':  { zh: '已同步', en: 'Synced' },
    'sync.status.pending': { zh: '待同步', en: 'Pending sync' },
    'sync.verify_sent_toast': { zh: '验证邮件已发送，请查收邮箱完成验证', en: 'Verification email sent, check your inbox' },
    'sync.verify_sent_panel': { zh: '验证邮件已发送到 {email}，请查收邮箱并点击邮件里的链接完成验证，完成后用下方账号登录。', en: 'Verification email sent to {email}. Click the link in the email to verify, then log in below.' },
    'sync.login_success':  { zh: '登录成功，正在同步…', en: 'Logged in, syncing…' },
    'sync.resend_sent':    { zh: '验证邮件已重新发送', en: 'Verification email re-sent' },
    'sync.logged_out':     { zh: '已登出', en: 'Logged out' },
    'sync.applied':        { zh: '已从云端同步更新', en: 'Updated from cloud sync' },
    'sync.err_email':      { zh: '请输入邮箱', en: 'Please enter an email' },
    'sync.err_pass':       { zh: '密码至少 8 位', en: 'Password must be at least 8 characters' },
    'sync.err.invalid':        { zh: '邮箱或密码错误', en: 'Incorrect email or password' },
    'sync.err.pass_short':     { zh: '密码至少 8 位', en: 'Password must be at least 8 characters' },
    'sync.err.email_invalid':  { zh: '邮箱格式不正确', en: 'Invalid email address' },
    'sync.err.email_missing':  { zh: '该邮箱不存在，请检查后重试', en: 'Email not found, check and retry' },
    'sync.err.email_registered': { zh: '该邮箱已注册，请直接登录', en: 'Email already registered, please log in' },
    'sync.err.email_unverified': { zh: '邮箱尚未验证，请查收邮件完成验证', en: 'Email not verified, check your inbox' },
    'sync.err.rate':          { zh: '操作太频繁，请稍后再试', en: 'Too many requests, try again later' },
    'sync.err.network':       { zh: '无法连接服务器，请检查网络', en: 'Cannot reach server, check your network' },
    'sync.err.expired':       { zh: '登录已过期，请重新登录', en: 'Session expired, please log in again' },
    'sync.err.offline':       { zh: '无法连接服务器，已保留本地修改', en: 'Cannot reach server, local changes kept' },

    // ---------- 存储错误 ----------
    'store.wallpaper': { zh: '壁纸图片过大，未能保存（本次仍可预览，重开可能恢复默认）', en: 'Wallpaper image too large to save (preview works this session, may reset on reopen)' },
    'store.settings':  { zh: '设置保存失败', en: 'Failed to save settings' },
    'store.items':     { zh: '快捷方式保存失败', en: 'Failed to save shortcuts' },
    'store.todos':     { zh: '待办保存失败', en: 'Failed to save to-dos' },
    'store.prompts':   { zh: '模板保存失败', en: 'Failed to save templates' },
    'store.generic':   { zh: '数据保存失败（可能超出浏览器存储限制）', en: 'Data save failed (may exceed browser storage)' },

    // ---------- 其它 ----------
    'boot.preview': { zh: '当前为浏览器直接预览模式（未安装扩展），数据保存在 localStorage。', en: 'Preview mode (extension not installed), data saved to localStorage.' },
    'drag.card':    { zh: '拖拽移动（自动对齐网格）', en: 'Drag to move (snaps to grid)' },
    'drag.block':   { zh: '拖拽移动', en: 'Drag to move' }
  };

  function getLang() { return lang; }

  function t(key, vars) {
    const entry = DICT[key];
    let s;
    if (!entry) return key;
    if (typeof entry === 'string') s = entry;
    else s = (entry[lang] != null && entry[lang] !== '') ? entry[lang] : entry.zh;
    if (s == null) s = key;
    if (vars) {
      for (const k in vars) {
        s = s.split('{' + k + '}').join(String(vars[k]));
      }
    }
    return s;
  }

  function applyStatic() {
    document.querySelectorAll('[data-i18n]').forEach(el => {
      el.textContent = t(el.getAttribute('data-i18n'));
    });
    document.querySelectorAll('[data-i18n-ph]').forEach(el => {
      el.setAttribute('placeholder', t(el.getAttribute('data-i18n-ph')));
    });
    document.querySelectorAll('[data-i18n-title]').forEach(el => {
      el.setAttribute('title', t(el.getAttribute('data-i18n-title')));
    });
    document.querySelectorAll('[data-i18n-aria]').forEach(el => {
      el.setAttribute('aria-label', t(el.getAttribute('data-i18n-aria')));
    });
    document.querySelectorAll('[data-i18n-html]').forEach(el => {
      el.innerHTML = t(el.getAttribute('data-i18n-html'));
    });
  }

  function setLang(l) {
    lang = LANGS.includes(l) ? l : 'zh';
    document.documentElement.lang = (lang === 'zh') ? 'zh-CN' : 'en';
    applyStatic();
  }

  window.LT_I18N = { t, setLang, getLang, applyStatic, DICT };
})();

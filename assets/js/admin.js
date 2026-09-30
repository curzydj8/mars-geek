/* 火星极客 · 后台 Dashboard SPA（哈希路由 + 权限菜单） */
(function () {
  'use strict';
  const { esc, fmtDate } = MG;
  const content = document.getElementById('content');
  const nav = document.getElementById('nav');
  const pageTitle = document.getElementById('pageTitle');

  const state = { user: null };

  /* ---------- 通用 UI ---------- */
  function loadingBox(text) {
    return `<div class="loading-box"><div class="spinner-lg"></div>${esc(text || '加载中…')}</div>`;
  }
  function errorBox(msg) {
    return `<div class="error-box">⚠️<br>${esc(msg || '加载失败')}<br><br><button class="btn ghost small" onclick="location.reload()">重试</button></div>`;
  }
  function emptyBox(icon, text) {
    return `<div class="empty-box"><span class="big">${icon}</span>${esc(text)}</div>`;
  }
  let toastTimer = null;
  function toast(msg, type) {
    const t = document.getElementById('toast');
    t.className = 'show ' + (type || '');
    t.querySelector('.inner').textContent = msg;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { t.className = ''; }, 2600);
  }
  function openModal(title, bodyHtml) {
    const root = document.getElementById('modalRoot');
    root.innerHTML = `
      <div class="modal-mask" id="mMask">
        <div class="modal" role="dialog" aria-label="${esc(title)}">
          <h3>${esc(title)}</h3>
          <div class="modal-body">${bodyHtml}</div>
        </div>
      </div>`;
    const mask = document.getElementById('mMask');
    mask.addEventListener('click', (e) => { if (e.target === mask) closeModal(); });
    return closeModal;
  }
  function closeModal() { document.getElementById('modalRoot').innerHTML = ''; }
  function fieldHtml(name, label, inner, hint) {
    return `<div class="field" data-field="${name}"><label>${esc(label)}</label>${inner}${hint ? `<div class="hint" style="font-size:12px;color:#5b6478;margin-top:5px">${esc(hint)}</div>` : ''}<div class="ferr"></div></div>`;
  }
  function applyFormError(root, err) {
    root.querySelectorAll('.field.invalid').forEach(f => f.classList.remove('invalid'));
    if (err && err.details) {
      for (const [k, v] of Object.entries(err.details)) {
        const f = root.querySelector(`[data-field="${k}"]`);
        if (f) { f.classList.add('invalid'); f.querySelector('.ferr').textContent = v; }
      }
    }
    toast((err && err.message) || '操作失败', 'err');
  }
  function confirmDialog(title, text, okLabel) {
    return new Promise((resolve) => {
      const close = openModal(title, `
        <p style="color:var(--muted);line-height:1.8;font-size:14px">${esc(text)}</p>
        <div class="actions">
          <button class="btn ghost" id="cCancel">取消</button>
          <button class="btn danger" id="cOk">${esc(okLabel || '确认')}</button>
        </div>`);
      document.getElementById('cCancel').onclick = () => { close(); resolve(false); };
      document.getElementById('cOk').onclick = () => { close(); resolve(true); };
    });
  }
  function pagerHtml(page, pageSize, total) {
    const pages = Math.max(1, Math.ceil(total / pageSize));
    return `<div class="pagination">
      <button class="btn ghost small" data-pg="${page - 1}" ${page <= 1 ? 'disabled' : ''}>上一页</button>
      <span>第 ${page} / ${pages} 页 · 共 ${total} 条</span>
      <button class="btn ghost small" data-pg="${page + 1}" ${page >= pages ? 'disabled' : ''}>下一页</button>
    </div>`;
  }

  /* ---------- 路由 ---------- */
  const ROUTES = {
    overview: { title: '总览', icon: '🚀', perm: null },
    users:    { title: '用户管理', icon: '👥', perm: 'users.read' },
    media:    { title: '媒体资源', icon: '🖼️', perm: 'media.read' },
    stats:    { title: '数据统计', icon: '📊', perm: 'stats.read' },
    profile:  { title: '个人资料', icon: '👤', perm: null, sep: '个人' },
    account:  { title: '账户设置', icon: '🔑', perm: null },
    system:   { title: '系统设置', icon: '🛠️', perm: 'settings.read', sep: '系统' },
  };
  const can = (perm) => !perm || (state.user && state.user.permissions.includes(perm));

  function buildNav() {
    let html = '';
    let lastSep = null;
    for (const [key, r] of Object.entries(ROUTES)) {
      if (!can(r.perm)) continue;
      if (r.sep && r.sep !== lastSep) { html += `<div class="sep">${esc(r.sep)}</div>`; lastSep = r.sep; }
      html += `<a href="#/${key}" data-route="${key}"><span class="ico">${r.icon}</span>${esc(r.title)}</a>`;
    }
    nav.innerHTML = html;
  }
  function setActive(route) {
    nav.querySelectorAll('a').forEach(a => a.classList.toggle('active', a.dataset.route === route));
    pageTitle.textContent = (ROUTES[route] || {}).title || '';
    document.getElementById('sidebar').classList.remove('open');
    document.getElementById('navMask').classList.remove('show');
  }
  async function router() {
    let route = (location.hash || '#/overview').replace('#/', '').split('?')[0];
    if (!ROUTES[route] || !can(ROUTES[route].perm)) route = 'overview';
    setActive(route);
    content.innerHTML = loadingBox();
    try {
      await VIEWS[route]();
    } catch (err) {
      content.innerHTML = errorBox((err && err.message) || '加载失败');
    }
    content.scrollTop = 0;
    window.scrollTo(0, 0);
  }

  /* ---------- 视图：总览 ---------- */
  async function vOverview() {
    const { stats } = await MG.get('/api/stats/overview');
    const isAdmin = state.user.role === 'admin';
    let cards = '';
    if (isAdmin) {
      cards = `
        <div class="stat-card"><div class="k">用户总数</div><div class="v">${stats.total_users}</div></div>
        <div class="stat-card"><div class="k">今日新增</div><div class="v accent">+${stats.today_new_users}</div></div>
        <div class="stat-card"><div class="k">激活用户</div><div class="v">${stats.active_users}</div></div>
        <div class="stat-card"><div class="k">媒体资源</div><div class="v">${stats.total_media}</div></div>`;
    } else {
      cards = `
        <div class="stat-card"><div class="k">我的媒体资源</div><div class="v">${stats.my_media_count}</div></div>
        <div class="stat-card"><div class="k">我的角色</div><div class="v" style="font-size:22px">${esc(stats.role === 'admin' ? '管理员' : '普通用户')}</div></div>
        <div class="stat-card"><div class="k">加入时间</div><div class="v" style="font-size:17px">${esc(fmtDate(stats.member_since).split(' ')[0])}</div></div>`;
    }
    let extra = '';
    if (isAdmin && stats.registrations_30d && stats.registrations_30d.length) {
      const max = Math.max(1, ...stats.registrations_30d.map(d => d.count));
      const bars = stats.registrations_30d.map(d => `
        <div class="bcol" title="${esc(d.day)}: ${d.count}"><div class="bar" style="height:${Math.round(d.count / max * 130)}px"></div><div class="blab">${esc(d.day.slice(5))}</div></div>`).join('');
      extra = `<div class="panel"><h3>近 30 天注册趋势</h3><div class="bars">${bars}</div></div>`;
    }
    const quick = `
      <div class="panel"><h3>快捷入口</h3>
        <div style="display:flex;gap:10px;flex-wrap:wrap">
          ${can('media.read') ? `<a class="btn ghost" href="#/media">🖼️ 管理媒体资源</a>` : ''}
          ${can('users.read') ? `<a class="btn ghost" href="#/users">👥 用户管理</a>` : ''}
          <a class="btn ghost" href="#/profile">👤 个人资料</a>
          <a class="btn ghost" href="#/account">🔑 修改密码</a>
        </div>
      </div>`;
    content.innerHTML = `
      <div class="grid-cards">${cards}</div>
      ${extra}${quick}
      <div class="panel"><h3>欢迎回来，${esc(state.user.username)}</h3>
        <p style="color:var(--muted);font-size:14px;line-height:1.9">
          这里是火星极客后台管理。你当前的角色是 <b style="color:var(--accent2)">${esc(state.user.role === 'admin' ? '管理员' : '普通用户')}</b>，
          拥有 ${state.user.permissions.length} 项权限。所有权限校验都在服务端完成。</p></div>`;
  }

  /* ---------- 视图：用户管理 ---------- */
  const usersState = { page: 1, q: '' };
  async function vUsers() {
    const canWrite = state.user.permissions.includes('users.write');
    content.innerHTML = `
      <div class="panel">
        <div class="toolbar">
          <input class="search-input" id="uq" type="text" placeholder="搜索邮箱 / 用户名" value="${esc(usersState.q)}">
          <button class="btn ghost" id="uSearch">搜索</button>
          <span class="spacer"></span>
          ${canWrite ? `<button class="btn" id="uCreate">＋ 新建用户</button>` : ''}
        </div>
        <div id="uList">${loadingBox()}</div>
      </div>`;
    const qInput = document.getElementById('uq');
    const doSearch = () => { usersState.q = qInput.value.trim(); usersState.page = 1; loadUsers(); };
    document.getElementById('uSearch').onclick = doSearch;
    qInput.addEventListener('keydown', e => { if (e.key === 'Enter') doSearch(); });
    const cBtn = document.getElementById('uCreate');
    if (cBtn) cBtn.onclick = () => userModal(null, () => loadUsers());
    await loadUsers();

    async function loadUsers() {
      const list = document.getElementById('uList');
      list.innerHTML = loadingBox();
      try {
        const params = new URLSearchParams({ page: usersState.page, pageSize: 15 });
        if (usersState.q) params.set('q', usersState.q);
        const data = await MG.get('/api/users?' + params.toString());
        if (!data.items.length) { list.innerHTML = emptyBox('👥', usersState.q ? '没有匹配的用户' : '还没有用户'); return; }
        const rows = data.items.map(u => `
          <tr>
            <td>#${u.id}</td>
            <td>${esc(u.username)}</td>
            <td>${esc(u.email)}</td>
            <td>${u.role === 'admin' ? '<span class="badge warn">管理员</span>' : '<span class="badge info">普通用户</span>'}</td>
            <td>${u.is_active ? '<span class="badge ok">正常</span>' : '<span class="badge off">禁用</span>'}</td>
            <td>${esc(fmtDate(u.created_at))}</td>
            <td><div class="row-actions">
              ${canWrite ? `<button class="btn ghost small" data-edit="${u.id}">编辑</button>
              <button class="btn danger small" data-del="${u.id}" data-name="${esc(u.username)}">删除</button>` : '<span style="color:var(--muted)">—</span>'}
            </div></td>
          </tr>`).join('');
        list.innerHTML = `
          <div class="table-wrap"><table>
            <thead><tr><th>ID</th><th>用户名</th><th>邮箱</th><th>角色</th><th>状态</th><th>注册时间</th><th>操作</th></tr></thead>
            <tbody>${rows}</tbody>
          </table></div>
          ${pagerHtml(data.page, data.pageSize, data.total)}`;
        list.querySelectorAll('[data-pg]').forEach(b => b.onclick = () => {
          const p = parseInt(b.dataset.pg, 10);
          if (p >= 1) { usersState.page = p; loadUsers(); }
        });
        list.querySelectorAll('[data-edit]').forEach(b => b.onclick = () => userModal(parseInt(b.dataset.edit, 10), () => loadUsers()));
        list.querySelectorAll('[data-del]').forEach(b => b.onclick = async () => {
          const id = parseInt(b.dataset.del, 10);
          if (!await confirmDialog('删除用户', `确定删除用户「${b.dataset.name}」吗？其登录会话将同时失效，此操作不可恢复。`, '删除')) return;
          try { await MG.del('/api/users/' + id); toast('用户已删除', 'ok'); loadUsers(); }
          catch (err) { toast(err.message || '删除失败', 'err'); }
        });
      } catch (err) { list.innerHTML = errorBox(err.message); }
    }
  }
  async function userModal(id, onDone) {
    let u = null;
    if (id) {
      try { u = (await MG.get('/api/users/' + id)).user; }
      catch (err) { toast(err.message || '加载用户失败', 'err'); return; }
    }
    const close = openModal(id ? '编辑用户' : '新建用户', `
      <form id="uForm" novalidate>
        ${fieldHtml('email', '邮箱', `<input name="email" type="email" value="${esc(u ? u.email : '')}" ${id ? 'disabled' : ''} placeholder="you@example.com">`)}
        ${fieldHtml('username', '用户名', `<input name="username" type="text" value="${esc(u ? u.username : '')}" placeholder="2-24 位">`)}
        ${id ? '' : fieldHtml('password', '初始密码', `<input name="password" type="password" placeholder="至少 8 位，含 3 种字符类型">`)}
        ${fieldHtml('role', '角色', `<select name="role">
          <option value="user" ${u && u.role === 'user' ? 'selected' : ''}>普通用户</option>
          <option value="admin" ${u && u.role === 'admin' ? 'selected' : ''}>管理员</option>
        </select>`)}
        ${id ? fieldHtml('is_active', '状态', `<select name="is_active">
          <option value="1" ${u.is_active ? 'selected' : ''}>正常</option>
          <option value="0" ${!u.is_active ? 'selected' : ''}>禁用</option>
        </select>`, '禁用后该用户将立即被登出') : ''}
        <div class="actions">
          <button type="button" class="btn ghost" id="uCancel">取消</button>
          <button type="submit" class="btn" id="uSubmit">保存</button>
        </div>
      </form>`);
    const form = document.getElementById('uForm');
    document.getElementById('uCancel').onclick = close;
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = document.getElementById('uSubmit');
      btn.disabled = true;
      try {
        if (id) {
          await MG.put('/api/users/' + id, {
            username: form.username.value.trim(),
            role: form.role.value,
            is_active: form.is_active.value === '1',
          });
        } else {
          await MG.post('/api/users', {
            email: form.email.value.trim(),
            username: form.username.value.trim(),
            password: form.password.value,
            role: form.role.value,
          });
        }
        close(); toast('保存成功', 'ok'); onDone();
      } catch (err) { applyFormError(form, err); }
      finally { btn.disabled = false; }
    });
  }

  /* ---------- 视图：媒体资源 ---------- */
  const mediaState = { page: 1, q: '' };
  async function vMedia() {
    const canWrite = state.user.permissions.includes('media.write');
    content.innerHTML = `
      <div class="panel">
        <div class="toolbar">
          <input class="search-input" id="mq" type="text" placeholder="搜索标题 / 描述" value="${esc(mediaState.q)}">
          <button class="btn ghost" id="mSearch">搜索</button>
          <span class="spacer"></span>
          ${canWrite ? `<button class="btn" id="mCreate">＋ 新建资源</button>` : ''}
        </div>
        <div id="mList">${loadingBox()}</div>
      </div>`;
    const qInput = document.getElementById('mq');
    const doSearch = () => { mediaState.q = qInput.value.trim(); mediaState.page = 1; loadMedia(); };
    document.getElementById('mSearch').onclick = doSearch;
    qInput.addEventListener('keydown', e => { if (e.key === 'Enter') doSearch(); });
    const cBtn = document.getElementById('mCreate');
    if (cBtn) cBtn.onclick = () => mediaModal(null, () => loadMedia());
    await loadMedia();

    async function loadMedia() {
      const list = document.getElementById('mList');
      list.innerHTML = loadingBox();
      try {
        const params = new URLSearchParams({ page: mediaState.page, pageSize: 15 });
        if (mediaState.q) params.set('q', mediaState.q);
        const data = await MG.get('/api/media?' + params.toString());
        if (!data.items.length) { list.innerHTML = emptyBox('🖼️', mediaState.q ? '没有匹配的资源' : '还没有媒体资源，点击右上新建'); return; }
        const rows = data.items.map(m => `
          <tr>
            <td><div class="wrap-cell"><b>${esc(m.title)}</b><br><span style="color:var(--muted);font-size:12px">${esc(m.type)}</span></div></td>
            <td><div class="wrap-cell"><a href="${esc(m.url)}" target="_blank" rel="noopener" style="color:var(--accent2)">${esc(m.url.length > 42 ? m.url.slice(0, 42) + '…' : m.url)}</a></div></td>
            <td>${m.visibility === 'public' ? '<span class="badge ok">公开</span>' : '<span class="badge off">私密</span>'}</td>
            <td>${esc(m.owner || '—')}</td>
            <td>${esc(fmtDate(m.updated_at))}</td>
            <td><div class="row-actions">
              ${canWrite ? `<button class="btn ghost small" data-edit="${m.id}">编辑</button>
              <button class="btn danger small" data-del="${m.id}" data-name="${esc(m.title)}">删除</button>` : '<span style="color:var(--muted)">—</span>'}
            </div></td>
          </tr>`).join('');
        list.innerHTML = `
          <div class="table-wrap"><table>
            <thead><tr><th>标题</th><th>链接</th><th>可见性</th><th>归属</th><th>更新时间</th><th>操作</th></tr></thead>
            <tbody>${rows}</tbody>
          </table></div>
          ${pagerHtml(data.page, data.pageSize, data.total)}`;
        list.querySelectorAll('[data-pg]').forEach(b => b.onclick = () => {
          const p = parseInt(b.dataset.pg, 10);
          if (p >= 1) { mediaState.page = p; loadMedia(); }
        });
        list.querySelectorAll('[data-edit]').forEach(b => b.onclick = () => mediaModal(parseInt(b.dataset.edit, 10), () => loadMedia()));
        list.querySelectorAll('[data-del]').forEach(b => b.onclick = async () => {
          const mid = parseInt(b.dataset.del, 10);
          if (!await confirmDialog('删除资源', `确定删除「${b.dataset.name}」吗？此操作不可恢复。`, '删除')) return;
          try { await MG.del('/api/media/' + mid); toast('资源已删除', 'ok'); loadMedia(); }
          catch (err) { toast(err.message || '删除失败', 'err'); }
        });
      } catch (err) { list.innerHTML = errorBox(err.message); }
    }
  }
  async function mediaModal(id, onDone) {
    let m = null;
    if (id) {
      // 从列表接口取详情（无单独详情接口时复用搜索）；简化：直接请求列表第一页定位
      try {
        const data = await MG.get('/api/media?page=1&pageSize=100');
        m = data.items.find(x => x.id === id);
        if (!m) throw { message: '资源不存在或无权访问' };
      } catch (err) { toast(err.message || '加载失败', 'err'); return; }
    }
    const close = openModal(id ? '编辑资源' : '新建资源', `
      <form id="mForm" novalidate>
        ${fieldHtml('title', '标题', `<input name="title" type="text" value="${esc(m ? m.title : '')}" placeholder="例如：火星极客宣传片">`)}
        ${fieldHtml('type', '类型', `<select name="type">
          ${['video', 'image', 'link', 'other'].map(t => `<option value="${t}" ${m && m.type === t ? 'selected' : ''}>${t}</option>`).join('')}
        </select>`)}
        ${fieldHtml('url', '链接', `<input name="url" type="url" value="${esc(m ? m.url : '')}" placeholder="https://…">`, '如需接入 Skiv(原 Muse.ai) 媒体能力，API Key 只配置在服务端 .env，后端代理调用')}
        ${fieldHtml('description', '描述', `<textarea name="description" placeholder="选填">${esc(m ? m.description : '')}</textarea>`)}
        ${fieldHtml('visibility', '可见性', `<select name="visibility">
          <option value="private" ${!m || m.visibility === 'private' ? 'selected' : ''}>私密（仅自己/管理员可见）</option>
          <option value="public" ${m && m.visibility === 'public' ? 'selected' : ''}>公开（所有登录用户可见）</option>
        </select>`)}
        <div class="actions">
          <button type="button" class="btn ghost" id="mCancel">取消</button>
          <button type="submit" class="btn" id="mSubmit">保存</button>
        </div>
      </form>`);
    const form = document.getElementById('mForm');
    document.getElementById('mCancel').onclick = close;
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = document.getElementById('mSubmit');
      btn.disabled = true;
      const body = {
        title: form.title.value.trim(),
        type: form.type.value,
        url: form.url.value.trim(),
        description: form.description.value.trim(),
        visibility: form.visibility.value,
      };
      try {
        if (id) await MG.put('/api/media/' + id, body);
        else await MG.post('/api/media', body);
        close(); toast('保存成功', 'ok'); onDone();
      } catch (err) { applyFormError(form, err); }
      finally { btn.disabled = false; }
    });
  }

  /* ---------- 视图：数据统计 ---------- */
  async function vStats() {
    const { stats } = await MG.get('/api/stats/overview');
    const isAdmin = state.user.role === 'admin';
    let html = '<div class="grid-cards">';
    if (isAdmin) {
      html += `
        <div class="stat-card"><div class="k">用户总数</div><div class="v">${stats.total_users}</div></div>
        <div class="stat-card"><div class="k">激活用户</div><div class="v">${stats.active_users}</div></div>
        <div class="stat-card"><div class="k">今日新增</div><div class="v accent">+${stats.today_new_users}</div></div>
        <div class="stat-card"><div class="k">媒体资源总数</div><div class="v">${stats.total_media}</div></div></div>`;
      const max = Math.max(1, ...stats.registrations_30d.map(d => d.count));
      const bars = stats.registrations_30d.map(d => `
        <div class="bcol" title="${esc(d.day)}: ${d.count}"><div class="bar" style="height:${Math.round(d.count / max * 150)}px"></div><div class="blab">${esc(d.day.slice(5))}</div></div>`).join('');
      html += `<div class="panel"><h3>近 30 天新增用户</h3><div class="bars">${bars}</div></div>`;
      const roles = stats.users_by_role.map(r => `
        <tr><td>${r.role === 'admin' ? '管理员' : '普通用户'}</td><td>${r.count}</td></tr>`).join('');
      html += `<div class="panel"><h3>用户角色分布</h3><div class="table-wrap"><table>
        <thead><tr><th>角色</th><th>数量</th></tr></thead><tbody>${roles}</tbody></table></div></div>`;
    } else {
      html += `
        <div class="stat-card"><div class="k">我的媒体资源</div><div class="v">${stats.my_media_count}</div></div>
        <div class="stat-card"><div class="k">加入天数</div><div class="v">${Math.max(1, Math.ceil((Date.now() - new Date(stats.member_since)) / 86400000))}</div></div></div>`;
    }
    content.innerHTML = html;
  }

  /* ---------- 视图：个人资料 ---------- */
  async function vProfile() {
    const u = state.user;
    content.innerHTML = `
      <div class="panel"><h3>个人资料</h3>
        <dl class="kv">
          <dt>用户 ID</dt><dd>#${u.id}</dd>
          <dt>邮箱</dt><dd>${esc(u.email)}</dd>
          <dt>用户名</dt><dd>${esc(u.username)}</dd>
          <dt>角色</dt><dd>${esc(u.role === 'admin' ? '管理员' : '普通用户')}</dd>
          <dt>注册时间</dt><dd>${esc(fmtDate(u.created_at))}</dd>
          <dt>上次登录</dt><dd>${esc(fmtDate(u.last_login_at))}</dd>
        </dl>
      </div>
      <div class="panel"><h3>修改用户名</h3>
        <form id="pForm" novalidate>
          <div class="form-row">
            <label>新用户名</label>
            <input name="username" type="text" value="${esc(u.username)}" maxlength="24">
            <div class="hint">2-24 位字母 / 数字 / 下划线 / 中文</div>
          </div>
          <button class="btn" id="pSubmit" type="submit">保存</button>
        </form>
      </div>`;
    const form = document.getElementById('pForm');
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = document.getElementById('pSubmit');
      btn.disabled = true;
      try {
        const data = await MG.put('/api/auth/profile', { username: form.username.value.trim() });
        state.user = data.user;
        document.getElementById('userName').textContent = data.user.username;
        document.getElementById('userAvatar').textContent = data.user.username.slice(0, 1).toUpperCase();
        toast('用户名已更新', 'ok');
      } catch (err) { toast(err.message || '保存失败', 'err'); }
      finally { btn.disabled = false; }
    });
  }

  /* ---------- 视图：账户设置（改密） ---------- */
  async function vAccount() {
    content.innerHTML = `
      <div class="panel"><h3>修改密码</h3>
        <p style="color:var(--muted);font-size:13.5px;margin-bottom:18px;line-height:1.8">修改后，其他设备的登录会话将被登出，当前设备保持登录。</p>
        <form id="aForm" novalidate>
          <div class="form-row"><label>当前密码</label><input name="currentPassword" type="password" autocomplete="current-password"></div>
          <div class="form-row"><label>新密码</label><input name="newPassword" type="password" autocomplete="new-password">
            <div class="hint">至少 8 位，含小写/大写/数字/符号中的至少 3 种</div></div>
          <div class="form-row"><label>确认新密码</label><input name="confirmPassword" type="password" autocomplete="new-password"></div>
          <button class="btn" id="aSubmit" type="submit">修改密码</button>
        </form>
      </div>
      <div class="panel"><h3>退出登录</h3>
        <p style="color:var(--muted);font-size:13.5px;margin-bottom:14px">退出后需要重新登录才能进入后台。</p>
        <button class="btn danger" id="aLogout">退出登录</button>
      </div>`;
    const form = document.getElementById('aForm');
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = document.getElementById('aSubmit');
      btn.disabled = true;
      try {
        const data = await MG.put('/api/auth/change-password', {
          currentPassword: form.currentPassword.value,
          newPassword: form.newPassword.value,
          confirmPassword: form.confirmPassword.value,
        });
        toast(data.message || '密码修改成功', 'ok');
        form.reset();
      } catch (err) { toast(err.message || '修改失败', 'err'); }
      finally { btn.disabled = false; }
    });
    document.getElementById('aLogout').onclick = () => MG.logout();
  }

  /* ---------- 视图：系统设置 ---------- */
  async function vSystem() {
    const canWrite = state.user.permissions.includes('settings.write');
    const { settings } = await MG.get('/api/settings');
    content.innerHTML = `
      <div class="panel"><h3>系统设置</h3>
        <form id="sForm">
          <div class="form-row"><label>站点名称</label><input name="site_name" type="text" value="${esc(settings.site_name || '')}" ${canWrite ? '' : 'disabled'}></div>
          <div class="form-row"><label>站点标语</label><input name="site_tagline" type="text" value="${esc(settings.site_tagline || '')}" ${canWrite ? '' : 'disabled'}></div>
          <div class="form-row"><label>全站公告</label><textarea name="announcement" ${canWrite ? '' : 'disabled'}>${esc(settings.announcement || '')}</textarea>
            <div class="hint">显示在后台总览顶部（预留字段）</div></div>
          <div class="form-row"><label class="checkline"><input name="allow_registration" type="checkbox" ${settings.allow_registration === '1' ? 'checked' : ''} ${canWrite ? '' : 'disabled'}> 开放公开注册</label>
            <div class="hint">关闭后 /api/auth/register 将拒绝新注册（不影响已注册用户登录）</div></div>
          ${canWrite ? `<button class="btn" id="sSubmit" type="submit">保存设置</button>` : `<p style="color:var(--muted);font-size:13px">你只有查看权限，修改需要 settings.write 权限。</p>`}
        </form>
      </div>`;
    if (!canWrite) return;
    const form = document.getElementById('sForm');
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = document.getElementById('sSubmit');
      btn.disabled = true;
      try {
        await MG.put('/api/settings', {
          site_name: form.site_name.value,
          site_tagline: form.site_tagline.value,
          announcement: form.announcement.value,
          allow_registration: form.allow_registration.checked ? '1' : '0',
        });
        toast('设置已保存', 'ok');
      } catch (err) { toast(err.message || '保存失败', 'err'); }
      finally { btn.disabled = false; }
    });
  }

  const VIEWS = {
    overview: vOverview, users: vUsers, media: vMedia, stats: vStats,
    profile: vProfile, account: vAccount, system: vSystem,
  };

  /* ---------- 启动 ---------- */
  async function boot() {
    // 用 httpOnly cookie 静默续期；失败则回登录页
    const okRefreshed = await MG.refresh();
    if (!okRefreshed && !MG.getToken()) {
      location.href = '/login.html?next=' + encodeURIComponent('/admin/');
      return;
    }
    try {
      state.user = await MG.me(true);
    } catch (e) {
      location.href = '/login.html?next=' + encodeURIComponent('/admin/');
      return;
    }
    // 顶栏
    document.getElementById('userName').textContent = state.user.username;
    document.getElementById('userAvatar').textContent = state.user.username.slice(0, 1).toUpperCase();
    const badge = document.getElementById('roleBadge');
    badge.textContent = state.user.role === 'admin' ? '管理员' : '普通用户';
    if (state.user.role === 'admin') badge.classList.add('admin');
    document.getElementById('logoutBtn').onclick = () => MG.logout();
    // 移动端菜单
    const sidebar = document.getElementById('sidebar');
    const mask = document.getElementById('navMask');
    document.getElementById('hamburger').onclick = () => {
      sidebar.classList.add('open'); mask.classList.add('show');
    };
    mask.onclick = () => { sidebar.classList.remove('open'); mask.classList.remove('show'); };

    buildNav();
    window.addEventListener('hashchange', router);
    await router();
  }
  document.addEventListener('DOMContentLoaded', boot);
})();

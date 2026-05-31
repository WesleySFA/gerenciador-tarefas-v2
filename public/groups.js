let currentGroupId = null
let currentGroupMembers = []
let currentGroupTasks = []
let groupFilter = "all"
let groupView = "kanban"
let groupSearchTerm = ""

function showSection(section) {
  document.querySelectorAll(".btn-nav").forEach(b => b.classList.remove("active"))
  document.querySelectorAll(`.btn-nav[onclick*="'${section}'"]`).forEach(b => b.classList.add("active"))
  document.getElementById("tasks-section").style.display = section === "tasks" ? "block" : "none"
  document.getElementById("groups-section").style.display = section === "groups" ? "block" : "none"
  if (section === "groups") {
    loadNotifications()
    showGroupsList()
  }
}

function showCreateGroup() {
  const form = document.getElementById("create-group-form")
  form.style.display = form.style.display === "none" ? "block" : "none"
}

function cancelCreateGroup() {
  document.getElementById("create-group-form").style.display = "none"
  document.getElementById("group-nome").value = ""
  document.getElementById("group-descricao").value = ""
}

function createGroup() {
  const nome = document.getElementById("group-nome").value
  const descricao = document.getElementById("group-descricao").value
  if (!nome.trim()) return showToast("Nome do grupo é obrigatório", "warning")
  authFetch(API + "/api/groups", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ nome, descricao })
  }).then(async res => {
    if (!res.ok) {
      const data = await res.json()
      throw new Error(data.error)
    }
    return res.json()
  }).then(() => {
    document.getElementById("group-nome").value = ""
    document.getElementById("group-descricao").value = ""
    document.getElementById("create-group-form").style.display = "none"
    showToast("Grupo criado com sucesso!", "success")
    loadGroups()
  }).catch(err => showToast(err.message, "error"))
}

function joinGroup() {
  const invite_code = document.getElementById("invite-code-input").value.trim()
  if (!invite_code) return showToast("Digite um código de convite", "warning")
  authFetch(API + "/api/groups/join", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ invite_code })
  }).then(async res => {
    if (!res.ok) {
      const data = await res.json()
      throw new Error(data.error)
    }
    return res.json()
  }).then(group => {
    document.getElementById("invite-code-input").value = ""
    showToast("Você entrou no grupo!", "success")
    loadGroups()
    openGroup(group.id)
  }).catch(err => showToast(err.message, "error"))
}

function loadGroups() {
  authFetch(API + "/api/groups").then(async res => {
    if (!res.ok) {
      const data = await res.json()
      throw new Error(data.error || "Erro ao carregar grupos")
    }
    return res.json()
  }).then(groups => {
    const container = document.getElementById("groups-list")
    container.innerHTML = ""
    if (groups.length === 0) {
      container.innerHTML = '<div class="empty-state"><span>👥</span><p>Você não está em nenhum grupo ainda</p></div>'
      return
    }
    groups.forEach(g => {
      const card = document.createElement("div")
      card.className = "group-card"
      card.innerHTML = `
        <div class="group-card-info">
          <strong>${g.nome}</strong>
          <span>${g.member_count} membro${g.member_count !== 1 ? 's' : ''}</span>
          ${g.descricao ? `<p>${g.descricao}</p>` : ''}
        </div>
        <div class="group-card-actions">
          <div class="group-card-role ${g.role}">${g.role === 'owner' ? '👑 Dono' : g.role === 'admin' ? '🔧 Admin' : '👤 Membro'}</div>
          ${g.role === 'owner' ? '<button class="btn-delete-group" onclick="event.stopPropagation();deleteGroup(\'' + g.id + '\')" title="Excluir grupo">✕</button>' : ''}
        </div>
      `
      card.onclick = () => openGroup(g.id)
      container.appendChild(card)
    })
  })
}

function openGroup(id) {
  currentGroupId = id
  document.getElementById("groups-list-view").style.display = "none"
  document.getElementById("group-detail-view").style.display = "block"
  loadGroupDetail()
}

function showGroupsList() {
  currentGroupId = null
  currentGroupMembers = []
  currentGroupTasks = []
  document.getElementById("groups-list-view").style.display = "block"
  document.getElementById("group-detail-view").style.display = "none"
  loadGroups()
}

function deleteGroup(id) {
  if (!confirm("Tem certeza que deseja excluir este grupo? Todas as tarefas do grupo serão perdidas.")) return
  authFetch(API + "/api/groups/" + id, {
    method: "DELETE"
  }).then(async res => {
    if (!res.ok) {
      const data = await res.json()
      throw new Error(data.error)
    }
    return res.json()
  }).then(() => {
    showToast("Grupo excluído", "info")
    loadGroups()
  }).catch(err => showToast(err.message, "error"))
}

function loadGroupDetail() {
  if (!currentGroupId) return
  authFetch(API + "/api/groups/" + currentGroupId)
    .then(async res => {
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || "Erro ao carregar grupo")
      }
      return res.json()
    }).then(group => {
      document.getElementById("group-detail-name").textContent = group.nome
      document.getElementById("group-invite-code").textContent = group.invite_code
      currentGroupMembers = group.members || []

      const assignSelect = document.getElementById("g-assigned-to")
      const currentValue = assignSelect.value
      assignSelect.innerHTML = '<option value="">Atribuir para...</option>'
      group.members.forEach(m => {
        const opt = document.createElement("option")
        opt.value = m.id
        opt.textContent = m.nome
        assignSelect.appendChild(opt)
      })
      if (currentValue) assignSelect.value = currentValue

      renderMembers()
      loadGroupTasks()
    })
}

function switchGroupTab(tab) {
  document.querySelectorAll(".group-tab").forEach(t => t.classList.remove("active"))
  document.querySelector(`.group-tab[data-group-tab="${tab}"]`).classList.add("active")
  document.getElementById("group-tasks-tab").style.display = tab === "tasks" ? "block" : "none"
  document.getElementById("group-members-tab").style.display = tab === "members" ? "block" : "none"
}

function renderMembers() {
  const container = document.getElementById("group-members-list")
  container.innerHTML = ""
  currentGroupMembers.forEach(m => {
    const li = document.createElement("li")
    li.className = "member-item"
    const canRemove = m.role !== "owner"
    li.innerHTML = `
      <div class="member-info">
        <strong>${m.nome}</strong>
        <span class="member-email">${m.email}</span>
        <span class="member-role ${m.role}">${m.role === 'owner' ? '👑 Dono' : m.role === 'admin' ? '🔧 Admin' : '👤 Membro'}</span>
      </div>
      ${canRemove ? '<button class="btn-danger-sm" onclick="removeMember(\'' + m.id + '\')">Remover</button>' : ''}
    `
    container.appendChild(li)
  })
}

function removeMember(userId) {
  if (!confirm("Remover este membro do grupo?")) return
  authFetch(API + "/api/groups/" + currentGroupId + "/members/" + userId, {
    method: "DELETE"
  }).then(async res => {
    if (!res.ok) {
      const data = await res.json()
      throw new Error(data.error)
    }
    return res.json()
  }).then(() => {
    showToast("Membro removido", "info")
    loadGroupDetail()
  }).catch(err => showToast(err.message, "error"))
}

function copyInviteCode() {
  const code = document.getElementById("group-invite-code").textContent
  navigator.clipboard.writeText(code).then(() => {
    showToast("Código copiado!", "success")
  }).catch(() => showToast("Não foi possível copiar", "error"))
}

function refreshInviteCode() {
  if (!confirm("Gerar novo código de convite? O código anterior não funcionará mais.")) return
  authFetch(API + "/api/groups/" + currentGroupId + "/invite", {
    method: "POST",
    headers: { "Content-Type": "application/json" }
  }).then(async res => {
    if (!res.ok) {
      const data = await res.json()
      throw new Error(data.error || "Erro ao gerar convite")
    }
    return res.json()
  }).then(data => {
    document.getElementById("group-invite-code").textContent = data.invite_code
    showToast("Novo código gerado!", "success")
  }).catch(err => showToast(err.message, "error"))
}

function loadGroupTasks() {
  if (!currentGroupId) return
  if (groupView === "list") {
    const container = document.getElementById("group-lista")
    if (container) container.innerHTML = '<div class="loading-spinner"><div class="spinner"></div><p>Carregando tarefas...</p></div>'
  } else {
    ["pendente", "andamento", "concluida"].forEach(status => {
      const container = document.getElementById("g-kanban-" + status)
      if (container) container.innerHTML = '<div class="loading-spinner"><div class="spinner"></div><p>Carregando...</p></div>'
    })
  }
  authFetch(API + "/api/groups/" + currentGroupId + "/tasks")
    .then(async res => {
      if (!res.ok) throw new Error("Erro ao carregar tarefas")
      return res.json()
    })
    .then(tasks => {
      tasks.forEach(t => { t.titulo = escapeHtml(t.titulo); t.descricao = escapeHtml(t.descricao); if (t.assigned_nome) t.assigned_nome = escapeHtml(t.assigned_nome) })
      currentGroupTasks = tasks
      renderGroupTasks()
    })
    .catch(err => {
      if (groupView === "list") {
        const el = document.getElementById("group-lista")
        if (el) el.innerHTML = `<div class="empty-state"><span>⚠️</span><p>${err.message}</p></div>`
      } else {
        ["pendente", "andamento", "concluida"].forEach(status => {
          const el = document.getElementById("g-kanban-" + status)
          if (el) el.innerHTML = `<div class="empty-state"><span>⚠️</span><p>${err.message}</p></div>`
        })
      }
    })
}

function getFilteredGroupTasks() {
  let filtered = groupFilter === "all"
    ? currentGroupTasks
    : currentGroupTasks.filter(t => t.status === groupFilter)
  if (groupSearchTerm) {
    filtered = filtered.filter(t =>
      t.titulo.toLowerCase().includes(groupSearchTerm) ||
      (t.descricao && t.descricao.toLowerCase().includes(groupSearchTerm)) ||
      (t.assigned_nome && t.assigned_nome.toLowerCase().includes(groupSearchTerm))
    )
  }
  return filtered
}

function filtrarBuscaGrupo() {
  groupSearchTerm = document.getElementById("g-busca").value.toLowerCase()
  renderGroupTasks()
}

function setGroupFilter(filter) {
  groupFilter = filter
  document.querySelectorAll('[data-gfilter]').forEach(b => b.classList.remove("active"))
  document.querySelector(`[data-gfilter="${filter}"]`).classList.add("active")
  renderGroupTasks()
}

function toggleGroupView(view) {
  groupView = view
  document.querySelectorAll('[data-gview]').forEach(b => b.classList.remove("active"))
  document.querySelector(`[data-gview="${view}"]`).classList.add("active")
  if (view === "list") {
    document.getElementById("group-list-view").style.display = "block"
    document.getElementById("group-kanban-view").style.display = "none"
  } else {
    document.getElementById("group-list-view").style.display = "none"
    document.getElementById("group-kanban-view").style.display = "block"
  }
  renderGroupTasks()
}

function renderGroupTasks() {
  if (groupView === "list") renderGroupListView()
  else renderGroupKanbanView()
}

function renderGroupListView() {
  const lista = document.getElementById("group-lista")
  lista.innerHTML = ""
  const filtered = getFilteredGroupTasks()
  if (filtered.length === 0) {
    lista.innerHTML = '<div class="empty-state"><span>📝</span><p>Nenhuma tarefa no grupo</p></div>'
    return
  }
  filtered.forEach(task => {
    const li = document.createElement("li")
    if (task.status === "concluida") li.classList.add("concluida")
    const prazoAtrasado = task.prazo && new Date(task.prazo) < new Date() && task.status !== "concluida"
    li.innerHTML = `
      <div class="task-info">
        <div class="task-header">
          <span class="prioridade-dot ${task.prioridade}"></span>
          <strong class="task-title">${task.titulo}</strong>
        </div>
        <span class="task-desc">${task.descricao || "Sem descrição"}</span>
        <div class="task-meta">
          <span class="task-status ${task.status}">${formatStatus(task.status)}</span>
          ${task.assigned_nome ? `<span class="assigned-badge">👤 ${task.assigned_nome}</span>` : ''}
          ${task.prazo ? `<span class="task-prazo ${prazoAtrasado ? 'atrasado' : ''}">📅 ${formatDate(task.prazo)}</span>` : ''}
          ${task.data_criacao ? `<span class="task-date">📅 Criada: ${formatDate(task.data_criacao)}</span>` : ''}
          ${task.data_conclusao ? `<span class="task-date">✅ Concluída: ${formatDate(task.data_conclusao)}</span>` : ''}
        </div>
      </div>
      <div class="botoes">
        ${task.status !== "andamento" ? `<button class="btn-andamento" onclick="updateGroupTaskStatus('${task.id}', 'andamento')" title="Em Andamento">⏳</button>` : ''}
        ${task.status !== "concluida" ? `<button class="btn-concluir" onclick="updateGroupTaskStatus('${task.id}', 'concluida')" title="Concluir">✓</button>` : ''}
        <button class="btn-secondary-sm" onclick="editGroupTask('${task.id}')" title="Editar">✎</button>
        <button class="btn-deletar" onclick="deleteGroupTask('${task.id}')" title="Excluir">✕</button>
      </div>
    `
    lista.appendChild(li)
  })
}

function dragGroupTask(e, id) {
  e.dataTransfer.setData("text/plain", id)
}

function allowGroupDrop(e) {
  e.preventDefault()
  const column = e.target.closest(".kanban-column")
  if (column) column.setAttribute("dragover", "true")
}

function dragLeaveGroupColumn(e) {
  const column = e.target.closest(".kanban-column")
  if (column) column.removeAttribute("dragover")
}

function dropGroupTask(e) {
  e.preventDefault()
  const id = e.dataTransfer.getData("text/plain")
  const column = e.target.closest(".kanban-column")
  if (!column) return
  column.removeAttribute("dragover")
  const newStatus = column.dataset.status
  const task = currentGroupTasks.find(t => t.id === id)
  if (!task || task.status === newStatus) return
  updateGroupTaskStatus(id, newStatus)
}

// Touch drag support for group kanban
let groupTouchDragId = null
function initGroupTouchDrag() {
  document.addEventListener("touchstart", function(e) {
    const card = e.target.closest(".kanban-card")
    if (!card || !card.closest("#group-kanban-view")) return
    groupTouchDragId = card.dataset.id
  }, {passive: true})

  document.addEventListener("touchmove", function(e) {
    if (!groupTouchDragId) return
    e.preventDefault()
    const touch = e.touches[0]
    document.querySelectorAll(".kanban-column[dragover=true]").forEach(c => c.removeAttribute("dragover"))
    const el = document.elementFromPoint(touch.clientX, touch.clientY)
    const column = el && el.closest(".kanban-column")
    if (column) column.setAttribute("dragover", "true")
  }, {passive: false})

  document.addEventListener("touchend", function(e) {
    if (!groupTouchDragId) return
    document.querySelectorAll(".kanban-column[dragover=true]").forEach(c => c.removeAttribute("dragover"))
    const touch = e.changedTouches[0]
    const el = document.elementFromPoint(touch.clientX, touch.clientY)
    const column = el && el.closest(".kanban-column")
    if (column) {
      const newStatus = column.dataset.status
      const task = currentGroupTasks.find(t => t.id === groupTouchDragId)
      if (task && task.status !== newStatus) updateGroupTaskStatus(groupTouchDragId, newStatus)
    }
    groupTouchDragId = null
  }, {passive: true})
}
initGroupTouchDrag()

function renderGroupKanbanView() {
  const columns = ["pendente", "andamento", "concluida"]
  columns.forEach(status => {
    const container = document.getElementById("g-kanban-" + status)
    container.innerHTML = ""
    let tasks = currentGroupTasks.filter(t => t.status === status)
    if (groupFilter !== "all") tasks = tasks.filter(t => t.status === groupFilter)
    if (groupSearchTerm) {
      tasks = tasks.filter(t =>
        t.titulo.toLowerCase().includes(groupSearchTerm) ||
        (t.descricao && t.descricao.toLowerCase().includes(groupSearchTerm)) ||
        (t.assigned_nome && t.assigned_nome.toLowerCase().includes(groupSearchTerm))
      )
    }
    document.getElementById("g-count-" + status).textContent = tasks.length
    if (tasks.length === 0) {
      container.innerHTML = '<div class="kanban-empty">Nenhuma tarefa</div>'
      return
    }
    tasks.forEach(task => {
      const card = document.createElement("div")
      card.className = "kanban-card" + (task.status === "concluida" ? " concluida" : "")
      card.draggable = true
      card.dataset.id = task.id
      card.ondragstart = function(e) { dragGroupTask(e, task.id) }
      const prazoAtrasado = task.prazo && new Date(task.prazo) < new Date() && task.status !== "concluida"
      card.innerHTML = `
        <div class="kanban-card-header">
          <span class="prioridade-dot ${task.prioridade}"></span>
          <strong>${task.titulo}</strong>
        </div>
        ${task.descricao ? `<p class="kanban-card-desc">${task.descricao}</p>` : ''}
        <div class="kanban-card-meta">
          ${task.assigned_nome ? `<span>👤 ${task.assigned_nome}</span>` : ''}
          ${task.prazo ? `<span class="${prazoAtrasado ? 'atrasado' : ''}">📅 ${formatDate(task.prazo)}</span>` : ''}
        </div>
        <div class="kanban-card-actions">
          <button class="btn-secondary-sm" onclick="editGroupTask('${task.id}')" title="Editar">✎</button>
          <button class="btn-deletar-sm" onclick="deleteGroupTask('${task.id}')" title="Excluir">✕</button>
        </div>
      `
      container.appendChild(card)
    })
  })
}

function createGroupTask() {
  const titulo = document.getElementById("g-titulo").value
  const descricao = document.getElementById("g-descricao").value
  const prioridade = document.getElementById("g-prioridade").value
  const prazo = document.getElementById("g-prazo").value
  const assigned_to = document.getElementById("g-assigned-to").value
  if (!titulo.trim()) return showToast("Título é obrigatório", "warning")
  authFetch(API + "/api/groups/" + currentGroupId + "/tasks", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ titulo, descricao, prioridade, prazo: prazo || null, assigned_to: assigned_to || null })
  }).then(async res => {
    if (!res.ok) {
      const data = await res.json()
      throw new Error(data.error)
    }
    return res.json()
  }).then(() => {
    document.getElementById("g-titulo").value = ""
    document.getElementById("g-descricao").value = ""
    document.getElementById("g-prioridade").value = "media"
    document.getElementById("g-prazo").value = ""
    document.getElementById("g-assigned-to").value = ""
    showToast("Tarefa criada no grupo!", "success")
    loadGroupTasks()
  }).catch(err => showToast(err.message, "error"))
}

function updateGroupTaskStatus(id, status) {
  authFetch(API + "/api/groups/" + currentGroupId + "/tasks/" + id, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status })
  }).then(async res => {
    if (!res.ok) {
      const data = await res.json()
      throw new Error(data.error)
    }
    return res.json()
  }).then(() => {
    showToast("Status atualizado!", "success")
    loadGroupTasks()
  }).catch(err => showToast(err.message, "error"))
}

function editGroupTask(id) {
  const task = currentGroupTasks.find(t => t.id === id)
  if (!task) return
  document.getElementById("assign-task-name").textContent = `"${task.titulo}"`
  const select = document.getElementById("assign-user-select")
  select.innerHTML = '<option value="">Remover atribuição</option>'
  currentGroupMembers.forEach(m => {
    const opt = document.createElement("option")
    opt.value = m.id
    opt.textContent = m.nome
    if (task.assigned_to === m.id) opt.selected = true
    select.appendChild(opt)
  })
  select.dataset.taskId = id
  document.getElementById("assign-modal").style.display = "flex"
}

function closeAssignModal(e) {
  if (e && e.target !== e.currentTarget) return
  document.getElementById("assign-modal").style.display = "none"
}

function confirmAssign() {
  const select = document.getElementById("assign-user-select")
  const taskId = select.dataset.taskId
  const userId = select.value || null
  closeAssignModal()
  updateGroupTaskAssignment(taskId, userId)
}

function updateGroupTaskAssignment(id, userId) {
  authFetch(API + "/api/groups/" + currentGroupId + "/tasks/" + id, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ assigned_to: userId })
  }).then(async res => {
    if (!res.ok) {
      const data = await res.json()
      throw new Error(data.error)
    }
    return res.json()
  }).then(() => {
    showToast("Tarefa atualizada!", "success")
    loadGroupTasks()
  }).catch(err => showToast(err.message, "error"))
}

function deleteGroupTask(id) {
  if (!confirm("Excluir esta tarefa?")) return
  authFetch(API + "/api/groups/" + currentGroupId + "/tasks/" + id, {
    method: "DELETE"
  }).then(async res => {
    if (!res.ok) {
      const data = await res.json()
      throw new Error(data.error)
    }
    return res.json()
  }).then(() => {
    showToast("Tarefa excluída", "info")
    loadGroupTasks()
  }).catch(err => showToast(err.message, "error"))
}



const API = (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1") && window.location.port !== "" && window.location.port !== "3000" ? "http://localhost:3000" : ""
let currentFilter = "all"
let searchTerm = ""
let allTasks = []
let currentView = "list"
let authHTML = ""

function escapeHtml(str) {
  if (!str) return str
  const el = document.createElement("div")
  el.textContent = str
  return el.innerHTML
}

function getToken() {
  return localStorage.getItem("token")
}

function authFetch(url, options = {}) {
  const token = getToken()
  if (token) {
    options.headers = options.headers || {}
    options.headers["Authorization"] = "Bearer " + token
  }
  return fetch(url, options)
}

function checkAuth() {
  if (!authHTML) authHTML = document.getElementById("auth-section").innerHTML
  const token = getToken()
  if (token) {
    document.getElementById("auth-section").innerHTML = '<div class="loading-spinner" style="padding:40px"><div class="spinner"></div><p>Verificando sessão...</p></div>'
    authFetch(API + "/me")
      .then(res => {
        if (res.ok) return res.json()
        throw new Error("Token inválido")
      })
      .then(user => {
        document.getElementById("user-name").textContent = user.nome
        document.getElementById("user-name-groups").textContent = user.nome
        document.getElementById("auth-section").style.display = "none"
        document.getElementById("tasks-section").style.display = "block"
        document.getElementById("groups-section").style.display = "none"
        document.querySelectorAll(".btn-nav").forEach(b => b.classList.remove("active"))
        document.querySelector(`.btn-nav[onclick*="'tasks'"]`).classList.add("active")
        clearInterval(notifInterval)
        notifInterval = setInterval(loadNotifications, 15000)
        loadNotifications()
        listar()
      })
      .catch(() => {
        localStorage.removeItem("token")
        localStorage.removeItem("user")
        showAuth()
      })
  } else {
    showAuth()
  }
}

function showAuth() {
  clearInterval(notifInterval)
  if (authHTML) document.getElementById("auth-section").innerHTML = authHTML
  document.getElementById("auth-section").style.display = "block"
  document.getElementById("tasks-section").style.display = "none"
  document.getElementById("groups-section").style.display = "none"
  document.getElementById("group-detail-view").style.display = "none"
  document.getElementById("groups-list-view").style.display = "block"
  document.querySelectorAll(".btn-nav").forEach(b => b.classList.remove("active"))
}

function showAuthForm(form) {
  document.querySelectorAll(".auth-tab").forEach(t => t.classList.remove("active"))
  document.querySelector(`.auth-tab[onclick*="${form}"]`).classList.add("active")
  document.getElementById("auth-login").style.display = form === "login" ? "block" : "none"
  document.getElementById("auth-register").style.display = form === "register" ? "block" : "none"
}

function login() {
  const email = document.getElementById("login-email").value
  const senha = document.getElementById("login-senha").value
  document.getElementById("login-error").textContent = ""
  fetch(API + "/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, senha })
  })
    .then(async res => {
      const text = await res.text()
      if (!text) throw new Error("Servidor retornou resposta vazia (status " + res.status + ")")
      let data
      try { data = JSON.parse(text) } catch (e) { throw new Error("Resposta inválida: " + text.substring(0, 100)) }
      if (!res.ok) throw new Error(data.error)
      return data
    })
    .then(data => {
      localStorage.setItem("token", data.token)
      localStorage.setItem("user", JSON.stringify(data.user))
      checkAuth()
    })
    .catch(err => {
      document.getElementById("login-error").textContent = err.message
      showToast(err.message, "error")
    })
}

function register() {
  const nome = document.getElementById("register-nome").value
  const email = document.getElementById("register-email").value
  const senha = document.getElementById("register-senha").value
  document.getElementById("register-error").textContent = ""
  fetch(API + "/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ nome, email, senha })
  })
    .then(async res => {
      const text = await res.text()
      if (!text) throw new Error("Servidor retornou resposta vazia (status " + res.status + ")")
      let data
      try { data = JSON.parse(text) } catch (e) { throw new Error("Resposta inválida: " + text.substring(0, 100)) }
      if (!res.ok) throw new Error(data.error)
      return data
    })
    .then(data => {
      localStorage.setItem("token", data.token)
      localStorage.setItem("user", JSON.stringify(data.user))
      checkAuth()
    })
    .catch(err => {
      document.getElementById("register-error").textContent = err.message
      showToast(err.message, "error")
    })
}

let notifInterval

function logout() {
  localStorage.removeItem("token")
  localStorage.removeItem("user")
  clearInterval(notifInterval)
  showAuth()
}

function toggleView(view) {
  currentView = view
  document.querySelectorAll(".view-btn").forEach(b => b.classList.remove("active"))
  document.querySelector(`.view-btn[data-view="${view}"]`).classList.add("active")
  if (view === "list") {
    document.getElementById("list-view").style.display = "block"
    document.getElementById("list-filters").style.display = "flex"
    document.getElementById("kanban-view").style.display = "none"
  } else {
    document.getElementById("list-view").style.display = "none"
    document.getElementById("list-filters").style.display = "none"
    document.getElementById("kanban-view").style.display = "block"
  }
  renderTasks()
}

function listar() {
  document.getElementById("lista").innerHTML = '<div class="loading-spinner"><div class="spinner"></div><p>Carregando tarefas...</p></div>'
  authFetch(API + "/tasks")
    .then(async res => {
      if (!res.ok) {
        const errData = await res.json().catch(() => ({ error: "Erro desconhecido" }))
        throw new Error(errData.error)
      }
      return res.json()
    })
    .then(tasks => {
      tasks.forEach(t => { t.titulo = escapeHtml(t.titulo); t.descricao = escapeHtml(t.descricao) })
      allTasks = tasks
      renderTasks()
    })
    .catch(err => {
      document.getElementById("lista").innerHTML = `<div class="empty-state"><span>⚠️</span><p>${err.message}</p></div>`
    })
}

function filtrarBusca() {
  searchTerm = document.getElementById("busca").value.toLowerCase()
  renderTasks()
}

function getFilteredTasks() {
  let filtered = currentFilter === "all"
    ? allTasks
    : allTasks.filter(t => t.status === currentFilter)
  if (searchTerm) {
    filtered = filtered.filter(t =>
      t.titulo.toLowerCase().includes(searchTerm) ||
      (t.descricao && t.descricao.toLowerCase().includes(searchTerm))
    )
  }
  return filtered
}

function renderTasks() {
  if (currentView === "list") {
    renderListView()
  } else {
    renderKanbanView()
  }
}

function renderListView() {
  const lista = document.getElementById("lista")
  lista.innerHTML = ""
  const filtered = getFilteredTasks()
  document.getElementById("contador").textContent = `(${filtered.length})`
  if (filtered.length === 0) {
    lista.innerHTML = `
      <div class="empty-state">
        <span>📝</span>
        <p>Nenhuma tarefa encontrada</p>
      </div>
    `
    return
  }
  filtered.forEach(task => {
    const li = document.createElement("li")
    if (task.status === "concluida") li.classList.add("concluida")
    const dataCriacao = formatDate(task.data_criacao)
    const dataConclusao = task.data_conclusao ? formatDate(task.data_conclusao) : null
    const prazoFormatado = task.prazo ? formatDate(task.prazo) : null
    const prazoAtrasado = task.prazo && new Date(task.prazo) < new Date() && task.status !== "concluida"
    li.innerHTML = `
      <div class="task-info">
        <div class="task-header">
          <span class="prioridade-dot ${task.prioridade}" title="Prioridade ${formatPrioridade(task.prioridade)}"></span>
          <strong class="task-title">${task.titulo}</strong>
        </div>
        <span class="task-desc">${task.descricao || "Sem descrição"}</span>
        <div class="task-meta">
          <span class="task-status ${task.status}">${formatStatus(task.status)}</span>
          ${prazoFormatado ? `<span class="task-prazo ${prazoAtrasado ? 'atrasado' : ''}">📅 ${prazoFormatado}</span>` : ""}
        </div>
        <div class="task-dates">
          <span class="date-created">Criada: ${dataCriacao}</span>
          ${dataConclusao ? `<span class="date-completed">Concluída: ${dataConclusao}</span>` : ""}
        </div>
      </div>
      <div class="botoes">
        <button class="btn-mover" onclick="moverTarefa('${task.id}', 'cima')" title="Mover para cima">↑</button>
        <button class="btn-mover" onclick="moverTarefa('${task.id}', 'baixo')" title="Mover para baixo">↓</button>
        ${task.status !== "andamento" ? `<button class="btn-andamento" onclick="mudarStatus('${task.id}', 'andamento')" title="Em Andamento">⏳</button>` : ""}
        ${task.status !== "concluida" ? `<button class="btn-concluir" onclick="mudarStatus('${task.id}', 'concluida')" title="Concluir">✓</button>` : ""}
        <button class="btn-deletar" onclick="deletar('${task.id}')" title="Excluir">✕</button>
      </div>
    `
    lista.appendChild(li)
  })
}

function renderKanbanView() {
  const columns = ["pendente", "andamento", "concluida"]
  columns.forEach(status => {
    const container = document.getElementById("kanban-" + status)
    container.innerHTML = ""
    let tasks = allTasks.filter(t => t.status === status)
    if (searchTerm) {
      tasks = tasks.filter(t =>
        t.titulo.toLowerCase().includes(searchTerm) ||
        (t.descricao && t.descricao.toLowerCase().includes(searchTerm))
      )
    }
    document.getElementById("count-" + status).textContent = tasks.length
    if (tasks.length === 0) {
      container.innerHTML = `<div class="kanban-empty">Nenhuma tarefa</div>`
      return
    }
    tasks.forEach(task => {
      const card = document.createElement("div")
      card.className = "kanban-card" + (task.status === "concluida" ? " concluida" : "")
      card.draggable = true
      card.dataset.id = task.id
      card.ondragstart = function(e) { dragTask(e, task.id) }
      const prazoFormatado = task.prazo ? formatDate(task.prazo) : null
      const prazoAtrasado = task.prazo && new Date(task.prazo) < new Date() && task.status !== "concluida"
      card.innerHTML = `
        <div class="kanban-card-header">
          <span class="prioridade-dot ${task.prioridade}" title="Prioridade ${formatPrioridade(task.prioridade)}"></span>
          <strong>${task.titulo}</strong>
        </div>
        ${task.descricao ? `<p class="kanban-card-desc">${task.descricao}</p>` : ""}
        <div class="kanban-card-meta">
          ${prazoFormatado ? `<span class="${prazoAtrasado ? 'atrasado' : ''}">📅 ${prazoFormatado}</span>` : ""}
        </div>
        <div class="kanban-card-actions">
          <button class="btn-deletar-sm" onclick="deletar('${task.id}')" title="Excluir">✕</button>
        </div>
      `
      container.appendChild(card)
    })
  })
}

function dragTask(e, id) {
  e.dataTransfer.setData("text/plain", id)
}

function allowDrop(e) {
  e.preventDefault()
  const column = e.target.closest(".kanban-column")
  if (column) column.setAttribute("dragover", "true")
}

function dragLeaveColumn(e) {
  const column = e.target.closest(".kanban-column")
  if (column) column.removeAttribute("dragover")
}

function dropTask(e) {
  e.preventDefault()
  const id = e.dataTransfer.getData("text/plain")
  const column = e.target.closest(".kanban-column")
  if (!column) return
  column.removeAttribute("dragover")
  const newStatus = column.dataset.status
  const task = allTasks.find(t => t.id === id)
  if (!task || task.status === newStatus) return
  mudarStatus(id, newStatus)
}

// Touch drag support for kanban
let touchDragId = null
function initTouchDrag() {
  document.addEventListener("touchstart", function(e) {
    const card = e.target.closest(".kanban-card")
    if (!card || !card.closest("#kanban-view")) return
    touchDragId = card.dataset.id
  }, {passive: true})

  document.addEventListener("touchmove", function(e) {
    if (!touchDragId) return
    e.preventDefault()
    const touch = e.touches[0]
    document.querySelectorAll(".kanban-column[dragover=true]").forEach(c => c.removeAttribute("dragover"))
    const el = document.elementFromPoint(touch.clientX, touch.clientY)
    const column = el && el.closest(".kanban-column")
    if (column) column.setAttribute("dragover", "true")
  }, {passive: false})

  document.addEventListener("touchend", function(e) {
    if (!touchDragId) return
    document.querySelectorAll(".kanban-column[dragover=true]").forEach(c => c.removeAttribute("dragover"))
    const touch = e.changedTouches[0]
    const el = document.elementFromPoint(touch.clientX, touch.clientY)
    const column = el && el.closest(".kanban-column")
    if (column) {
      const newStatus = column.dataset.status
      const task = allTasks.find(t => t.id === touchDragId)
      if (task && task.status !== newStatus) mudarStatus(touchDragId, newStatus)
    }
    touchDragId = null
  }, {passive: true})
}
initTouchDrag()

function formatDate(dateString) {
  if (!dateString) return "-"
  const date = new Date(dateString)
  return date.toLocaleDateString("pt-BR", {
    day: "2-digit", month: "2-digit", year: "numeric"
  })
}

function formatStatus(status) {
  const map = { pendente: "Pendente", andamento: "Em Andamento", concluida: "Concluída" }
  return map[status] || status
}

function formatPrioridade(prioridade) {
  const map = { alta: "Alta", media: "Média", baixa: "Baixa" }
  return map[prioridade] || prioridade
}

function criar() {
  const titulo = document.getElementById("titulo").value
  const descricao = document.getElementById("descricao").value
  const status = document.getElementById("status").value
  const prioridade = document.getElementById("prioridade").value
  const prazo = document.getElementById("prazo").value
  if (!titulo.trim()) {
    showToast("Por favor, insira um título", "warning")
    return
  }
  authFetch(API + "/tasks", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ titulo, descricao, status, prioridade, prazo: prazo || null })
  }).then(async res => {
    if (!res.ok) {
      const data = await res.json()
      throw new Error(data.error)
    }
    return res.json()
  }).then(() => {
    document.getElementById("titulo").value = ""
    document.getElementById("descricao").value = ""
    document.getElementById("prioridade").value = "media"
    document.getElementById("prazo").value = ""
    document.getElementById("status").value = "pendente"
    showToast("Tarefa criada com sucesso!", "success")
    listar()
  }).catch(err => showToast(err.message, "error"))
}

function mudarStatus(id, novoStatus) {
  authFetch(API + "/tasks/" + id, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status: novoStatus })
  }).then(async res => {
    if (!res.ok) {
      const data = await res.json()
      throw new Error(data.error)
    }
    return res.json()
  }).then(() => {
    showToast("Status atualizado!", "success")
    listar()
  }).catch(err => showToast(err.message, "error"))
}

function moverTarefa(id, direcao) {
  authFetch(API + "/tasks/" + id, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ acao: direcao })
  }).then(async res => {
    if (!res.ok) {
      const data = await res.json()
      throw new Error(data.error)
    }
    return res.json()
  }).then(() => listar()).catch(err => showToast(err.message, "error"))
}

function deletar(id) {
  if (confirm("Tem certeza que deseja excluir esta tarefa?")) {
    authFetch(API + "/tasks/" + id, {
      method: "DELETE"
    }).then(async res => {
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error)
      }
      return res.json()
    }).then(() => {
      showToast("Tarefa excluída", "info")
      listar()
    }).catch(err => showToast(err.message, "error"))
  }
}

document.querySelectorAll(".filter-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".filter-btn").forEach(b => b.classList.remove("active"))
    btn.classList.add("active")
    currentFilter = btn.dataset.filter
    renderTasks()
  })
})

// Toast notification system
function showToast(message, type = "info", duration = 3000) {
  const container = document.getElementById("toast-container")
  const toast = document.createElement("div")
  toast.className = "toast toast-" + type
  const icons = { success: "✅", error: "❌", info: "ℹ️", warning: "⚠️" }
  const msgSpan = document.createElement("span")
  msgSpan.className = "toast-msg"
  msgSpan.textContent = message
  toast.innerHTML = `<span class="toast-icon">${icons[type] || "ℹ️"}</span>`
  toast.appendChild(msgSpan)
  container.appendChild(toast)
  setTimeout(() => { toast.classList.add("toast-show") }, 10)
  setTimeout(() => {
    toast.classList.remove("toast-show")
    toast.classList.add("toast-hide")
    setTimeout(() => toast.remove(), 300)
  }, duration)
}

// Notifications
let allNotifications = []
let notifOpen = false

function loadNotifications() {
  if (!getToken()) return
  authFetch(API + "/notifications").then(res => res.json()).then(notifs => {
    allNotifications = notifs
    updateNotifBadge()
    if (notifOpen) renderNotifications()
  }).catch(() => {})
}

function updateNotifBadge() {
  const unread = allNotifications.filter(n => !n.is_read).length
  ;["notif-badge", "notif-badge-groups"].forEach(id => {
    const badge = document.getElementById(id)
    if (!badge) return
    if (unread > 0) {
      badge.textContent = unread > 99 ? "99+" : unread
      badge.style.display = "flex"
    } else {
      badge.style.display = "none"
    }
  })
}

function toggleNotifications(e) {
  notifOpen = !notifOpen
  const dropdown = document.getElementById("notif-dropdown")
  dropdown.style.display = notifOpen ? "block" : "none"
  if (notifOpen) {
    const bell = e.currentTarget
    const rect = bell.getBoundingClientRect()
    const vw = window.innerWidth
    const maxWidth = Math.min(360, vw - 20)
    dropdown.style.width = maxWidth + "px"
    dropdown.style.maxWidth = maxWidth + "px"
    let left = rect.right - maxWidth
    if (left < 10) left = 10
    if (left + maxWidth > vw - 10) left = vw - maxWidth - 10
    dropdown.style.top = (rect.bottom + 8) + "px"
    dropdown.style.left = left + "px"
    dropdown.style.right = "auto"
    dropdown.style.bottom = "auto"
    renderNotifications()
  }
}

function renderNotifications() {
  const list = document.getElementById("notif-list")
  if (allNotifications.length === 0) {
    list.innerHTML = '<div class="notif-empty">Nenhuma notificação</div>'
    return
  }
  list.innerHTML = allNotifications.map(n => `
    <div class="notif-item ${n.is_read ? 'read' : 'unread'}" onclick="markNotificationRead('${n.id}', '${n.related_group_id || ''}')">
      <div class="notif-item-icon">${getNotifIcon(n.type)}</div>
      <div class="notif-item-content">
        <p class="notif-item-msg">${escapeHtml(n.message)}</p>
        <span class="notif-item-time">${timeAgo(n.created_at)}</span>
      </div>
    </div>
  `).join("")
}

function getNotifIcon(type) {
  const icons = {
    task_assigned: "📋",
    task_completed: "✅",
    group_join: "👥"
  }
  return icons[type] || "🔔"
}

function timeAgo(dateString) {
  const now = new Date()
  const date = new Date(dateString)
  const diff = Math.floor((now - date) / 1000)
  if (diff < 60) return "agora"
  if (diff < 3600) return Math.floor(diff / 60) + "min"
  if (diff < 86400) return Math.floor(diff / 3600) + "h"
  return date.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })
}

function markNotificationRead(id, groupId) {
  authFetch(API + "/notifications/" + id + "/read", { method: "PUT" }).then(() => {
    const notif = allNotifications.find(n => n.id === id)
    if (notif) notif.is_read = true
    updateNotifBadge()
    renderNotifications()
  }).catch(() => {})
  if (groupId) {
    notifOpen = false
    document.getElementById("notif-dropdown").style.display = "none"
    if (typeof showSection === "function" && typeof openGroup === "function") {
      showSection("groups")
      openGroup(groupId)
    }
  }
}

function markAllNotificationsRead() {
  authFetch(API + "/notifications/read-all", { method: "PUT" }).then(() => {
    allNotifications.forEach(n => n.is_read = true)
    updateNotifBadge()
    renderNotifications()
  }).catch(() => {})
}

document.addEventListener("click", (e) => {
  if (e.target.closest(".btn-notif")) return
  const dropdown = document.getElementById("notif-dropdown")
  if (dropdown && dropdown.style.display !== "none" && !dropdown.contains(e.target)) {
    dropdown.style.display = "none"
    notifOpen = false
  }
})

checkAuth()

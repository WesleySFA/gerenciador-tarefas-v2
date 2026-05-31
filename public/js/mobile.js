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

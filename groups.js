const express = require('express')
const router = express.Router()
const crypto = require('crypto')
const jwt = require('jsonwebtoken')
const JWT_SECRET = process.env.JWT_SECRET
if (!JWT_SECRET) {
    console.error("FATAL: JWT_SECRET não definida em groups.js. Configure a variável de ambiente JWT_SECRET.")
    process.exit(1)
}

function sanitize(str) {
    if (typeof str !== 'string') return str
    return str.trim().replace(/<[^>]*>/g, '').substring(0, 500)
}

function authMiddleware(req, res, next) {
    const header = req.headers.authorization
    if (!header) return res.status(401).json({ error: 'Token não fornecido' })
    try {
        const decoded = jwt.verify(header.replace('Bearer ', ''), JWT_SECRET)
        req.userId = decoded.id
        next()
    } catch (err) {
        res.status(401).json({ error: 'Token inválido' })
    }
}

function generateInviteCode() {
    return crypto.randomBytes(4).toString('hex').toUpperCase()
}

function formatTask(row) {
    return {
        id: row.id.toString(),
        user_id: row.user_id,
        titulo: row.titulo,
        descricao: row.descricao,
        status: row.status,
        done: row.done === 1,
        ordem: row.ordem,
        prioridade: row.prioridade,
        prazo: row.prazo,
        group_id: row.group_id ? row.group_id.toString() : null,
        assigned_to: row.assigned_to ? row.assigned_to.toString() : null,
        assigned_nome: row.assigned_nome || null,
        data_criacao: row.created_at,
        data_conclusao: row.data_conclusao
    }
}

async function isGroupMember(pool, groupId, userId) {
    const [rows] = await pool.query(
        "SELECT role FROM group_members WHERE group_id = ? AND user_id = ?",
        [groupId, userId]
    )
    return rows.length > 0 ? rows[0].role : null
}

async function createNotification(pool, userId, type, message, relatedGroupId, relatedTaskId) {
    await pool.query(
        "INSERT INTO notifications (user_id, type, message, related_group_id, related_task_id) VALUES (?, ?, ?, ?, ?)",
        [userId, type, message, relatedGroupId || null, relatedTaskId || null]
    )
}

router.post('/groups', authMiddleware, async (req, res) => {
    try {
        const pool = req.app.get('pool')
        const nome = sanitize(req.body.nome)
        const descricao = sanitize(req.body.descricao || '')
        if (!nome) return res.status(400).json({ error: 'Nome do grupo é obrigatório' })

        let inviteCode
        let attempts = 0
        while (attempts < 10) {
            inviteCode = generateInviteCode()
            const [existing] = await pool.query("SELECT id FROM `groups` WHERE invite_code = ?", [inviteCode])
            if (existing.length === 0) break
            attempts++
        }
        if (attempts >= 10) {
            return res.status(500).json({ error: 'Erro ao gerar código de convite único. Tente novamente.' })
        }

        const [result] = await pool.query(
            "INSERT INTO `groups` (nome, descricao, owner_id, invite_code) VALUES (?, ?, ?, ?)",
            [nome, descricao, req.userId, inviteCode]
        )
        await pool.query(
            "INSERT INTO group_members (group_id, user_id, role) VALUES (?, ?, 'owner')",
            [result.insertId, req.userId]
        )
        const [group] = await pool.query("SELECT * FROM `groups` WHERE id = ?", [result.insertId])
        res.status(201).json({
            id: group[0].id.toString(),
            nome: group[0].nome,
            descricao: group[0].descricao,
            owner_id: group[0].owner_id,
            invite_code: group[0].invite_code,
            created_at: group[0].created_at,
            member_count: 1,
            role: 'owner'
        })
    } catch (err) {
        console.error(err); return res.status(500).json({ error: "Erro interno do servidor" })
    }
})

router.get('/groups', authMiddleware, async (req, res) => {
    try {
        const pool = req.app.get('pool')
        const [rows] = await pool.query(`
            SELECT g.*, gm.role,
                (SELECT COUNT(*) FROM group_members WHERE group_id = g.id) as member_count
            FROM \`groups\` g
            JOIN group_members gm ON gm.group_id = g.id AND gm.user_id = ?
            ORDER BY g.created_at DESC
        `, [req.userId])
        res.json(rows.map(g => ({
            id: g.id.toString(),
            nome: g.nome,
            descricao: g.descricao,
            owner_id: g.owner_id,
            invite_code: g.role === 'owner' ? g.invite_code : null,
            created_at: g.created_at,
            member_count: g.member_count,
            role: g.role
        })))
    } catch (err) {
        console.error(err); return res.status(500).json({ error: "Erro interno do servidor" })
    }
})

router.get('/groups/:id', authMiddleware, async (req, res) => {
    try {
        const pool = req.app.get('pool')
        const role = await isGroupMember(pool, req.params.id, req.userId)
        if (!role) return res.status(403).json({ error: 'Você não é membro deste grupo' })

        const [groups] = await pool.query("SELECT * FROM `groups` WHERE id = ?", [req.params.id])
        if (groups.length === 0) return res.status(404).json({ error: 'Grupo não encontrado' })

        const [members] = await pool.query(`
            SELECT u.id, u.nome, u.email, gm.role, gm.joined_at
            FROM group_members gm
            JOIN users u ON u.id = gm.user_id
            WHERE gm.group_id = ?
            ORDER BY FIELD(gm.role, 'owner', 'admin', 'member'), gm.joined_at ASC
        `, [req.params.id])

        const g = groups[0]
        res.json({
            id: g.id.toString(),
            nome: g.nome,
            descricao: g.descricao,
            owner_id: g.owner_id,
            invite_code: role === 'owner' ? g.invite_code : null,
            created_at: g.created_at,
            members: members.map(m => ({
                id: m.id.toString(),
                nome: m.nome,
                email: m.email,
                role: m.role,
                joined_at: m.joined_at
            })),
            role
        })
    } catch (err) {
        console.error(err); return res.status(500).json({ error: "Erro interno do servidor" })
    }
})

router.post('/groups/:id/invite', authMiddleware, async (req, res) => {
    try {
        const pool = req.app.get('pool')
        const role = await isGroupMember(pool, req.params.id, req.userId)
        if (!role || (role !== 'owner' && role !== 'admin')) {
            return res.status(403).json({ error: 'Apenas admin pode gerar convite' })
        }

        let inviteCode
        let attempts = 0
        while (attempts < 10) {
            inviteCode = generateInviteCode()
            const [existing] = await pool.query("SELECT id FROM `groups` WHERE invite_code = ?", [inviteCode])
            if (existing.length === 0) break
            attempts++
        }
        if (attempts >= 10) {
            return res.status(500).json({ error: 'Erro ao gerar código de convite único. Tente novamente.' })
        }

        await pool.query("UPDATE `groups` SET invite_code = ? WHERE id = ?", [inviteCode, req.params.id])
        return res.json({ invite_code: inviteCode })
    } catch (err) {
        console.error(err); return res.status(500).json({ error: "Erro interno do servidor" })
    }
})

router.post('/groups/join', authMiddleware, async (req, res) => {
    try {
        const pool = req.app.get('pool')
        const code = (sanitize(req.body.invite_code) || '').toUpperCase()
        if (!code) return res.status(400).json({ error: 'Código de convite é obrigatório' })

        const [groups] = await pool.query("SELECT * FROM `groups` WHERE invite_code = ?", [code])
        if (groups.length === 0) return res.status(404).json({ error: 'Código de convite inválido' })

        const group = groups[0]
        const existingRole = await isGroupMember(pool, group.id, req.userId)
        if (existingRole) return res.status(400).json({ error: 'Você já é membro deste grupo' })

        await pool.query(
            "INSERT INTO group_members (group_id, user_id, role) VALUES (?, ?, 'member')",
            [group.id, req.userId]
        )
        const [members] = await pool.query(
            "SELECT COUNT(*) as count FROM group_members WHERE group_id = ?",
            [group.id]
        )
        const [userInfo] = await pool.query("SELECT nome FROM users WHERE id = ?", [req.userId])
        if (userInfo.length > 0 && group.owner_id !== req.userId) {
            const name = userInfo[0].nome
            await createNotification(pool, group.owner_id, 'group_join',
                `${name} entrou no grupo "${group.nome}"`,
                group.id, null)
        }
        res.json({
            id: group.id.toString(),
            nome: group.nome,
            descricao: group.descricao,
            owner_id: group.owner_id,
            invite_code: group.invite_code,
            member_count: members[0].count,
            role: 'member'
        })
    } catch (err) {
        console.error(err); return res.status(500).json({ error: "Erro interno do servidor" })
    }
})

router.delete('/groups/:id/members/:userId', authMiddleware, async (req, res) => {
    try {
        const pool = req.app.get('pool')
        const role = await isGroupMember(pool, req.params.id, req.userId)
        if (!role || role !== 'owner') {
            return res.status(403).json({ error: 'Apenas o dono pode remover membros' })
        }
        if (req.userId.toString() === req.params.userId) {
            return res.status(400).json({ error: 'Você não pode remover a si mesmo' })
        }
        await pool.query(
            "DELETE FROM group_members WHERE group_id = ? AND user_id = ?",
            [req.params.id, req.params.userId]
        )
        await pool.query("UPDATE tasks SET assigned_to = NULL WHERE group_id = ? AND assigned_to = ?",
            [req.params.id, req.params.userId])
        res.json({ message: "Membro removido" })
    } catch (err) {
        console.error(err); return res.status(500).json({ error: "Erro interno do servidor" })
    }
})

router.post('/groups/:id/leave', authMiddleware, async (req, res) => {
    try {
        const pool = req.app.get('pool')
        const [groups] = await pool.query("SELECT owner_id FROM `groups` WHERE id = ?", [req.params.id])
        if (groups.length === 0) return res.status(404).json({ error: 'Grupo não encontrado' })
        if (groups[0].owner_id === req.userId) {
            return res.status(400).json({ error: 'O dono não pode sair do grupo. Transfira a propriedade ou exclua o grupo.' })
        }
        await pool.query("DELETE FROM group_members WHERE group_id = ? AND user_id = ?",
            [req.params.id, req.userId])
        await pool.query("UPDATE tasks SET assigned_to = NULL WHERE group_id = ? AND assigned_to = ?",
            [req.params.id, req.userId])
        res.json({ message: "Você saiu do grupo" })
    } catch (err) {
        console.error(err); return res.status(500).json({ error: "Erro interno do servidor" })
    }
})

router.delete('/groups/:id', authMiddleware, async (req, res) => {
    try {
        const pool = req.app.get('pool')
        const [groups] = await pool.query("SELECT owner_id FROM `groups` WHERE id = ?", [req.params.id])
        if (groups.length === 0) return res.status(404).json({ error: 'Grupo não encontrado' })
        if (groups[0].owner_id !== req.userId) {
            return res.status(403).json({ error: 'Apenas o dono pode excluir o grupo' })
        }
        await pool.query("DELETE FROM tasks WHERE group_id = ?", [req.params.id])
        await pool.query("DELETE FROM group_members WHERE group_id = ?", [req.params.id])
        await pool.query("DELETE FROM `groups` WHERE id = ?", [req.params.id])
        res.json({ message: "Grupo excluído" })
    } catch (err) {
        console.error(err); return res.status(500).json({ error: "Erro interno do servidor" })
    }
})

router.get('/groups/:id/tasks', authMiddleware, async (req, res) => {
    try {
        const pool = req.app.get('pool')
        const role = await isGroupMember(pool, req.params.id, req.userId)
        if (!role) return res.status(403).json({ error: 'Você não é membro deste grupo' })

        const [rows] = await pool.query(`
            SELECT t.*, u.nome as assigned_nome
            FROM tasks t
            LEFT JOIN users u ON u.id = t.assigned_to
            WHERE t.group_id = ?
            ORDER BY FIELD(t.prioridade, 'alta', 'media', 'baixa'), t.ordem ASC, t.created_at DESC
        `, [req.params.id])
        res.json(rows.map(formatTask))
    } catch (err) {
        console.error(err); return res.status(500).json({ error: "Erro interno do servidor" })
    }
})

router.post('/groups/:id/tasks', authMiddleware, async (req, res) => {
    try {
        const pool = req.app.get('pool')
        const role = await isGroupMember(pool, req.params.id, req.userId)
        if (!role) return res.status(403).json({ error: 'Você não é membro deste grupo' })

        const titulo = sanitize(req.body.titulo)
        const descricao = sanitize(req.body.descricao || "")
        const prioridade = ["baixa", "media", "alta"].includes(req.body.prioridade) ? req.body.prioridade : "media"
        const prazo = req.body.prazo || null
        const assigned_to = req.body.assigned_to || null
        const status = ["pendente", "andamento", "concluida"].includes(req.body.status) ? req.body.status : "pendente"

        if (!titulo) return res.status(400).json({ error: 'Título é obrigatório' })

        if (assigned_to) {
            const memberRole = await isGroupMember(pool, req.params.id, assigned_to)
            if (!memberRole) return res.status(400).json({ error: 'Usuário não é membro do grupo' })
        }

        const [maxOrdem] = await pool.query("SELECT MAX(ordem) as max FROM tasks WHERE group_id = ?", [req.params.id])
        const novaOrdem = (maxOrdem[0].max || 0) + 1

        const [result] = await pool.query(
            "INSERT INTO tasks (user_id, group_id, titulo, descricao, status, done, ordem, prioridade, prazo, assigned_to) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            [req.userId, req.params.id, titulo, descricao, status, status === "concluida" ? 1 : 0, novaOrdem, prioridade, prazo, assigned_to]
        )
        const [rows] = await pool.query(`
            SELECT t.*, u.nome as assigned_nome FROM tasks t
            LEFT JOIN users u ON u.id = t.assigned_to WHERE t.id = ?
        `, [result.insertId])

        if (assigned_to && Number(assigned_to) !== Number(req.userId)) {
            const [groupInfo] = await pool.query("SELECT nome FROM `groups` WHERE id = ?", [req.params.id])
            const groupName = groupInfo.length > 0 ? groupInfo[0].nome : "Grupo"
            await createNotification(pool, assigned_to, 'task_assigned',
                `Você foi atribuído à tarefa "${titulo}" no grupo "${groupName}"`,
                req.params.id, result.insertId)
        }

        return res.status(201).json(formatTask(rows[0]))
    } catch (err) {
        console.error(err); return res.status(500).json({ error: "Erro interno do servidor" })
    }
})

router.put('/groups/:id/tasks/:taskId', authMiddleware, async (req, res) => {
    try {
        const pool = req.app.get('pool')
        const role = await isGroupMember(pool, req.params.id, req.userId)
        if (!role) return res.status(403).json({ error: 'Você não é membro deste grupo' })

        const taskId = req.params.taskId
        const [taskCheck] = await pool.query(
            "SELECT * FROM tasks WHERE id = ? AND group_id = ?",
            [taskId, req.params.id]
        )
        if (taskCheck.length === 0) return res.status(404).json({ error: 'Tarefa não encontrada' })

        const status = ["pendente", "andamento", "concluida"].includes(req.body.status) ? req.body.status : null
        const prioridade = ["baixa", "media", "alta"].includes(req.body.prioridade) ? req.body.prioridade : undefined
        const prazo = req.body.prazo
        const assigned_to = req.body.assigned_to
        const titulo = req.body.titulo ? sanitize(req.body.titulo) : null
        const descricao = req.body.descricao !== undefined ? sanitize(req.body.descricao) : null

        if (assigned_to !== undefined) {
            if (assigned_to) {
                const memberRole = await isGroupMember(pool, req.params.id, assigned_to)
                if (!memberRole) return res.status(400).json({ error: 'Usuário não é membro do grupo' })
            }
        }

        const updates = []
        const values = []
        if (titulo !== null) { updates.push("titulo = ?"); values.push(titulo) }
        if (descricao !== null) { updates.push("descricao = ?"); values.push(descricao) }
        if (status !== null) {
            const dataConclusao = status === "concluida" ? new Date() : null
            updates.push("status = ?", "done = ?", "data_conclusao = ?")
            values.push(status, status === "concluida" ? 1 : 0, dataConclusao)
        }
        if (prioridade !== undefined) { updates.push("prioridade = ?"); values.push(prioridade) }
        if (prazo !== undefined) { updates.push("prazo = ?"); values.push(prazo || null) }
        if (assigned_to !== undefined) { updates.push("assigned_to = ?"); values.push(assigned_to) }

        if (updates.length > 0) {
            values.push(taskId, req.params.id)
            await pool.query(`UPDATE tasks SET ${updates.join(", ")} WHERE id = ? AND group_id = ?`, values)
        }

        if (assigned_to !== undefined && assigned_to) {
            const oldTask = taskCheck[0]
            if (Number(oldTask.assigned_to) !== Number(assigned_to) && Number(assigned_to) !== Number(req.userId)) {
                const [groupInfo] = await pool.query("SELECT nome FROM `groups` WHERE id = ?", [req.params.id])
                const groupName = groupInfo.length > 0 ? groupInfo[0].nome : "Grupo"
                await createNotification(pool, assigned_to, 'task_assigned',
                    `Você foi atribuído à tarefa "${titulo || oldTask.titulo}" no grupo "${groupName}"`,
                    req.params.id, taskId)
            }
        }
        if (status === "concluida" && taskCheck[0].status !== "concluida") {
            const oldTask = taskCheck[0]
            if (oldTask.user_id !== req.userId) {
                const [groupInfo] = await pool.query("SELECT nome FROM `groups` WHERE id = ?", [req.params.id])
                const groupName = groupInfo.length > 0 ? groupInfo[0].nome : "Grupo"
                await createNotification(pool, oldTask.user_id, 'task_completed',
                    `A tarefa "${oldTask.titulo}" foi concluída no grupo "${groupName}"`,
                    req.params.id, taskId)
            }
            if (oldTask.assigned_to && Number(oldTask.assigned_to) !== Number(req.userId)) {
                const [groupInfo] = await pool.query("SELECT nome FROM `groups` WHERE id = ?", [req.params.id])
                const groupName = groupInfo.length > 0 ? groupInfo[0].nome : "Grupo"
                await createNotification(pool, oldTask.assigned_to, 'task_completed',
                    `A tarefa "${oldTask.titulo}" foi concluída no grupo "${groupName}"`,
                    req.params.id, taskId)
            }
        }

        const [rows] = await pool.query(`
            SELECT t.*, u.nome as assigned_nome FROM tasks t
            LEFT JOIN users u ON u.id = t.assigned_to WHERE t.id = ?
        `, [taskId])
        res.json(formatTask(rows[0]))
    } catch (err) {
        console.error(err); return res.status(500).json({ error: "Erro interno do servidor" })
    }
})

router.delete('/groups/:id/tasks/:taskId', authMiddleware, async (req, res) => {
    try {
        const pool = req.app.get('pool')
        const role = await isGroupMember(pool, req.params.id, req.userId)
        if (!role) return res.status(403).json({ error: 'Você não é membro deste grupo' })

        await pool.query(
            "DELETE FROM tasks WHERE id = ? AND group_id = ?",
            [req.params.taskId, req.params.id]
        )
        return res.json({ message: "Tarefa deletada" })
    } catch (err) {
        console.error(err); return res.status(500).json({ error: "Erro interno do servidor" })
    }
})

module.exports = router

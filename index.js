require('dotenv').config()
const express = require('express')
const cors = require('cors')
const mysql = require('mysql2/promise')
const jwt = require('jsonwebtoken')
const bcrypt = require('bcryptjs')
const groupsRouter = require('./groups')

const app = express()
const PORT = process.env.PORT || 3000
const JWT_SECRET = process.env.JWT_SECRET
if (!JWT_SECRET) {
    console.error("JWT_SECRET não definido no .env! Encerrando.")
    process.exit(1)
}
app.use(cors())
app.use((req, res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.path} - IP: ${req.ip}, Origin: ${req.headers.origin || 'none'}, Content-Type: ${req.headers['content-type'] || 'none'}`)
    next()
})
app.use(express.json())
app.use(express.static('public'))

// Health check (always responds, even without DB)
app.get('/health', (req, res) => {
    res.json({ status: dbReady ? "ok" : "starting", timestamp: new Date().toISOString() })
})
const DB_CONFIG = (() => {
    const dbUrl = process.env.MYSQL_URL || process.env.DATABASE_URL
    if (dbUrl) {
        const url = new URL(dbUrl)
        return {
            host: url.hostname,
            user: url.username,
            password: url.password,
            port: url.port || 3306,
            waitForConnections: true,
            connectionLimit: 10,
            connectTimeout: 10000,
            queueLimit: 0
        }
    }
    return {
        host: process.env.DB_HOST || 'localhost',
        user: process.env.DB_USER || 'root',
        password: process.env.DB_PASSWORD || '',
        waitForConnections: true,
        connectionLimit: 10,
        connectTimeout: 10000,
        queueLimit: 0
    }
})()

let pool
let dbReady = false

async function initDB() {
    let dbName = process.env.DB_NAME || 'tarefas_db'
    const dbUrl = process.env.MYSQL_URL || process.env.DATABASE_URL
    if (dbUrl) {
        try {
            const url = new URL(dbUrl)
            dbName = url.pathname.replace('/', '') || dbName
        } catch (e) {
            console.error("Erro ao parsear URL do banco:", e.message)
        }
    }
    if (!/^[a-zA-Z0-9_]+$/.test(dbName)) {
        console.error("DB_NAME inválido! Use apenas letras, números e underscore.")
        dbReady = false
        return
    }

    const tempPool = mysql.createPool({ ...DB_CONFIG, connectionLimit: 2, database: undefined })
    try {
        const conn = await tempPool.getConnection()
        try {
            await conn.query(`CREATE DATABASE IF NOT EXISTS \`${dbName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`)
        } finally {
            conn.release()
        }
    } catch (e) {
        console.error("Erro ao conectar no MySQL:", e.message)
        console.error("Tabelas serão criadas quando o banco estiver disponível.")
        await tempPool.end().catch(() => {})
        dbReady = false
        return
    }
    await tempPool.end().catch(() => {})

    pool = mysql.createPool({ ...DB_CONFIG, database: dbName })
    app.set('pool', pool)

    const connection = await pool.getConnection()
    try {
        await connection.query(`
            CREATE TABLE IF NOT EXISTS users (
                id INT AUTO_INCREMENT PRIMARY KEY,
                nome VARCHAR(100) NOT NULL,
                email VARCHAR(255) NOT NULL UNIQUE,
                senha VARCHAR(255) NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `)
        await connection.query(`
            CREATE TABLE IF NOT EXISTS tasks (
                id INT AUTO_INCREMENT PRIMARY KEY,
                user_id INT NOT NULL,
                titulo VARCHAR(255) NOT NULL,
                descricao TEXT,
                status VARCHAR(50) DEFAULT 'pendente',
                done TINYINT DEFAULT 0,
                ordem INT DEFAULT 0,
                prioridade VARCHAR(20) DEFAULT 'media',
                prazo DATETIME DEFAULT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                data_conclusao DATETIME DEFAULT NULL
            )
        `)
        try { await connection.query("ALTER TABLE tasks ADD CONSTRAINT fk_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE") } catch (e) { console.warn("Migration note:", e.message) }
        try { await connection.query("ALTER TABLE tasks ADD COLUMN group_id INT DEFAULT NULL") } catch (e) { console.warn("Migration note:", e.message) }
        try { await connection.query("ALTER TABLE tasks ADD COLUMN assigned_to INT DEFAULT NULL") } catch (e) { console.warn("Migration note:", e.message) }
        try { await connection.query("ALTER TABLE tasks ADD CONSTRAINT fk_assigned FOREIGN KEY (assigned_to) REFERENCES users(id) ON DELETE SET NULL") } catch (e) { console.warn("Migration note:", e.message) }
        await connection.query(`
            CREATE TABLE IF NOT EXISTS \`groups\` (
                id INT AUTO_INCREMENT PRIMARY KEY,
                nome VARCHAR(255) NOT NULL,
                descricao TEXT,
                owner_id INT NOT NULL,
                invite_code VARCHAR(20) NOT NULL UNIQUE,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE
            )
        `)
        try { await connection.query("ALTER TABLE tasks ADD CONSTRAINT fk_group FOREIGN KEY (group_id) REFERENCES `groups`(id) ON DELETE CASCADE") } catch (e) { console.warn("Migration note:", e.message) }
        await connection.query(`
            CREATE TABLE IF NOT EXISTS group_members (
                id INT AUTO_INCREMENT PRIMARY KEY,
                group_id INT NOT NULL,
                user_id INT NOT NULL,
                role ENUM('owner','admin','member') DEFAULT 'member',
                joined_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (group_id) REFERENCES \`groups\`(id) ON DELETE CASCADE,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
                UNIQUE KEY unique_member (group_id, user_id)
            )
        `)
        try { await connection.query("ALTER TABLE `groups` ADD INDEX idx_invite_code (invite_code)") } catch (e) { console.warn("Migration note:", e.message) }
        try { await connection.query("ALTER TABLE tasks ADD INDEX idx_user_id (user_id)") } catch (e) { console.warn("Migration note:", e.message) }
        try { await connection.query("ALTER TABLE tasks ADD INDEX idx_group_id (group_id)") } catch (e) { console.warn("Migration note:", e.message) }
        await connection.query(`
            CREATE TABLE IF NOT EXISTS notifications (
                id INT AUTO_INCREMENT PRIMARY KEY,
                user_id INT NOT NULL,
                type VARCHAR(50) NOT NULL,
                message TEXT NOT NULL,
                related_group_id INT DEFAULT NULL,
                related_task_id INT DEFAULT NULL,
                is_read TINYINT DEFAULT 0,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            )
        `)
        dbReady = true
        console.log("Banco de dados atualizado com sucesso")
    } finally {
        connection.release()
    }
}

// Middleware that blocks DB-dependent routes when DB is not ready
function requireDB(req, res, next) {
    if (!dbReady) {
        return res.status(503).json({ error: "Banco de dados ainda não disponível. Tente novamente em instantes." })
    }
    next()
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
app.post('/register', requireDB, async (req, res) => {
    const nome = sanitize(req.body.nome)
    const email = sanitize(req.body.email)
    const senha = req.body.senha
    if (!nome || !email || !senha) {
        return res.status(400).json({ error: 'Preencha todos os campos' })
    }
    if (senha.length < 6) {
        return res.status(400).json({ error: 'Senha deve ter no mínimo 6 caracteres' })
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return res.status(400).json({ error: 'Email inválido' })
    }
    try {
        const [existing] = await pool.query("SELECT id FROM users WHERE email = ?", [email])
        if (existing.length > 0) {
            return res.status(400).json({ error: 'Email já cadastrado' })
        }
        const senhaHash = await bcrypt.hash(senha, 10)
        const [result] = await pool.query("INSERT INTO users (nome, email, senha) VALUES (?, ?, ?)", [nome, email, senhaHash])
        const token = jwt.sign({ id: result.insertId }, JWT_SECRET, { expiresIn: '7d' })
        return res.status(201).json({ token, user: { id: result.insertId, nome, email } })
    } catch (err) {
        console.error(err); return res.status(500).json({ error: "Erro interno do servidor" })
    }
})
app.post('/login', requireDB, async (req, res) => {
    const email = sanitize(req.body.email)
    const senha = req.body.senha
    if (!email || !senha) {
        return res.status(400).json({ error: 'Preencha todos os campos' })
    }
    try {
        const [users] = await pool.query("SELECT * FROM users WHERE email = ?", [email])
        if (users.length === 0) {
            return res.status(401).json({ error: 'Email ou senha inválidos' })
        }
        const user = users[0]
        const senhaValida = await bcrypt.compare(senha, user.senha)
        if (!senhaValida) {
            return res.status(401).json({ error: 'Email ou senha inválidos' })
        }
        const token = jwt.sign({ id: user.id }, JWT_SECRET, { expiresIn: '7d' })
        return res.json({ token, user: { id: user.id, nome: user.nome, email: user.email } })
    } catch (err) {
        console.error(err); return res.status(500).json({ error: "Erro interno do servidor" })
    }
})
app.get('/me', authMiddleware, requireDB, async (req, res) => {
    try {
        const [users] = await pool.query("SELECT id, nome, email FROM users WHERE id = ?", [req.userId])
        if (users.length === 0) return res.status(404).json({ error: 'Usuário não encontrado' })
        res.json(users[0])
    } catch (err) {
        console.error(err); return res.status(500).json({ error: "Erro interno do servidor" })
    }
})
app.get('/tasks', authMiddleware, requireDB, async (req, res) => {
    try {
        const [rows] = await pool.query("SELECT * FROM tasks WHERE user_id = ? AND group_id IS NULL ORDER BY FIELD(prioridade, 'alta', 'media', 'baixa'), ordem ASC, created_at DESC", [req.userId])
        res.json(rows.map(formatTask))
    } catch (err) {
        console.error(err); return res.status(500).json({ error: "Erro interno do servidor" })
    }
})
app.post('/tasks', authMiddleware, requireDB, async (req, res) => {
    const titulo = sanitize(req.body.titulo)
    const descricao = sanitize(req.body.descricao || "")
    const status = ["pendente", "andamento", "concluida"].includes(req.body.status) ? req.body.status : "pendente"
    const prioridade = ["baixa", "media", "alta"].includes(req.body.prioridade) ? req.body.prioridade : "media"
    const prazo = req.body.prazo || null
    if (!titulo) {
        return res.status(400).json({ error: 'Título é obrigatório' })
    }
    try {
        const [maxOrdem] = await pool.query("SELECT MAX(ordem) as max FROM tasks WHERE user_id = ? AND group_id IS NULL", [req.userId])
        const novaOrdem = (maxOrdem[0].max || 0) + 1
        const [result] = await pool.query(
            "INSERT INTO tasks (user_id, titulo, descricao, status, done, ordem, prioridade, prazo) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            [req.userId, titulo, descricao, status, status === "concluida" ? 1 : 0, novaOrdem, prioridade, prazo]
        )
        const [rows] = await pool.query("SELECT * FROM tasks WHERE id = ?", [result.insertId])
        return res.status(201).json(formatTask(rows[0]))
    } catch (err) {
        console.error(err); return res.status(500).json({ error: "Erro interno do servidor" })
    }
})
app.put('/tasks/:id', authMiddleware, requireDB, async (req, res) => {
    const acao = req.body.acao
    const status = ["pendente", "andamento", "concluida"].includes(req.body.status) ? req.body.status : null
    const prioridade = ["baixa", "media", "alta"].includes(req.body.prioridade) ? req.body.prioridade : undefined
    const prazo = req.body.prazo
    const id = req.params.id
    try {
        const [taskCheck] = await pool.query("SELECT * FROM tasks WHERE id = ? AND user_id = ? AND group_id IS NULL", [id, req.userId])
        if (taskCheck.length === 0) return res.status(404).json({ error: 'Tarefa não encontrada' })
        if (acao === 'mover_cima') {
            const [tasks] = await pool.query("SELECT * FROM tasks WHERE user_id = ? AND group_id IS NULL ORDER BY FIELD(prioridade, 'alta', 'media', 'baixa'), ordem ASC", [req.userId])
            const currentIndex = tasks.findIndex(t => t.id.toString() === id)
            if (currentIndex > 0) {
                const currentTask = tasks[currentIndex]
                const aboveTask = tasks[currentIndex - 1]
                await pool.query("UPDATE tasks SET ordem = ? WHERE id = ? AND user_id = ?", [aboveTask.ordem, currentTask.id, req.userId])
                await pool.query("UPDATE tasks SET ordem = ? WHERE id = ? AND user_id = ?", [currentTask.ordem, aboveTask.id, req.userId])
            }
            const [rows] = await pool.query("SELECT * FROM tasks WHERE id = ?", [id])
            return res.json(rows[0] ? formatTask(rows[0]) : {})
        }
        if (acao === 'mover_baixo') {
            const [tasks] = await pool.query("SELECT * FROM tasks WHERE user_id = ? AND group_id IS NULL ORDER BY FIELD(prioridade, 'alta', 'media', 'baixa'), ordem ASC", [req.userId])
            const currentIndex = tasks.findIndex(t => t.id.toString() === id)
            if (currentIndex < tasks.length - 1) {
                const currentTask = tasks[currentIndex]
                const belowTask = tasks[currentIndex + 1]
                await pool.query("UPDATE tasks SET ordem = ? WHERE id = ? AND user_id = ?", [belowTask.ordem, currentTask.id, req.userId])
                await pool.query("UPDATE tasks SET ordem = ? WHERE id = ? AND user_id = ?", [currentTask.ordem, belowTask.id, req.userId])
            }
            const [rows] = await pool.query("SELECT * FROM tasks WHERE id = ?", [id])
            return res.json(rows[0] ? formatTask(rows[0]) : {})
        }
        if (prioridade !== undefined || prazo !== undefined) {
            const updates = []; const values = []
            if (prioridade !== undefined) { updates.push("prioridade = ?"); values.push(prioridade) }
            if (prazo !== undefined) { updates.push("prazo = ?"); values.push(prazo || null) }
            values.push(id, req.userId)
            await pool.query(`UPDATE tasks SET ${updates.join(", ")} WHERE id = ? AND user_id = ? AND group_id IS NULL`, values)
            const [rows] = await pool.query("SELECT * FROM tasks WHERE id = ?", [id])
            return res.json(formatTask(rows[0]))
        }
        if (status !== null) {
            const dataConclusao = status === "concluida" ? new Date() : null
            await pool.query("UPDATE tasks SET status = ?, done = ?, data_conclusao = ? WHERE id = ? AND user_id = ? AND group_id IS NULL",
                [status, status === "concluida" ? 1 : 0, dataConclusao, id, req.userId])
            return res.json({ id, status, done: status === "concluida", data_conclusao: dataConclusao })
        } else if (req.body.done !== undefined) {
            const [rows] = await pool.query("SELECT * FROM tasks WHERE id = ? AND user_id = ? AND group_id IS NULL", [id, req.userId])
            if (rows.length === 0) return res.status(404).json({ error: "Tarefa não encontrada" })
            const newDone = req.body.done ? 1 : 0
            const newStatus = newDone ? "concluida" : "pendente"
            const dataConclusao = newDone ? new Date() : null
            await pool.query("UPDATE tasks SET status = ?, done = ?, data_conclusao = ? WHERE id = ? AND user_id = ? AND group_id IS NULL",
                [newStatus, newDone, dataConclusao, id, req.userId])
            return res.json({ id, status: newStatus, done: newDone === 1, data_conclusao: dataConclusao })
        } else {
            const [rows] = await pool.query("SELECT * FROM tasks WHERE id = ? AND user_id = ? AND group_id IS NULL", [id, req.userId])
            return res.json(rows[0] ? formatTask(rows[0]) : {})
        }
    } catch (err) {
        console.error(err); return res.status(500).json({ error: "Erro interno do servidor" })
    }
})
app.delete('/tasks/:id', authMiddleware, requireDB, async (req, res) => {
    try {
        await pool.query("DELETE FROM tasks WHERE id = ? AND user_id = ? AND group_id IS NULL", [req.params.id, req.userId])
        return res.json({ message: "Tarefa deletada" })
    } catch (err) {
        console.error(err); return res.status(500).json({ error: "Erro interno do servidor" })
    }
})
app.get('/notifications', authMiddleware, requireDB, async (req, res) => {
    try {
        const [rows] = await pool.query(
            "SELECT * FROM notifications WHERE user_id = ? ORDER BY is_read ASC, created_at DESC LIMIT 50",
            [req.userId]
        )
        res.json(rows.map(n => ({
            id: n.id.toString(),
            user_id: n.user_id,
            type: n.type,
            message: n.message,
            related_group_id: n.related_group_id ? n.related_group_id.toString() : null,
            related_task_id: n.related_task_id ? n.related_task_id.toString() : null,
            is_read: n.is_read === 1,
            created_at: n.created_at
        })))
    } catch (err) {
        console.error(err); return res.status(500).json({ error: "Erro interno do servidor" })
    }
})
app.put('/notifications/read-all', authMiddleware, requireDB, async (req, res) => {
    try {
        await pool.query("UPDATE notifications SET is_read = 1 WHERE user_id = ?", [req.userId])
        res.json({ message: "Todas notificações marcadas como lidas" })
    } catch (err) {
        console.error(err); return res.status(500).json({ error: "Erro interno do servidor" })
    }
})
app.put('/notifications/:id/read', authMiddleware, requireDB, async (req, res) => {
    try {
        await pool.query("UPDATE notifications SET is_read = 1 WHERE id = ? AND user_id = ?", [req.params.id, req.userId])
        res.json({ message: "Notificação marcada como lida" })
    } catch (err) {
        console.error(err); res.status(500).json({ error: "Erro interno do servidor" })
    }
})
app.get('/notifications/unread-count', authMiddleware, requireDB, async (req, res) => {
    try {
        const [rows] = await pool.query("SELECT COUNT(*) as count FROM notifications WHERE user_id = ? AND is_read = 0", [req.userId])
        res.json({ count: rows[0].count })
    } catch (err) {
        console.error(err); return res.status(500).json({ error: "Erro interno do servidor" })
    }
})
app.use('/api', groupsRouter)

app.use((err, req, res, next) => {
    console.error("Erro não tratado:", err)
    if (res.headersSent) return
    res.status(500).json({ error: "Erro interno do servidor" })
})

app.use((req, res) => {
    if (!res.headersSent) {
        res.status(404).json({ error: `Rota ${req.method} ${req.path} não encontrada` })
    }
})

app.listen(PORT, () => {
    console.log("Servidor rodando http://localhost:3000")
    initDB().then(() => {
        console.log("Banco de dados MySQL conectado")
    }).catch(err => {
        console.error("Falha ao conectar no MySQL:", err.message)
    })
})

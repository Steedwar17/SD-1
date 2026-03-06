const express = require("express")
const cors = require("cors")
const path = require("path")

const app = express()
const PORT = 3000
const TIMEOUT = 10000

app.use(express.static(__dirname + "/public"))
app.use(cors())
app.use(express.json())

app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "public", "index.html"))
})

let servers = {}
let totalTimeouts = 0

let coordinadoresBackup = []
let contadorCoordinadores = 1
let contadorWorkers = 1
let esPrimario = true

function normalizarUrl(url) {
    return url.trim().replace(/\/+$/, "")
}

function tieneEstructuraBackupValida(url) {
    try {
        const parsed = new URL(url)
        const hostValido = /^[a-z0-9-]+\.ngrok-free\.dev$/i.test(parsed.hostname)
        return parsed.protocol === "https:" && hostValido
    } catch (error) {
        return false
    }
}

// ---------------- REGISTRAR WORKER ----------------

app.post("/register", async (req, res) => {
    esPrimario = true
    const { id, url } = req.body

    if (!id || !url) {
        return res.status(400).json({ error: "Se requiere Id y URL" })
    }

    if (!servers[id]) {
        servers[id] = {
            id,
            nombre: "Worker " + contadorWorkers++,  
            url,
            lastPulse: Date.now()
        }
    } else {
        servers[id].lastPulse = Date.now()
        servers[id].url = url
       
    }

    await replicarABackups()
    res.json({ message: "registrado" })
})

// ---------------- PULSE ----------------
app.post("/pulse", async (req, res) => {
    esPrimario = true
    const { id } = req.body

    if (!servers[id]) {
        return res.status(400).json({ error: "Worker no encontrado" })
    }

    servers[id].lastPulse = Date.now()

    if (!servers[id].nombre) {
        servers[id].nombre = "Worker " + contadorWorkers++
    }

    await replicarABackups()
    res.json({ message: "pulso recibido" })
})

// ---------------- REGISTRAR BACKUP ----------------
app.post("/register-backup", async (req, res) => {

    let { url } = req.body

    if (typeof url !== "string" || !url.trim()) {
        return res.status(400).json({ error: "Se requiere URL" })
    }

    url = normalizarUrl(url)

    if (!tieneEstructuraBackupValida(url)) {
        return res.status(400).json({ error: "Fastidiosit@" })
    }

    const existe = coordinadoresBackup.find(c => c.url === url)

    if (existe) {
        return res.json({ message: "backup ya registrado" })
    }

    coordinadoresBackup.push({
        nombre: "Coordinador " + contadorCoordinadores++,
        url
    })

    res.json({ message: "backup registrado correctamente" })
})

// ---------------- ELIMINAR BACKUP ----------------
app.post("/delete-backup", (req, res) => {

    const { url } = req.body

    coordinadoresBackup = coordinadoresBackup.filter(c => c.url !== url)

    res.json({ message: "backup eliminado" })
})

// ---------------- LISTAR BACKUPS ----------------
app.get("/backups", (req, res) => {
    res.json(coordinadoresBackup)
})

// ---------------- SINCRONIZAR WORKERS ----------------
app.get("/sync-workers", (req, res) => {
    res.json(Object.values(servers))
})

// ---------------- REPLICATE ----------------
app.post("/replicate", (req, res) => {

    const listaWorkers = req.body

    if (Array.isArray(listaWorkers)) {

        listaWorkers.forEach(worker => {

            if (!servers[worker.id] ||
                worker.lastPulse > servers[worker.id].lastPulse) {

                servers[worker.id] = worker
            }

        })
    }

    esPrimario = false

    res.json({ message: "estado replicado" })
})

// ---------------- REPLICACION AUTOMATICA ----------------
async function replicarABackups() {

    const listaWorkers = Object.values(servers)

    for (let backup of coordinadoresBackup) {

        try {

            await fetch(backup.url + "/replicate", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(listaWorkers)
            })

        } catch (error) {
            console.log("No se pudo replicar a:", backup.url)
        }
    }
}

// ---------------- FORZAR SYNC ----------------
app.post("/forzar-sync", async (req, res) => {

    const { url } = req.body

    try {

        const respuesta = await fetch(url + "/sync-workers")
        const datos = await respuesta.json()

        datos.forEach(worker => {
            servers[worker.id] = worker
        })

        res.json({ message: "sincronizado correctamente" })

    } catch (error) {
        res.status(500).json({ error: "Error sincronizando" })
    }
})

// ---------------- METRICAS ----------------
app.get("/metrics", (req, res) => {

    res.json({
        totalWorkers: Object.keys(servers).length,
        totalBackups: coordinadoresBackup.length,
        totalTimeouts,
        esPrimario,
        timestampSistema: Date.now()
    })
})

app.get("/servers", (req, res) => {
    res.json(Object.values(servers))
})

// ---------------- TIMEOUT ----------------
setInterval(() => {

    const now = Date.now()

    for (let id in servers) {

        if (now - servers[id].lastPulse > TIMEOUT) {
            delete servers[id]
            totalTimeouts++
        }
    }

}, 10000)

app.listen(PORT, () => {
    console.log("Coordinador ejecutándose en puerto", PORT)

})

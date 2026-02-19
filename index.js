const express = require("express")
const cors = require("cors")
const path = require("path") 

const app = express()
const PORT = 3000
const TIMEOUT = 5000

app.use(express.static(__dirname + '/public'));
app.use(cors())
app.use(express.json())

app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

let servers = {}
let totalTimeouts = 0

app.post("/register", (req, res) => {
    const { id, url } = req.body

    if (!id || !url) {
        return res.status(400).json({error: "Se requiere Id y URL"})
    }

    servers[id] = {
        id,
        url,
        lastPulse: Date.now()
    }

    console.log(`Servidor registrado ${id} - ${url}`)

    res.json({message: "registrado"})
})

app.post("/pulse", (req, res) => {
        const { id } = req.body
        if(!servers[id]){
            return res.status(400).json({error: "No se encuentra el server"})
        }

        servers[id].lastPulse = Date.now()

        res.json({ message: "pulsorecibido"})
        console.log(`pulso recibido`)
})

app.get("/servers", (req, res) => {
    res.json(Object.values(servers)); 
});

app.get("/metrics", (req, res) => {
    res.json({
        totalServers: Object.keys(servers).length + totalTimeouts,
        currentActive: Object.keys(servers).length,
        totalTimeouts,
        timestamp: new Date().toLocaleString()
    })
})

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
    console.log(`Coordinador corriendo en ${PORT}`)
})
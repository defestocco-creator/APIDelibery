// index.js - API Pedidos v0.2
import express from "express";
import cors from "cors";
import dotenv from "dotenv";
dotenv.config();

import db from "./firebase.js";
import { ref, push, get } from "firebase/database";

const app = express();
app.use(cors());
app.use(express.json());

// Função para gerar nome da pasta no padrão DDMMAAAA
function pastaDoDia() {
  const hoje = new Date();
  const dd = String(hoje.getDate()).padStart(2, "0");
  const mm = String(hoje.getMonth() + 1).padStart(2, "0");
  const yyyy = hoje.getFullYear();
  return `PEDIDOS_MANUAIS_${dd}${mm}${yyyy}`;
}

// Health-check
app.get("/", (req, res) => {
  res.send({
    ok: true,
    message: "API Pedidos v0.2 rodando — Firebase Realtime",
    pastaHoje: pastaDoDia(),
    timestamp: new Date().toISOString(),
  });
});

/* ---------------------------------------------------------
   🔥 Criar pedido manual
--------------------------------------------------------- */
app.post("/pedido", async (req, res) => {
  try {
    const pasta = pastaDoDia();
    const pedido = req.body;

    // Garantir que sempre tenha status e id únicos
    pedido.status = pedido.status || "pendente";
    if (!pedido.id) {
      pedido.id = Date.now().toString(); // gera ID usando timestamp
    }

    const novoRef = await push(ref(db, pasta), pedido);

    res.status(201).json({
      ok: true,
      firebase_id: novoRef.key,
      pasta,
      pedido,
    });
  } catch (err) {
    console.error("POST /pedido error:", err);
    res.status(500).json({ erro: err.message });
  }
});

/* ---------------------------------------------------------
   🗂️ Listar pedidos do dia
--------------------------------------------------------- */
app.get("/pedidos", async (req, res) => {
  try {
    const pasta = pastaDoDia();
    const snapshot = await get(ref(db, pasta));
    res.json(snapshot.exists() ? snapshot.val() : {});
  } catch (err) {
    console.error("GET /pedidos error:", err);
    res.status(500).json({ erro: err.message });
  }
});

/* ---------------------------------------------------------
   🗂️ Listar pedidos de uma data específica (DDMMAAAA)
--------------------------------------------------------- */
app.get("/pedidos/:data", async (req, res) => {
  try {
    const data = req.params.data; // formato DDMMAAAA
    const pasta = `PEDIDOS_MANUAIS_${data}`;

    const snapshot = await get(ref(db, pasta));
    res.json(snapshot.exists() ? snapshot.val() : {});
  } catch (err) {
    console.error("GET /pedidos/:data error:", err);
    res.status(500).json({ erro: err.message });
  }
});

// Porta Render
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`API Pedidos v0.2 rodando na porta ${PORT}`);
});

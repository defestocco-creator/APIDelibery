// index.js - API Pedidos v0.3
import express from "express";
import cors from "cors";
import dotenv from "dotenv";
dotenv.config();

import db from "./firebase.js";
import { ref, push, get, set } from "firebase/database";

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
    message: "API Pedidos v0.3 rodando — Firebase Realtime",
    pastaHoje: pastaDoDia(),
    timestamp: new Date().toISOString(),
  });
});

/* ---------------------------------------------------------
   🔥 Criar pedido manual (versão 0.3)
--------------------------------------------------------- */
app.post("/pedido", async (req, res) => {
  try {
    const pasta = pastaDoDia();

    const {
      numeroPedido,
      cliente,
      endereco,
      estimatedDeliveryMinutes,
      motoboy,
      motoboyId,
      pagamento,
      taxa,
      telefone,
      valor_total,
      status,
      pedidoItens
    } = req.body;

    // ----------------------------
    // ✔ Validações v0.3
    // ----------------------------

    // numeroPedido é obrigatório e deve ser inteiro
    if (numeroPedido === undefined || numeroPedido === null)
      return res.status(400).json({ erro: "numeroPedido é obrigatório" });

    if (isNaN(parseInt(numeroPedido)))
      return res.status(400).json({ erro: "numeroPedido deve ser um número inteiro" });

    // pedidoItens deve ser um array JSON
    if (!pedidoItens || !Array.isArray(pedidoItens))
      return res.status(400).json({ erro: "pedidoItens deve ser um array JSON" });

    // Criar referência no Firebase
    const novoRef = push(ref(db, pasta));

    const novoPedido = {
      id: novoRef.key, // ID gerado pelo Firebase

      numeroPedido: parseInt(numeroPedido), // número sequencial do AnotaAi

      cliente: cliente || "Cliente",
      endereco: endereco || {},
      estimatedDeliveryMinutes: estimatedDeliveryMinutes || 0,

      motoboy: motoboy || {},
      motoboyId: motoboyId || null,

      pagamento: pagamento || "Outros",
      taxa: taxa || 0,
      telefone: telefone || "-",
      valor_total: valor_total || 0,

      status: status || "pendente",

      pedidoItens, // JSON dos itens do pedido

      criadoEm: Date.now()
    };

    // grava no Firebase
    await set(novoRef, novoPedido);

    res.status(201).json({
      ok: true,
      firebase_id: novoRef.key,
      pasta,
      pedido: novoPedido,
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
  console.log(`API Pedidos v0.3 rodando na porta ${PORT}`);
});

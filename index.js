// index.js — API Pedidos v0.5 (JWT + Métricas + Firebase)
import express from "express";
import cors from "cors";
import dotenv from "dotenv";
dotenv.config();

import jwt from "jsonwebtoken";

import db from "./firebase.js";
import { ref, push, get } from "firebase/database";

import { metricas } from "./metrics.js"; // 🔥 captura tudo

const app = express();

// Ordem correta:
app.use(cors());
app.use(express.json());
app.use(metricas); // 🔥 captura latência de todas rotas

/* ============================================================
    JWT – Autenticação
============================================================ */

function checkJWT(req, res, next) {
  const header = req.headers.authorization;

  if (!header) {
    return res.status(401).json({ erro: "Token não enviado" });
  }

  const token = header.replace("Bearer ", "");

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ erro: "Token inválido ou expirado" });
  }
}

app.post("/login", (req, res) => {
  const { usuario, senha } = req.body;

  if (usuario !== process.env.API_USER || senha !== process.env.API_PASS) {
    return res.status(401).json({ erro: "Usuário ou senha incorretos" });
  }

  const token = jwt.sign(
    { usuario },
    process.env.JWT_SECRET,
    { expiresIn: "10h" }
  );

  res.json({ ok: true, token });
});

/* ============================================================
    Função util
============================================================ */

function pastaDoDia() {
  const hoje = new Date();
  const dd = String(hoje.getDate()).padStart(2, "0");
  const mm = String(hoje.getMonth() + 1).padStart(2, "0");
  const yyyy = hoje.getFullYear();
  return `PEDIDOS_MANUAIS_${dd}${mm}${yyyy}`;
}

/* ============================================================
    Health-check
============================================================ */

app.get("/", (req, res) => {
  res.send({
    ok: true,
    message: "API Pedidos v0.5 rodando — JWT + Firebase + Métricas",
    pastaHoje: pastaDoDia(),
    timestamp: new Date().toISOString(),
  });
});

/* ============================================================
    Criar Pedido (protegido)
============================================================ */

app.post("/pedido", checkJWT, async (req, res) => {
  try {
    const pasta = pastaDoDia();
    const body = req.body;

    if (!body.cliente || typeof body.cliente !== "string") {
      return res.status(400).json({ erro: "cliente é obrigatório" });
    }

    if (!body.endereco || typeof body.endereco !== "object") {
      return res.status(400).json({ erro: "endereco inválido" });
    }

    const endereco = {
      bairro: body.endereco.bairro || "",
      numero: body.endereco.numero || "",
      referencia: body.endereco.referencia || "",
      rua: body.endereco.rua || ""
    };

    const pedido = {
      cliente: body.cliente,
      endereco,
      estimatedDeliveryMinutes: body.estimatedDeliveryMinutes || 30,
      id: body.id || Date.now(),
      tipoPedido: body.tipoPedido || "Entrega",
      motoboy: body.motoboy || { id: "", nome: "" },
      pagamento: body.pagamento || "Outros",
      status: body.status || "pendente",
      taxa: body.taxa || 0,
      telefone: body.telefone || "-",
      valor_total: body.valor_total || 0,
      itens: body.itens || {}
    };

    const novoRef = await push(ref(db, pasta), pedido);

    res.status(201).json({
      ok: true,
      firebase_id: novoRef.key,
      pasta,
      pedido
    });
  } catch (err) {
    res.status(500).json({ erro: err.message });
  }
});

/* ============================================================
    Listar pedidos do dia
============================================================ */

app.get("/pedidos", checkJWT, async (req, res) => {
  try {
    const pasta = pastaDoDia();
    const snapshot = await get(ref(db, pasta));
    res.json(snapshot.exists() ? snapshot.val() : {});
  } catch (err) {
    res.status(500).json({ erro: err.message });
  }
});

/* ============================================================
    Pedidos por data
============================================================ */

app.get("/pedidos/:data", checkJWT, async (req, res) => {
  try {
    const pasta = `PEDIDOS_MANUAIS_${req.params.data}`;
    const snapshot = await get(ref(db, pasta));
    res.json(snapshot.exists() ? snapshot.val() : {});
  } catch (err) {
    res.status(500).json({ erro: err.message });
  }
});

/* ============================================================
    MÉTRICAS (PROTEGIDO)
============================================================ */

app.get("/metricas", checkJWT, async (req, res) => {
  const hoje = new Date();
  const dd = String(hoje.getDate()).padStart(2, "0");
  const mm = String(hoje.getMonth() + 1).padStart(2, "0");
  const yyyy = hoje.getFullYear();
  const pasta = `METRICAS_${dd}${mm}${yyyy}`;

  try {
    const snapshot = await get(ref(db, pasta));
    res.json(snapshot.exists() ? snapshot.val() : {});
  } catch (err) {
    res.status(500).json({ erro: err.message });
  }
});

/* ============================================================
    Porta do servidor
============================================================ */

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`API Pedidos v0.5 rodando na porta ${PORT}`);
});

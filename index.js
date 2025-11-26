// index.js — API Pedidos v0.4 (com JWT)
import express from "express";
import cors from "cors";
import dotenv from "dotenv";
dotenv.config();

import jwt from "jsonwebtoken";

import db from "./firebase.js";
import { ref, push, get } from "firebase/database";

const app = express();
app.use(cors());
app.use(express.json());

/* ============================================================
    JWT – Autenticação
============================================================ */

// Middleware de proteção
function checkJWT(req, res, next) {
  const header = req.headers.authorization;

  if (!header) {
    return res.status(401).json({ erro: "Token não enviado" });
  }

  const token = header.replace("Bearer ", "");

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded; // dados do usuário liberado
    next();
  } catch (err) {
    return res.status(401).json({ erro: "Token inválido ou expirado" });
  }
}

// Rota de login (gera token JWT)
app.post("/login", (req, res) => {
  const { usuario, senha } = req.body;

  // Por enquanto simples — futuramente podemos ligar ao Firebase Auth
  if (usuario !== process.env.API_USER || senha !== process.env.API_PASS) {
    return res.status(401).json({ erro: "Usuário ou senha incorretos" });
  }

  const token = jwt.sign(
    { usuario },                 // payload
    process.env.JWT_SECRET,      // chave secreta
    { expiresIn: "10h" }         // tempo de expiração
  );

  res.json({ ok: true, token });
});

/* ============================================================
    Funções Gerais
============================================================ */

function pastaDoDia() {
  const hoje = new Date();
  const dd = String(hoje.getDate()).padStart(2, "0");
  const mm = String(hoje.getMonth() + 1).padStart(2, "0");
  const yyyy = hoje.getFullYear();
  return `PEDIDOS_MANUAIS_${dd}${mm}${yyyy}`;
}

/* ============================================================
    Health-Check
============================================================ */

app.get("/", (req, res) => {
  res.send({
    ok: true,
    message: "API Pedidos v0.4 rodando — JWT + Firebase",
    pastaHoje: pastaDoDia(),
    timestamp: new Date().toISOString(),
  });
});

/* ============================================================
    Criar Pedido Manual (PROTEGIDO)
============================================================ */

app.post("/pedido", checkJWT, async (req, res) => {
  try {
    const pasta = pastaDoDia();
    const body = req.body;

    // 🔹 Validações básicas
    if (!body.cliente || typeof body.cliente !== "string") {
      return res.status(400).json({ erro: "cliente é obrigatório e deve ser uma string." });
    }

    if (!body.endereco || typeof body.endereco !== "object") {
      return res.status(400).json({ erro: "endereco é obrigatório e deve ser um objeto." });
    }

    // Endereço deve ter subcampos
    const endereco = {
      bairro: body.endereco.bairro || "",
      numero: body.endereco.numero || "",
      referencia: body.endereco.referencia || "",
      rua: body.endereco.rua || ""
    };
      
    // Motoboy padrão se não informado
    const motoboy = body.motoboy || { id: "", nome: "" };

    // Itens do pedido (novo campo) — espera um objeto JSON
    const itens = body.itens || {};

    // Criar pedido no formato exato
    const pedido = {
      cliente: body.cliente,
      endereco,
      estimatedDeliveryMinutes: body.estimatedDeliveryMinutes || 30,
      id: body.id || 250,
      tipoPedido: body.tipoPedido || "Entrega",
      motoboy,
      pagamento: body.pagamento || "Outros",
      status: body.status || "pendente",
      taxa: body.taxa || 0,
      telefone: body.telefone || "-",
      valor_total: body.valor_total || 0,
      itens // 🔹 Novo campo adicionado
    };

    // Salvar no Firebase
    const novoRef = await push(ref(db, pasta), pedido);

    // Resposta seguindo o mesmo formato
    res.status(201).json({
      ok: true,
      firebase_id: novoRef.key,
      pasta,
      pedido
    });
  } catch (err) {
    console.error("POST /pedido error:", err);
    res.status(500).json({ erro: err.message });
  }
});


/* ============================================================
    Listar Pedidos do Dia (PROTEGIDO)
============================================================ */

app.get("/pedidos", checkJWT, async (req, res) => {
  try {
    const pasta = pastaDoDia();
    const snapshot = await get(ref(db, pasta));
    res.json(snapshot.exists() ? snapshot.val() : {});
  } catch (err) {
    console.error("GET /pedidos error:", err);
    res.status(500).json({ erro: err.message });
  }
});

/* ============================================================
    Listar Pedidos por Data (PROTEGIDO)
============================================================ */

app.get("/pedidos/:data", checkJWT, async (req, res) => {
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

/* ============================================================
    Porta Render
============================================================ */

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`API Pedidos v0.4 rodando na porta ${PORT}`);
});

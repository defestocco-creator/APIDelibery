 // index.js — API Pedidos v0.8 (JWT + Firebase + MongoDB Métricas + Auth Híbrida)
import express from "express";
import cors from "cors";
import dotenv from "dotenv";
dotenv.config();

import jwt from "jsonwebtoken";
import db from "./firebase.js";
import { ref, push, get } from "firebase/database";

// Firebase Admin (usado para autenticar usuários externos)
import admin from "firebase-admin";
import serviceAccount from "./firebaseAuth.json" assert { type: "json" };

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

// MongoDB
import { MongoClient } from "mongodb";

// =========================================================
//   MongoDB – Conexão
// =========================================================
const mongoClient = new MongoClient(process.env.MONGO_URL);
let metricsCollection = null;

async function connectMongo() {
  try {
    await mongoClient.connect();
    const dbMongo = mongoClient.db("metricas_api");
    metricsCollection = dbMongo.collection("metricas");
    console.log("MongoDB conectado — coleção de métricas pronta");
  } catch (err) {
    console.error("Erro ao conectar ao MongoDB:", err);
  }
}
connectMongo();

// =========================================================
//   Middleware de Métricas (LOG de Requisições)
// =========================================================
async function metricas(req, res, next) {
  const inicio = Date.now();
  const clientId = req.headers["x-client"] || "desconhecido";

  res.on("finish", async () => {
    try {
      if (!metricsCollection) return;

      await metricsCollection.insertOne({
        clientId,
        method: req.method,
        endpoint: req.originalUrl,
        status: res.statusCode,
        timeMs: Date.now() - inicio,
        ip: req.headers["x-forwarded-for"] || req.ip,
        timestamp: new Date()
      });
    } catch (err) {
      console.error("Erro ao salvar métrica:", err);
    }
  });

  next();
}

const app = express();
app.use(cors());
app.use(express.json());
app.use(metricas); // captura tudo automaticamente

/* ============================================================
    JWT – Autenticação API
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

/* ============================================================
    LOGIN 1 — Login interno da API (painel administrativo)
============================================================ */

app.post("/login", (req, res) => {
  const { usuario, senha } = req.body;

  if (usuario !== process.env.API_USER || senha !== process.env.API_PASS) {
    return res.status(401).json({ erro: "Usuário ou senha incorretos" });
  }

  const token = jwt.sign(
    { usuario, type: "internal" },
    process.env.JWT_SECRET,
    { expiresIn: "10h" }
  );

  res.json({ ok: true, token });
});

/* ============================================================
    LOGIN 2 — Login de Clientes via Firebase Auth
============================================================ */

app.post("/loginCliente", async (req, res) => {
  const { idToken } = req.body;

  try {
    const decoded = await admin.auth().verifyIdToken(idToken);

    const token = jwt.sign(
      { uid: decoded.uid, email: decoded.email, type: "client" },
      process.env.JWT_SECRET,
      { expiresIn: "10h" }
    );

    res.json({
      ok: true,
      token,
      clientId: decoded.uid
    });

  } catch (err) {
    res.status(401).json({ erro: "Token inválido do Firebase", detalhe: err.message });
  }
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
  res.json({
    ok: true,
    api: "API Pedidos v0.8 — JWT + Firebase Auth + Firebase DB + Métricas MongoDB",
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

    if (!body.cliente || typeof body.cliente !== "string") {
      return res.status(400).json({ erro: "cliente é obrigatório e deve ser uma string." });
    }

    if (!body.endereco || typeof body.endereco !== "object") {
      return res.status(400).json({ erro: "endereco é obrigatório e deve ser um objeto." });
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
      id: body.id || 1000,
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
    res.status(500).json({ erro: err.message });
  }
});

/* ============================================================
    Métricas – filtradas automaticamente por cliente
============================================================ */

app.get("/metricas", checkJWT, async (req, res) => {
  try {
    let filtro = {};

    // se o usuário for cliente (login via Firebase)
    if (req.user.type === "client") {
      filtro.clientId = req.headers["x-client"]; // uid do cliente
    }

    const docs = await metricsCollection
      .find(filtro)
      .sort({ timestamp: -1 })
      .limit(200)
      .toArray();

    res.json(docs);

  } catch (err) {
    res.status(500).json({ erro: err.message });
  }
});

/* ============================================================
    Porta Render
============================================================ */

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`API v0.8 rodando na porta ${PORT}`));

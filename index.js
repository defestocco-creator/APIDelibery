// index.js — API Pedidos v2.0 (Firebase Auth + JWT + MongoDB Métricas)
import express from "express";
import cors from "cors";
import dotenv from "dotenv";
dotenv.config();

import jwt from "jsonwebtoken";

// Firebase
import { initializeApp } from "firebase/app";
import { getDatabase, ref, push, get } from "firebase/database";
import { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword } from "firebase/auth";

// MongoDB
import { MongoClient } from "mongodb";

// =========================================================
//   Firebase Config
// =========================================================
const firebaseConfig = {
  apiKey: process.env.FIREBASE_APIKEY,
  authDomain: process.env.FIREBASE_AUTHDOMAIN,
  databaseURL: process.env.FIREBASE_DATABASE,
  projectId: process.env.FIREBASE_PROJECTID,
  storageBucket: process.env.FIREBASE_STORAGE,
  messagingSenderId: process.env.FIREBASE_MESSAGING,
  appId: process.env.FIREBASE_APPID,
};

const firebaseApp = initializeApp(firebaseConfig);
const db = getDatabase(firebaseApp);
const auth = getAuth(firebaseApp);

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
app.use(metricas);

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
    
    // Adiciona header x-client automaticamente
    if (decoded.uid && !req.headers["x-client"]) {
      req.headers["x-client"] = decoded.uid;
    }
    
    next();
  } catch (err) {
    return res.status(401).json({ erro: "Token inválido ou expirado" });
  }
}

/* ============================================================
    LOGIN - Autenticação com Firebase Auth
============================================================ */

app.post("/login", async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ erro: "Email e senha são obrigatórios" });
  }

  try {
    const userCredential = await signInWithEmailAndPassword(auth, email, password);
    const user = userCredential.user;

    // Gera o JWT token
    const token = jwt.sign(
      { 
        uid: user.uid, 
        email: user.email, 
        type: "client" 
      },
      process.env.JWT_SECRET,
      { expiresIn: "10h" }
    );

    res.json({
      ok: true,
      token,
      clientId: user.uid,
      email: user.email
    });

  } catch (err) {
    console.error("Login error:", err);
    
    let erroMessage = "Erro ao fazer login";
    if (err.code === 'auth/invalid-email') {
      erroMessage = "Email inválido";
    } else if (err.code === 'auth/user-not-found') {
      erroMessage = "Usuário não encontrado";
    } else if (err.code === 'auth/wrong-password') {
      erroMessage = "Senha incorreta";
    } else if (err.code === 'auth/too-many-requests') {
      erroMessage = "Muitas tentativas. Tente novamente mais tarde";
    }

    res.status(401).json({ erro: erroMessage, code: err.code });
  }
});

/* ============================================================
    CADASTRO - Criar usuário com Firebase Auth
============================================================ */

app.post("/cadastro", async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ erro: "Email e senha são obrigatórios" });
  }

  try {
    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
    const user = userCredential.user;

    // Gera o JWT token
    const token = jwt.sign(
      { 
        uid: user.uid, 
        email: user.email, 
        type: "client" 
      },
      process.env.JWT_SECRET,
      { expiresIn: "10h" }
    );

    res.status(201).json({
      ok: true,
      token,
      clientId: user.uid,
      email: user.email,
      message: "Usuário criado com sucesso"
    });

  } catch (err) {
    console.error("Cadastro error:", err);
    
    let erroMessage = "Erro ao criar usuário";
    if (err.code === 'auth/email-already-in-use') {
      erroMessage = "Email já está em uso";
    } else if (err.code === 'auth/invalid-email') {
      erroMessage = "Email inválido";
    } else if (err.code === 'auth/weak-password') {
      erroMessage = "Senha muito fraca (mínimo 6 caracteres)";
    }

    res.status(400).json({ erro: erroMessage, code: err.code });
  }
});

/* ============================================================
    LOGIN ANTIGO (Compatibilidade) - REMOVA DEPOIS
============================================================ */

app.post("/login-antigo", (req, res) => {
  const { usuario, senha } = req.body;

  // Credenciais temporárias para teste
  const usuariosValidos = {
    "admin": "senha123",
    "usuario": "123456"
  };

  if (!usuariosValidos[usuario] || usuariosValidos[usuario] !== senha) {
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
    api: "API Pedidos v2.0 — Firebase Auth + JWT + MongoDB Métricas",
    pastaHoje: pastaDoDia(),
    timestamp: new Date().toISOString(),
    rotas: {
      login: "POST /login (Firebase)",
      cadastro: "POST /cadastro (Firebase)", 
      login_antigo: "POST /login-antigo",
      pedido: "POST /pedido",
      pedidos: "GET /pedidos",
      metricas: "GET /metricas"
    }
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
      id: body.id || Date.now(),
      tipoPedido: body.tipoPedido || "Entrega",
      motoboy: body.motoboy || { id: "", nome: "" },
      pagamento: body.pagamento || "Outros",
      status: body.status || "pendente",
      taxa: body.taxa || 0,
      telefone: body.telefone || "-",
      valor_total: body.valor_total || 0,
      itens: body.itens || {},
      criadoPor: req.user.uid || req.user.usuario,
      criadoEm: new Date().toISOString()
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
    
    if (snapshot.exists()) {
      res.json(snapshot.val());
    } else {
      res.json({});
    }
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

    if (req.user.type === "client" && req.user.uid) {
      filtro.clientId = req.user.uid;
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
app.listen(PORT, () => console.log(`🚀 API v2.0 Firebase Auth rodando na porta ${PORT}`));

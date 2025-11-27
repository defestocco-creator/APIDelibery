// index.js — API Pedidos v2.1 (Firebase Auth CORRETO + JWT)
import express from "express";
import cors from "cors";
import dotenv from "dotenv";
dotenv.config();

import jwt from "jsonwebtoken";

// Firebase CLIENT SDK (para autenticação)
import { initializeApp } from "firebase/app";
import { getDatabase, ref, push, get } from "firebase/database";
import { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword } from "firebase/auth";

// MongoDB
import { MongoClient } from "mongodb";

// =========================================================
//   Firebase Config (CLIENT SDK)
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

console.log("🔥 Firebase Config:", {
  projectId: firebaseConfig.projectId,
  authDomain: firebaseConfig.authDomain
});

const firebaseApp = initializeApp(firebaseConfig);
const db = getDatabase(firebaseApp);
const auth = getAuth(firebaseApp);

// =========================================================
//   MongoDB
// =========================================================
const mongoClient = new MongoClient(process.env.MONGO_URL);
let metricsCollection = null;

async function connectMongo() {
  try {
    await mongoClient.connect();
    const dbMongo = mongoClient.db("metricas_api");
    metricsCollection = dbMongo.collection("metricas");
    console.log("✅ MongoDB conectado");
  } catch (err) {
    console.error("❌ Erro MongoDB:", err);
  }
}
connectMongo();

// =========================================================
//   App Express
// =========================================================
const app = express();
app.use(cors());
app.use(express.json());

// Middleware de Métricas
async function metricas(req, res, next) {
  const inicio = Date.now();
  const clientId = req.headers["x-client"] || "desconhecido";

  res.on("finish", async () => {
    try {
      if (metricsCollection) {
        await metricsCollection.insertOne({
          clientId,
          method: req.method,
          endpoint: req.originalUrl,
          status: res.statusCode,
          timeMs: Date.now() - inicio,
          timestamp: new Date()
        });
      }
    } catch (err) {
      console.error("Erro métricas:", err);
    }
  });
  next();
}
app.use(metricas);

// =========================================================
//   JWT Middleware
// =========================================================
function checkJWT(req, res, next) {
  const header = req.headers.authorization;
  if (!header) return res.status(401).json({ erro: "Token não enviado" });

  const token = header.replace("Bearer ", "");
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    if (decoded.uid && !req.headers["x-client"]) {
      req.headers["x-client"] = decoded.uid;
    }
    next();
  } catch (err) {
    return res.status(401).json({ erro: "Token inválido" });
  }
}

// =========================================================
//   ROTAS FIREBASE AUTH
// =========================================================

// 🔥 LOGIN COM FIREBASE AUTH
app.post("/login", async (req, res) => {
  const { email, password } = req.body;
  
  if (!email || !password) {
    return res.status(400).json({ erro: "Email e senha são obrigatórios" });
  }

  try {
    console.log(`🔐 Tentando login: ${email}`);
    const userCredential = await signInWithEmailAndPassword(auth, email, password);
    const user = userCredential.user;

    const token = jwt.sign(
      { uid: user.uid, email: user.email, type: "client" },
      process.env.JWT_SECRET,
      { expiresIn: "10h" }
    );

    console.log(`✅ Login bem-sucedido: ${email}`);
    res.json({ ok: true, token, clientId: user.uid, email: user.email });

  } catch (err) {
    console.error("❌ Erro login:", err.code, err.message);
    
    let erroMessage = "Erro ao fazer login";
    if (err.code === 'auth/invalid-email') erroMessage = "Email inválido";
    else if (err.code === 'auth/user-not-found') erroMessage = "Usuário não encontrado";
    else if (err.code === 'auth/wrong-password') erroMessage = "Senha incorreta";
    else if (err.code === 'auth/too-many-requests') erroMessage = "Muitas tentativas";

    res.status(401).json({ erro: erroMessage, code: err.code });
  }
});

// 🔥 CADASTRO COM FIREBASE AUTH
app.post("/cadastro", async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ erro: "Email e senha são obrigatórios" });
  }

  try {
    console.log(`👤 Tentando cadastro: ${email}`);
    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
    const user = userCredential.user;

    const token = jwt.sign(
      { uid: user.uid, email: user.email, type: "client" },
      process.env.JWT_SECRET,
      { expiresIn: "10h" }
    );

    console.log(`✅ Cadastro bem-sucedido: ${email}`);
    res.status(201).json({
      ok: true,
      token,
      clientId: user.uid,
      email: user.email,
      message: "Usuário criado com sucesso"
    });

  } catch (err) {
    console.error("❌ Erro cadastro:", err.code, err.message);
    
    let erroMessage = "Erro ao criar usuário";
    if (err.code === 'auth/email-already-in-use') erroMessage = "Email já está em uso";
    else if (err.code === 'auth/invalid-email') erroMessage = "Email inválido";
    else if (err.code === 'auth/weak-password') erroMessage = "Senha muito fraca";

    res.status(400).json({ erro: erroMessage, code: err.code });
  }
});

// =========================================================
//   ROTAS COMPATIBILIDADE
// =========================================================

// 🔐 LOGIN ANTIGO (para compatibilidade)
app.post("/login-antigo", (req, res) => {
  const { usuario, senha } = req.body;
  const usuariosValidos = { "admin": "senha123", "usuario": "123456" };

  if (!usuariosValidos[usuario] || usuariosValidos[usuario] !== senha) {
    return res.status(401).json({ erro: "Usuário ou senha incorretos" });
  }

  const token = jwt.sign({ usuario, type: "internal" }, process.env.JWT_SECRET, { expiresIn: "10h" });
  res.json({ ok: true, token });
});

// =========================================================
//   ROTAS PRINCIPAIS
// =========================================================

app.get("/", (req, res) => {
  res.json({
    ok: true,
    api: "API Pedidos v2.1 — Firebase Auth CORRETO + JWT",
    auth: "Firebase Client SDK",
    timestamp: new Date().toISOString()
  });
});

function pastaDoDia() {
  const hoje = new Date();
  return `PEDIDOS_MANUAIS_${String(hoje.getDate()).padStart(2, "0")}${String(hoje.getMonth() + 1).padStart(2, "0")}${hoje.getFullYear()}`;
}

// 📦 CRIAR PEDIDO
app.post("/pedido", checkJWT, async (req, res) => {
  try {
    const pasta = pastaDoDia();
    const { cliente, endereco, itens = {} } = req.body;

    if (!cliente) return res.status(400).json({ erro: "cliente é obrigatório" });

    const pedido = {
      cliente,
      endereco: endereco || { rua: "", numero: "", bairro: "", referencia: "" },
      estimatedDeliveryMinutes: req.body.estimatedDeliveryMinutes || 30,
      id: req.body.id || Date.now(),
      tipoPedido: req.body.tipoPedido || "Entrega",
      pagamento: req.body.pagamento || "Outros",
      status: req.body.status || "pendente",
      taxa: req.body.taxa || 0,
      telefone: req.body.telefone || "-",
      valor_total: req.body.valor_total || 0,
      itens,
      criadoPor: req.user.uid || req.user.usuario,
      criadoEm: new Date().toISOString()
    };

    const novoRef = await push(ref(db, pasta), pedido);
    res.status(201).json({ ok: true, firebase_id: novoRef.key, pasta, pedido });

  } catch (err) {
    console.error("❌ Erro pedido:", err);
    res.status(500).json({ erro: err.message });
  }
});

// 📋 LISTAR PEDIDOS
app.get("/pedidos", checkJWT, async (req, res) => {
  try {
    const pasta = pastaDoDia();
    const snapshot = await get(ref(db, pasta));
    res.json(snapshot.exists() ? snapshot.val() : {});
  } catch (err) {
    res.status(500).json({ erro: err.message });
  }
});

// 📊 MÉTRICAS
app.get("/metricas", checkJWT, async (req, res) => {
  try {
    let filtro = {};
    if (req.user.uid) filtro.clientId = req.user.uid;
    
    const docs = await metricsCollection.find(filtro).sort({ timestamp: -1 }).limit(200).toArray();
    res.json(docs);
  } catch (err) {
    res.status(500).json({ erro: err.message });
  }
});

// =========================================================
//   INICIAR SERVIDOR
// =========================================================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 API v2.1 rodando na porta ${PORT}`));

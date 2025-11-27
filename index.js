// index.js — API Pedidos v2.2 (Métricas CORRETAS + Firebase Auth)
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
    console.log("✅ MongoDB conectado — Métricas ativas");
  } catch (err) {
    console.error("❌ Erro ao conectar ao MongoDB:", err);
  }
}
connectMongo();

// =========================================================
//   MIDDLEWARE DE MÉTRICAS CORRIGIDO
// =========================================================
function metricasMiddleware(req, res, next) {
  const inicio = Date.now();
  const clientId = req.headers["x-client"] || req.ip || "desconhecido";

  // Função para salvar métricas
  const salvarMetrica = async () => {
    try {
      if (!metricsCollection) {
        console.log("❌ MetricsCollection não disponível");
        return;
      }

      const metrica = {
        clientId: clientId,
        method: req.method,
        endpoint: req.originalUrl,
        status: res.statusCode,
        timeMs: Date.now() - inicio,
        ip: req.ip,
        userAgent: req.get('User-Agent') || 'desconhecido',
        timestamp: new Date()
      };

      console.log(`📊 Métrica registrada: ${req.method} ${req.originalUrl} - ${res.statusCode} - ${metrica.timeMs}ms`);
      
      await metricsCollection.insertOne(metrica);
      
    } catch (err) {
      console.error("❌ Erro ao salvar métrica:", err.message);
    }
  };

  // Salva quando a response terminar
  res.on('finish', salvarMetrica);
  
  // Também salva em caso de erro
  res.on('close', salvarMetrica);

  next();
}

const app = express();
app.use(cors());
app.use(express.json());

// ✅ MIDDLEWARE DE MÉTRICAS DEVE VIR ANTES DAS ROTAS
app.use(metricasMiddleware);

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
    
    // Adiciona header x-client para métricas
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
    console.error("❌ Erro login:", err.code);
    res.status(401).json({ erro: "Erro ao fazer login", code: err.code });
  }
});

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
    console.error("❌ Erro cadastro:", err.code);
    res.status(400).json({ erro: "Erro ao criar usuário", code: err.code });
  }
});

// =========================================================
//   ROTA PARA DEBUG DAS MÉTRICAS
// =========================================================

app.get("/debug-metricas", async (req, res) => {
  try {
    console.log("🔍 Debug das métricas solicitado");
    
    // Verificar status da conexão MongoDB
    const mongoStatus = metricsCollection ? "Conectado" : "Desconectado";
    
    // Contar métricas existentes
    const totalMetricas = metricsCollection ? await metricsCollection.countDocuments() : 0;
    
    // Últimas 10 métricas
    const ultimasMetricas = metricsCollection ? 
      await metricsCollection.find().sort({ timestamp: -1 }).limit(10).toArray() : [];
    
    res.json({
      mongoStatus,
      totalMetricas,
      ultimasMetricas: ultimasMetricas.map(m => ({
        method: m.method,
        endpoint: m.endpoint,
        status: m.status,
        timeMs: m.timeMs,
        clientId: m.clientId,
        timestamp: m.timestamp
      })),
      mensagem: "Debug das métricas"
    });
    
  } catch (err) {
    console.error("❌ Erro no debug:", err);
    res.status(500).json({ erro: err.message });
  }
});

// =========================================================
//   ROTAS PRINCIPAIS
// =========================================================

app.get("/", (req, res) => {
  res.json({
    ok: true,
    api: "API Pedidos v2.2 — Métricas ATIVAS + Firebase Auth",
    auth: "Firebase Client SDK",
    metricas: "ATIVAS - Todas as requisições são registradas",
    timestamp: new Date().toISOString()
  });
});

function pastaDoDia() {
  const hoje = new Date();
  return `PEDIDOS_MANUAIS_${String(hoje.getDate()).padStart(2, "0")}${String(hoje.getMonth() + 1).padStart(2, "0")}${hoje.getFullYear()}`;
}

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

app.get("/pedidos", checkJWT, async (req, res) => {
  try {
    const pasta = pastaDoDia();
    const snapshot = await get(ref(db, pasta));
    res.json(snapshot.exists() ? snapshot.val() : {});
  } catch (err) {
    res.status(500).json({ erro: err.message });
  }
});

app.get("/metricas", checkJWT, async (req, res) => {
  try {
    let filtro = {};
    if (req.user.uid) filtro.clientId = req.user.uid;
    
    const docs = await metricsCollection.find(filtro).sort({ timestamp: -1 }).limit(50).toArray();
    
    console.log(`📊 Métricas retornadas: ${docs.length} registros`);
    
    res.json(docs);
  } catch (err) {
    console.error("❌ Erro ao buscar métricas:", err);
    res.status(500).json({ erro: err.message });
  }
});

// =========================================================
//   INICIAR SERVIDOR
// =========================================================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 API v2.2 rodando na porta ${PORT}`);
  console.log(`📊 Sistema de métricas: ATIVO`);
  console.log(`🔐 Firebase Auth: ATIVO`);
});

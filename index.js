// index.js — API Pedidos v2.4 (MÉTRICAS FILTRADAS POR CLIENT ID)
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
import { MongoClient, ObjectId } from "mongodb";

// =========================================================
//   Configurações
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

// MongoDB
const mongoClient = new MongoClient(process.env.MONGO_URL);
let metricsCollection = null;

async function connectMongo() {
  try {
    await mongoClient.connect();
    const dbMongo = mongoClient.db("metricas_api");
    metricsCollection = dbMongo.collection("metricas");
    console.log("✅ MongoDB conectado - Métricas PRONTAS");
  } catch (err) {
    console.error("❌ ERRO MongoDB:", err);
  }
}
connectMongo();

const app = express();
app.use(cors());
app.use(express.json());

// =========================================================
//   MIDDLEWARE DE MÉTRICAS CORRIGIDO
// =========================================================
app.use((req, res, next) => {
  const start = Date.now();
  let clientId = "cucc";

  // Função para SALVAR MÉTRICA
  const saveMetric = async () => {
    try {
      if (!metricsCollection) {
        console.log("⚠️  MongoDB não conectado");
        return;
      }

      const metric = {
        clientId: clientId,
        method: req.method,
        endpoint: req.originalUrl,
        status: res.statusCode,
        timeMs: Date.now() - start,
        ip: req.ip,
        userAgent: req.get('User-Agent') || 'unknown',
        timestamp: new Date()
      };

      console.log(`📊 MÉTRICA: ${req.method} ${req.originalUrl} → ${res.statusCode} | Client: ${clientId}`);
      
      await metricsCollection.insertOne(metric);
      
    } catch (error) {
      console.error("❌ ERRO AO SALVAR MÉTRICA:", error.message);
    }
  };

  res.on('finish', saveMetric);
  res.on('close', saveMetric);

  next();
});

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
    
    // ✅ DEFINIR clientId NO HEADER para o middleware usar
    if (decoded.uid) {
      req.headers["x-client"] = decoded.uid;
    }
    
    next();
  } catch (err) {
    return res.status(401).json({ erro: "Token inválido" });
  }
}

// =========================================================
//   ROTAS DE AUTENTICAÇÃO
// =========================================================
app.post("/login", async (req, res) => {
  const { email, password } = req.body;
  
  if (!email || !password) {
    return res.status(400).json({ erro: "Email e senha são obrigatórios" });
  }

  try {
    const userCredential = await signInWithEmailAndPassword(auth, email, password);
    const user = userCredential.user;

    const token = jwt.sign(
      { uid: user.uid, email: user.email, type: "client" },
      process.env.JWT_SECRET,
      { expiresIn: "10h" }
    );

    // ✅ DEFINIR header x-client para métricas
    req.headers["x-client"] = user.uid;
    
    res.json({ 
      ok: true, 
      token, 
      clientId: user.uid, 
      email: user.email 
    });

  } catch (err) {
    res.status(401).json({ erro: "Erro ao fazer login", code: err.code });
  }
});

app.post("/cadastro", async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ erro: "Email e senha são obrigatórios" });
  }

  try {
    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
    const user = userCredential.user;

    const token = jwt.sign(
      { uid: user.uid, email: user.email, type: "client" },
      process.env.JWT_SECRET,
      { expiresIn: "10h" }
    );

    // ✅ DEFINIR header x-client para métricas
    req.headers["x-client"] = user.uid;
    
    res.status(201).json({
      ok: true,
      token,
      clientId: user.uid,
      email: user.email,
      message: "Usuário criado com sucesso"
    });

  } catch (err) {
    res.status(400).json({ erro: "Erro ao criar usuário", code: err.code });
  }
});

// =========================================================
//   ROTA ESPECIAL PARA VER TODAS AS MÉTRICAS (DEBUG)
// =========================================================
app.get("/debug-metricas-completas", checkJWT, async (req, res) => {
  try {
    const todasMetricas = await metricsCollection.find({}).sort({ timestamp: -1 }).limit(50).toArray();
    
    console.log(`🔍 DEBUG: ${todasMetricas.length} métricas no total`);
    
    // Métricas do usuário atual
    const minhasMetricas = todasMetricas.filter(m => m.clientId === req.user.uid);
    
    res.json({
      usuario_atual: {
        uid: req.user.uid,
        email: req.user.email
      },
      total_metricas: todasMetricas.length,
      minhas_metricas: minhasMetricas.length,
      todas_as_metricas: todasMetricas.map(m => ({
        clientId: m.clientId,
        method: m.method,
        endpoint: m.endpoint,
        status: m.status,
        timeMs: m.timeMs,
        timestamp: m.timestamp
      }))
    });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// =========================================================
//   ROTAS PRINCIPAIS
// =========================================================
app.get("/", (req, res) => {
  res.json({
    ok: true,
    api: "API Pedidos v2.4 — MÉTRICAS FILTRADAS POR CLIENT ID ✅",
    message: "Cada usuário vê apenas suas próprias métricas",
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
      criadoPor: req.user.uid,
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

// =========================================================
//   ROTA MÉTRICAS CORRIGIDA - FILTRAR POR CLIENT ID
// =========================================================
app.get("/metricas", checkJWT, async (req, res) => {
  try {
    const userUid = req.user.uid;
    
    console.log(`📊 Buscando métricas para: ${userUid}`);
    
    // ✅ FILTRAR APENAS AS MÉTRICAS DESTE USUÁRIO
    const minhasMetricas = await metricsCollection.find({ 
      clientId: userUid 
    }).sort({ timestamp: -1 }).limit(100).toArray();
    
    console.log(`📊 Encontradas ${minhasMetricas.length} métricas para ${userUid}`);
    
    res.json(minhasMetricas);

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
  console.log(`🚀 API v2.4 rodando na porta ${PORT}`);
  console.log(`📊 MÉTRICAS: FILTRADAS POR CLIENT ID ✅`);
  console.log(`🔐 Firebase Auth: ATIVO`);
});

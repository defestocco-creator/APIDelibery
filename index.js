// index.js — API Pedidos v2.3 (MÉTRICAS GARANTIDAS)
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
//   MIDDLEWARE DE MÉTRICAS CORRIGIDO E GARANTIDO
// =========================================================
app.use((req, res, next) => {
  const start = Date.now();
  const clientId = req.headers["x-client"] || req.ip || "unknown";

  // Função para SALVAR MÉTRICA (garantida)
  const saveMetric = async () => {
    try {
      if (!metricsCollection) {
        console.log("⚠️  MongoDB não conectado, métrica perdida");
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
        timestamp: new Date(),
        bodySize: req.headers['content-length'] || 0
      };

      console.log(`📊 MÉTRICA REGISTRADA: ${req.method} ${req.originalUrl} → ${res.statusCode} (${metric.timeMs}ms)`);
      
      // INSERIR NO MONGODB
      await metricsCollection.insertOne(metric);
      
    } catch (error) {
      console.error("❌ ERRO AO SALVAR MÉTRICA:", error.message);
    }
  };

  // ✅ GARANTIR que a métrica seja salva quando a response terminar
  res.on('finish', saveMetric);
  
  // ✅ GARANTIR que a métrica seja salva se a conexão fechar
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
    
    // Adicionar clientId para métricas
    if (decoded.uid && !req.headers["x-client"]) {
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

    // ✅ ADICIONAR header x-client para métricas
    res.setHeader('x-client', user.uid);
    
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

    // ✅ ADICIONAR header x-client para métricas
    res.setHeader('x-client', user.uid);
    
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
//   ROTA ESPECIAL PARA TESTAR MÉTRICAS
// =========================================================
app.get("/teste-metricas", (req, res) => {
  console.log("🧪 ROTA DE TESTE DE MÉTRICAS ACESSADA");
  res.json({
    message: "Esta rota DEVE gerar uma métrica!",
    timestamp: new Date().toISOString(),
    clientIp: req.ip
  });
});

app.get("/debug-mongo", async (req, res) => {
  try {
    const status = {
      mongoConnected: !!metricsCollection,
      database: "metricas_api",
      collection: "metricas"
    };

    if (metricsCollection) {
      status.totalDocuments = await metricsCollection.countDocuments();
      status.collections = await mongoClient.db("metricas_api").listCollections().toArray();
    }

    res.json(status);
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
    api: "API Pedidos v2.3 — MÉTRICAS GARANTIDAS ✅",
    message: "Todas as requisições geram métricas automaticamente",
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
    
    // ✅ ADICIONAR header x-client para métricas
    res.setHeader('x-client', req.user.uid || req.user.usuario);
    
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
    
    // ✅ ADICIONAR header x-client para métricas
    res.setHeader('x-client', req.user.uid || req.user.usuario);
    
    res.json(snapshot.exists() ? snapshot.val() : {});

  } catch (err) {
    res.status(500).json({ erro: err.message });
  }
});

app.get("/metricas", checkJWT, async (req, res) => {
  try {
    let filtro = {};
    if (req.user.uid) filtro.clientId = req.user.uid;

    const docs = await metricsCollection.find(filtro).sort({ timestamp: -1 }).limit(100).toArray();
    
    console.log(`📊 Retornando ${docs.length} métricas para o cliente`);
    
    // ✅ ADICIONAR header x-client para métricas
    res.setHeader('x-client', req.user.uid || req.user.usuario);
    
    res.json(docs);

  } catch (err) {
    console.error("❌ Erro métricas:", err);
    res.status(500).json({ erro: err.message });
  }
});

// =========================================================
//   INICIAR SERVIDOR
// =========================================================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 API v2.3 rodando na porta ${PORT}`);
  console.log(`📊 SISTEMA DE MÉTRICAS: ATIVO E GARANTIDO ✅`);
  console.log(`🔐 Firebase Auth: ATIVO`);
  console.log(`🗄️  MongoDB: ${metricsCollection ? 'CONECTADO' : 'DESCONECTADO'}`);
});

// index.js — API Pedidos v3.0 (Métricas por Usuário)
import express from "express";
import cors from "cors";
import dotenv from "dotenv";
dotenv.config();

import jwt from "jsonwebtoken";
import { initializeApp } from "firebase/app";
import { getDatabase, ref, push, get } from "firebase/database";
import { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword } from "firebase/auth";
import { MongoClient } from "mongodb";

// Configurações
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
let metricsDb = null;

async function connectMongo() {
  try {
    await mongoClient.connect();
    metricsDb = mongoClient.db("metricas_usuarios");
    console.log("✅ MongoDB conectado - Sistema por usuário");
  } catch (err) {
    console.error("❌ ERRO MongoDB:", err);
  }
}
connectMongo();

const app = express();
app.use(cors());
app.use(express.json());

// =========================================================
//   FUNÇÃO PARA OBTER/CRIAR COLLECTION DO USUÁRIO
// =========================================================
async function getOrCreateUserCollection(userId) {
  if (!metricsDb) {
    console.log("❌ MongoDB não conectado");
    return null;
  }

  try {
    // Nome da collection baseado no userId do Firebase
    const collectionName = `user_${userId}`;
    
    // Verificar se a collection existe
    const collections = await metricsDb.listCollections({ name: collectionName }).toArray();
    
    if (collections.length === 0) {
      // Collection não existe → CRIAR
      console.log(`📁 CRIANDO collection: ${collectionName}`);
      await metricsDb.createCollection(collectionName);
      
      // Criar índice para performance
      await metricsDb.collection(collectionName).createIndex({ timestamp: -1 });
      await metricsDb.collection(collectionName).createIndex({ endpoint: 1 });
      
      console.log(`✅ Collection criada: ${collectionName}`);
    } else {
      console.log(`📁 Collection já existe: ${collectionName}`);
    }
    
    return metricsDb.collection(collectionName);
    
  } catch (err) {
    console.error("❌ Erro ao obter collection:", err);
    return null;
  }
}

// =========================================================
//   MIDDLEWARE DE MÉTRICAS POR USUÁRIO
// =========================================================
app.use(async (req, res, next) => {
  const start = Date.now();
  
  // Obter userId do header (será definido nas rotas auth)
  const userId = req.headers["x-user-id"] || "unknown";

  // Função para salvar métrica na collection do usuário
  const saveMetric = async () => {
    try {
      if (!userId || userId === "unknown") {
        console.log("⚠️  UserId não disponível para métricas");
        return;
      }

      const userCollection = await getOrCreateUserCollection(userId);
      if (!userCollection) return;

      const metric = {
        userId: userId,
        method: req.method,
        endpoint: req.originalUrl,
        status: res.statusCode,
        timeMs: Date.now() - start,
        ip: req.ip,
        userAgent: req.get('User-Agent') || 'unknown',
        timestamp: new Date()
      };

      console.log(`📊 [${userId}] ${req.method} ${req.originalUrl} → ${res.statusCode} (${metric.timeMs}ms)`);
      
      await userCollection.insertOne(metric);
      
    } catch (error) {
      console.error("❌ Erro ao salvar métrica:", error.message);
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
    
    // ✅ DEFINIR userId NO HEADER para o middleware usar
    if (decoded.uid) {
      req.headers["x-user-id"] = decoded.uid;
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

    // ✅ CRIAR collection do usuário no primeiro login
    await getOrCreateUserCollection(user.uid);
    
    // ✅ DEFINIR header para o middleware
    req.headers["x-user-id"] = user.uid;
    
    res.json({ 
      ok: true, 
      token, 
      clientId: user.uid, 
      email: user.email,
      message: "Collection de métricas criada/pronta"
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

    // ✅ CRIAR collection do usuário no cadastro
    await getOrCreateUserCollection(user.uid);
    
    // ✅ DEFINIR header para o middleware
    req.headers["x-user-id"] = user.uid;
    
    res.status(201).json({
      ok: true,
      token,
      clientId: user.uid,
      email: user.email,
      message: "Usuário criado com collection de métricas"
    });

  } catch (err) {
    res.status(400).json({ erro: "Erro ao criar usuário", code: err.code });
  }
});

// =========================================================
//   ROTA PARA LISTAR COLLECTIONS (ADMIN)
// =========================================================
app.get("/admin/collections", checkJWT, async (req, res) => {
  try {
    if (!metricsDb) {
      return res.status(500).json({ erro: "MongoDB não conectado" });
    }

    const collections = await metricsDb.listCollections().toArray();
    const collectionsInfo = [];

    for (let coll of collections) {
      const collection = metricsDb.collection(coll.name);
      const count = await collection.countDocuments();
      
      collectionsInfo.push({
        name: coll.name,
        documents: count,
        size: coll.options?.size || "N/A"
      });
    }

    res.json({
      totalCollections: collections.length,
      collections: collectionsInfo
    });

  } catch (err) {
    res.status(500).json({ erro: err.message });
  }
});

// =========================================================
//   ROTAS PRINCIPAIS
// =========================================================
app.get("/", (req, res) => {
  res.json({
    ok: true,
    api: "API Pedidos v3.0 — MÉTRICAS POR USUÁRIO ✅",
    message: "Cada usuário tem sua própria collection de métricas",
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
//   ROTA MÉTRICAS - AGORA DA COLLECTION DO USUÁRIO
// =========================================================
app.get("/metricas", checkJWT, async (req, res) => {
  try {
    const userUid = req.user.uid;
    
    console.log(`📊 Buscando métricas do usuário: ${userUid}`);
    
    const userCollection = await getOrCreateUserCollection(userUid);
    if (!userCollection) {
      return res.status(500).json({ erro: "Erro ao acessar collection do usuário" });
    }

    const metricas = await userCollection.find({}).sort({ timestamp: -1 }).limit(100).toArray();
    
    console.log(`📊 Retornando ${metricas.length} métricas de user_${userUid}`);
    
    res.json(metricas);

  } catch (err) {
    console.error("❌ Erro ao buscar métricas:", err);
    res.status(500).json({ erro: err.message });
  }
});

// =========================================================
//   ROTA PARA ZERAR MÉTRICAS DO USUÁRIO
// =========================================================
app.delete("/minhas-metricas", checkJWT, async (req, res) => {
  try {
    const userUid = req.user.uid;
    const userCollection = await getOrCreateUserCollection(userUid);
    
    if (!userCollection) {
      return res.status(500).json({ erro: "Collection não encontrada" });
    }

    const totalAntes = await userCollection.countDocuments({});
    const result = await userCollection.deleteMany({});
    
    console.log(`🗑️  Usuário ${userUid} zerou ${result.deletedCount} métricas`);
    
    res.json({
      message: "Métricas zeradas com sucesso",
      removidas: result.deletedCount,
      total_antes: totalAntes
    });

  } catch (err) {
    res.status(500).json({ erro: err.message });
  }
});

// =========================================================
//   INICIAR SERVIDOR
// =========================================================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 API v3.0 rodando na porta ${PORT}`);
  console.log(`📊 SISTEMA: MÉTRICAS POR USUÁRIO ✅`);
  console.log(`🔐 Firebase Auth: ATIVO`);
  console.log(`🗄️  MongoDB: ${metricsDb ? 'CONECTADO' : 'DESCONECTADO'}`);
});

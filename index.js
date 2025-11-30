// index.js — API Delibery v0.5 (Firebase Simplificado)
import express from "express";
import cors from "cors";
import dotenv from "dotenv";
dotenv.config();

import jwt from "jsonwebtoken";
import { initializeApp } from "firebase/app";
import { getDatabase, ref, push, get, set } from "firebase/database";
import { getAuth, signInWithEmailAndPassword } from "firebase/auth";

// Configuração Firebase Principal (delibery-auth)
const firebaseConfig = {
  apiKey: process.env.FIREBASE_APIKEY,
  authDomain: process.env.FIREBASE_AUTHDOMAIN,
  databaseURL: "https://delibery-auth-default-rtdb.firebaseio.com",
  projectId: process.env.FIREBASE_PROJECTID,
  storageBucket: process.env.FIREBASE_STORAGE,
  messagingSenderId: process.env.FIREBASE_MESSAGING,
  appId: process.env.FIREBASE_APPID,
};

const firebaseApp = initializeApp(firebaseConfig);
const auth = getAuth(firebaseApp);
const deliberyDb = getDatabase(firebaseApp);

const app = express();
app.use(cors());
app.use(express.json());

// =========================================================
//   FUNÇÃO PARA OBTER CREDENCIAIS DO USUÁRIO
// =========================================================
async function getUserCredentials(userId) {
  try {
    const userRef = ref(deliberyDb, `usuarios/${userId}`);
    const snapshot = await get(userRef);
    
    if (!snapshot.exists()) {
      throw new Error("Usuário não encontrado na base delibery");
    }

    const userData = snapshot.val();
    
    // Extrair credenciais do Firebase do usuário
    const credentials = {
      apiKey: userData.apiKey,
      appId: userData.appId,
      authDomain: userData.authDomain,
      databaseURL: userData.databaseURL,
      measurementId: userData.measurementId,
      messagingSenderId: userData.messagingSenderId,
      projectId: userData.projectId,
      storageBucket: userData.storageBucket
    };

    // Validar credenciais mínimas
    if (!credentials.apiKey || !credentials.projectId) {
      throw new Error("Credenciais do Firebase incompletas");
    }

    return credentials;
  } catch (error) {
    console.error("❌ Erro ao buscar credenciais:", error);
    throw error;
  }
}

// =========================================================
//   FUNÇÃO PARA CONECTAR AO FIREBASE DO USUÁRIO
// =========================================================
function connectToUserFirebase(credentials) {
  try {
    const userFirebaseConfig = {
      apiKey: credentials.apiKey,
      authDomain: credentials.authDomain,
      databaseURL: credentials.databaseURL,
      projectId: credentials.projectId,
      storageBucket: credentials.storageBucket,
      messagingSenderId: credentials.messagingSenderId,
      appId: credentials.appId,
      measurementId: credentials.measurementId
    };

    // Criar uma nova instância do Firebase para o usuário
    const userApp = initializeApp(userFirebaseConfig, `user_${Date.now()}`);
    return getDatabase(userApp);
    
  } catch (error) {
    console.error("❌ Erro ao conectar ao Firebase do usuário:", error);
    throw error;
  }
}

// =========================================================
//   SALVAR MÉTRICAS NA PASTA DO USUÁRIO
// =========================================================
async function saveUserMetric(userId, metricData) {
  try {
    const metricRef = ref(deliberyDb, `usuarios/${userId}/metricas`);
    const newMetricRef = push(metricRef);
    
    const metricWithTimestamp = {
      ...metricData,
      timestamp: Date.now(),
      createdAt: new Date().toISOString()
    };

    await set(newMetricRef, metricWithTimestamp);
    return newMetricRef.key;
    
  } catch (error) {
    console.error("❌ Erro ao salvar métrica:", error);
    throw error;
  }
}

// =========================================================
//   MIDDLEWARE DE MÉTRICAS
// =========================================================
function createMetricsMiddleware() {
  return async (req, res, next) => {
    const start = process.hrtime.bigint(); // ⬅ latência precisa (ns)

    // Capturar tamanho do request
    let requestSize = 0;
    req.on("data", chunk => requestSize += chunk.length);

    // Após resposta
    res.on("finish", async () => {
      const end = process.hrtime.bigint();
      const responseTimeMs = Number(end - start) / 1_000_000; // ns → ms

      const userId = req.user?.uid;
      if (!userId) return;

      // Tamanho da resposta
      const responseBody = res.getHeader("Content-Length") || 0;

      const metric = {
        method: req.method,
        endpoint: req.originalUrl,

        // Latência
        responseTimeMs,
        serverProcessingMs: responseTimeMs, // dividido depois se quiser

        // Tamanho
        requestSizeBytes: requestSize,
        responseSizeBytes: Number(responseBody),

        // Original
        statusCode: res.statusCode,
        userAgent: req.get('User-Agent') || "unknown",
        ip: req.ip || req.headers['x-forwarded-for'] || "unknown",

        // Carimbos de tempo
        timestampMs: Date.now(),
        timestampISO: new Date().toISOString(),
        minuteBucket: new Date().toISOString().slice(0, 16), // "2025-11-29T03:47"
        hourBucket: new Date().toISOString().slice(0, 13),   // "2025-11-29T03"
        dayBucket: new Date().toISOString().slice(0, 10),    // "2025-11-29"
      };

      await saveUserMetric(userId, metric);
    });

    next();
  };
}


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
    next();
  } catch (err) {
    return res.status(401).json({ erro: "Token inválido" });
  }
}

// Aplicar middleware de métricas APÓS a autenticação
app.use(createMetricsMiddleware());

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

    // Buscar credenciais do usuário na base delibery
    const userCredentials = await getUserCredentials(user.uid);

    const token = jwt.sign(
      { 
        uid: user.uid, 
        email: user.email, 
        credentials: userCredentials 
      },
      process.env.JWT_SECRET,
      { expiresIn: "10h" }
    );

    // Salvar métrica de login
    await saveUserMetric(user.uid, {
      type: "login_success",
      endpoint: "/login",
      method: "POST"
    });

    res.json({ 
      ok: true, 
      token, 
      clientId: user.uid, 
      email: user.email,
      hasCredentials: true
    });

  } catch (err) {
    console.error("❌ Erro login:", err.code);
    
    // Tentar salvar métrica de erro se tiver userId
    if (err.customUserId) {
      await saveUserMetric(err.customUserId, {
        type: "login_error",
        endpoint: "/login",
        method: "POST",
        error: err.code
      });
    }
    
    res.status(401).json({ erro: "Erro ao fazer login", code: err.code });
  }
});

// =========================================================
//   ROTA PRINCIPAL
// =========================================================
app.get("/", (req, res) => {
  res.json({
    ok: true,
    api: "API Delibery v0.5 — FIREBASE SIMPLIFICADO ✅",
    message: "Credenciais dinâmicas + Métricas no Firebase",
    timestamp: new Date().toISOString()
  });
});

// =========================================================
//   FUNÇÃO AUXILIAR - PASTA DO DIA
// =========================================================
function pastaDoDia() {
  const hoje = new Date();
  return `PEDIDOS_MANUAIS_${String(hoje.getDate()).padStart(2, "0")}${String(hoje.getMonth() + 1).padStart(2, "0")}${hoje.getFullYear()}`;
}

// =========================================================
//   ROTA DE PEDIDOS - ENVIA PARA O FIREBASE DO USUÁRIO
// =========================================================
app.post("/pedido", checkJWT, async (req, res) => {
  try {
    const userId = req.user.uid;
    
    // 1. Buscar credenciais do usuário
    const userCredentials = await getUserCredentials(userId);
    
    // 2. Conectar ao Firebase do usuário
    const userDb = connectToUserFirebase(userCredentials);
    
    // 3. Preparar pedido
    const pasta = pastaDoDia();
    const { cliente, endereco, itens = {} } = req.body;

    if (!cliente) {
      return res.status(400).json({ erro: "cliente é obrigatório" });
    }

    const pedido = {
      cliente,
      endereco: endereco || { rua: "", numero: "", bairro: "", referencia: "" },
      estimatedDeliveryMinutes: req.body.estimatedDeliveryMinutes || 30,
      id: req.body.id || 0,
      tipoPedido: req.body.tipoPedido || "Entrega",
      pagamento: req.body.pagamento || "Outros",
      status: req.body.status || "pendente",
      taxa: req.body.taxa || 0,
      telefone: req.body.telefone || "-",
      valor_total: req.body.valor_total || 0,
      itens,
      criadoPor: userId,
      criadoEm: new Date().toISOString(),
      userProject: userCredentials.projectId
    };

    // 4. Salvar no Firebase DO USUÁRIO
    const novoRef = await push(ref(userDb, pasta), pedido);
    
    // 5. Salvar métrica de sucesso
    await saveUserMetric(userId, {
      type: "pedido_criado",
      endpoint: "/pedido",
      method: "POST",
      orderId: novoRef.key,
      projectId: userCredentials.projectId
    });

    res.status(201).json({ 
      ok: true, 
      firebase_id: novoRef.key, 
      pasta, 
      project: userCredentials.projectId,
      pedido 
    });

  } catch (err) {
    console.error("❌ Erro ao criar pedido:", err);
    
    // Salvar métrica de erro
    if (req.user?.uid) {
      await saveUserMetric(req.user.uid, {
        type: "pedido_erro",
        endpoint: "/pedido",
        method: "POST",
        error: err.message
      });
    }
    
    res.status(500).json({ erro: err.message });
  }
});

// =========================================================
//   BUSCAR PEDIDOS DO USUÁRIO
// =========================================================
app.get("/pedidos", checkJWT, async (req, res) => {
  try {
    const userId = req.user.uid;
    
    // 1. Buscar credenciais do usuário
    const userCredentials = await getUserCredentials(userId);
    
    // 2. Conectar ao Firebase do usuário
    const userDb = connectToUserFirebase(userCredentials);
    
    // 3. Buscar pedidos
    const pasta = pastaDoDia();
    const snapshot = await get(ref(userDb, pasta));
    
    const pedidos = snapshot.exists() ? snapshot.val() : {};

    // 4. Salvar métrica de consulta
    await saveUserMetric(userId, {
      type: "pedidos_consultados",
      endpoint: "/pedidos",
      method: "GET",
      count: Object.keys(pedidos).length,
      projectId: userCredentials.projectId
    });

    res.json(pedidos);

  } catch (err) {
    console.error("❌ Erro ao buscar pedidos:", err);
    
    if (req.user?.uid) {
      await saveUserMetric(req.user.uid, {
        type: "pedidos_erro",
        endpoint: "/pedidos",
        method: "GET",
        error: err.message
      });
    }
    
    res.status(500).json({ erro: err.message });
  }
});

// =========================================================
//   ROTA MÉTRICAS DO USUÁRIO
// =========================================================
app.get("/metricas", checkJWT, async (req, res) => {
  try {
    const userId = req.user.uid;
    
    // Buscar métricas diretamente da pasta do usuário
    const metricsRef = ref(deliberyDb, `usuarios/${userId}/metricas`);
    const snapshot = await get(metricsRef);
    
    const metricas = snapshot.exists() ? snapshot.val() : {};
    
    console.log(`📊 Retornando ${Object.keys(metricas).length} métricas de ${userId}`);
    
    res.json(metricas);

  } catch (err) {
    console.error("❌ Erro ao buscar métricas:", err);
    res.status(500).json({ erro: err.message });
  }
});

// =========================================================
//   ROTA DEBUG - VER CREDENCIAIS DO USUÁRIO
// =========================================================
app.get("/debug-credenciais", checkJWT, async (req, res) => {
  try {
    const userId = req.user.uid;
    const credentials = await getUserCredentials(userId);
    
    res.json({
      userId,
      hasCredentials: true,
      projectId: credentials.projectId,
      authDomain: credentials.authDomain,
      databaseURL: credentials.databaseURL
    });

  } catch (err) {
    res.status(500).json({ 
      userId: req.user.uid,
      hasCredentials: false,
      error: err.message 
    });
  }
});

// =========================================================
//   INICIAR SERVIDOR
// =========================================================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 API Delibery v0.5 rodando na porta ${PORT}`);
  console.log(`📊 SISTEMA: CREDENCIAIS DINÂMICAS + FIREBASE ✅`);
  console.log(`🔐 Firebase Auth: ATIVO`);
  console.log(`📍 Database Principal: delibery-auth`);
  console.log(`📨 Pedidos: Firebase do usuário`);
  console.log(`📈 Métricas: usuarios > user_id > metricas`);
});

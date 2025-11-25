/**
 * index.js - API Pedidos (Sessão + Firebase Realtime DB) - v0.2
 * 
 * Modificações da v0.2:
 * - Pedidos são salvos em "PEDIDOS_MANUAIS_DDMMAAAA" onde DDMMAAAA é a data atual
 * - Cria automaticamente a chave do dia se não existir
 * - Mantém compatibilidade com a estrutura existente do Firebase
 * 
 * Uso:
 * 1) Coloque suas variáveis de ambiente (ex: .env):
 *    - SESSION_SECRET
 *    - REDIS_URL (ex: redis://localhost:6379)  (opcional: se não usar, o store ainda tentará conectar)
 *    - FIREBASE_APIKEY
 *    - FIREBASE_AUTHDOMAIN
 *    - FIREBASE_DATABASE
 *    - FIREBASE_PROJECTID
 *    - FIREBASE_STORAGE
 *    - FIREBASE_MSGID
 *    - FIREBASE_APPID
 *    - FIREBASE_MEASURE
 *
 * 2) npm install
 * 3) npm start
 *
 * Rotas principais:
 * POST  /login                -> body: { usuario, senha }    (gera sessão)
 * POST  /logout               -> encerra sessão
 * POST  /pedido               -> cria pedido (auth)
 * GET   /pedido/:id           -> lê pedido (auth)
 * PUT   /pedido/:id           -> atualiza pedido (auth)
 * DELETE /pedido/:id          -> apaga pedido (auth)
 * POST  /pedido/:id/items     -> adiciona item ao pedido (auth)
 * GET   /pedidos              -> lista pedidos (auth) (suporta filtros via query)
 * GET   /pedidos/search       -> busca específica: ?field=nome&value=João (auth)
 * GET   /pedidos/hoje         -> lista apenas pedidos do dia atual (auth)
 */

import express from "express";
import session from "express-session";
import connectRedis from "connect-redis";
import IORedis from "ioredis";
import cors from "cors";
import dotenv from "dotenv";

import { initializeApp } from "firebase/app";
import {
  getDatabase,
  ref,
  push,
  set,
  get,
  child,
  update,
  remove,
  query,
  orderByChild,
  equalTo
} from "firebase/database";

dotenv.config();

const {
  REDIS_URL,
  FIREBASE_APIKEY,
  FIREBASE_AUTHDOMAIN,
  FIREBASE_DATABASE,
  FIREBASE_PROJECTID,
  FIREBASE_STORAGE,
  FIREBASE_MSGID,
  FIREBASE_APPID,
  FIREBASE_MEASURE,
  PORT = 3000
} = process.env;

// --- Inicia Firebase (config via env vars que você passou) ---
const firebaseConfig = {
  apiKey: FIREBASE_APIKEY,
  authDomain: FIREBASE_AUTHDOMAIN,
  databaseURL: FIREBASE_DATABASE,
  projectId: FIREBASE_PROJECTID,
  storageBucket: FIREBASE_STORAGE,
  messagingSenderId: FIREBASE_MSGID,
  appId: FIREBASE_APPID,
  measurementId: FIREBASE_MEASURE
};

const firebaseApp = initializeApp(firebaseConfig);
const db = getDatabase(firebaseApp);

// --- Inicia Redis e store de sessão ---
// --- Inicia Redis e store de sessão ---
let redisClient;
try {
  if (REDIS_URL) {
    redisClient = new IORedis(REDIS_URL);
  } else {
    // Tenta localhost caso REDIS_URL não esteja definido
    redisClient = new IORedis();
  }
  redisClient.on("error", (err) => {
    console.error("Redis error:", err);
  });
} catch (err) {
  console.error("Erro ao conectar no Redis:", err);
}

// --- App Express ---
const app = express();
app.use(express.json());

// CORS (ajuste conforme necessidade)
app.use(
  cors({
    origin: true,
    credentials: true
  })
);

// Sessão - CORREÇÃO PARA connect-redis v7+
const RedisStore = connectRedis(session);
app.use(
  session({
    store: new RedisStore({ 
      client: redisClient,
      prefix: "sess:"
    }),
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: false, // true em produção com HTTPS
      sameSite: "lax",
      maxAge: 1000 * 60 * 60 // 1 hora
    }
  })
);

// ------------------ Helpers ------------------

// Função para obter a chave do dia atual no formato PEDIDOS_MANUAIS_DDMMAAAA
function getChavePedidosDoDia() {
  const now = new Date();
  const dia = String(now.getDate()).padStart(2, '0');
  const mes = String(now.getMonth() + 1).padStart(2, '0');
  const ano = now.getFullYear();
  return `PEDIDOS_MANUAIS_${dia}${mes}${ano}`;
}

// Referência para os pedidos do dia atual
function getPedidosDoDiaRef() {
  const chaveDia = getChavePedidosDoDia();
  return ref(db, chaveDia);
}

// Formata resposta de erro
const errJson = (res, status, msg) => res.status(status).json({ error: msg });

// Middleware de autenticação simples
function auth(req, res, next) {
  if (req.session && req.session.user) return next();
  return errJson(res, 401, "Não autorizado");
}

// Validação simples do payload do pedido
function validarPedido(p) {
  if (!p) return "Pedido vazio";
  if (!p.nome) return "Campo 'nome' é obrigatório";
  if (!p.telefone) return "Campo 'telefone' é obrigatório";
  if (!p.endereco) return "Campo 'endereco' é obrigatório";
  if (!Array.isArray(p.itens) || p.itens.length === 0) return "Campo 'itens' deve ser array com pelo menos 1 item";
  return null;
}

// ------------------ Rotas de Auth ------------------

// Rota de login simples (apenas exemplo)
// Em produção troque por verificação real (BD de usuários, hashing etc)
app.post("/login", (req, res) => {
  const { usuario, senha } = req.body;
  // Exemplo mínimo: usuário "admin" / senha "1234"
  if (!usuario || !senha) return errJson(res, 400, "usuario e senha necessários");

  // Aqui, adapte para checar seu DB de usuários
  if (usuario === "admin" && senha === "1234") {
    req.session.user = { id: 1, nome: "Administrador", usuario };
    return res.json({ message: "Logado com sucesso", user: req.session.user });
  }

  // Exemplo: permitir criação de usuário simples (opcional)
  // Caso queira logins dinâmicos, implemente banco de usuários
  return errJson(res, 403, "Credenciais inválidas");
});

app.post("/logout", auth, (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      console.error("Erro destruir sessão:", err);
      return errJson(res, 500, "Erro ao encerrar sessão");
    }
    // limpa cookie no cliente
    res.clearCookie("connect.sid");
    return res.json({ message: "Deslogado" });
  });
});

// ------------------ CRUD Pedidos (protegido) ------------------

// Criar pedido
app.post("/pedido", auth, async (req, res) => {
  try {
    const pedido = req.body;
    const validationError = validarPedido(pedido);
    if (validationError) return errJson(res, 400, validationError);

    // adiciona timestamps e data
    pedido.createdAt = new Date().toISOString();
    pedido.createdBy = req.session.user?.usuario || null;
    pedido.dataPedido = new Date().toISOString().split('T')[0]; // YYYY-MM-DD

    // push cria key única dentro da chave do dia
    const pedidosDiaRef = getPedidosDoDiaRef();
    const newRef = await push(pedidosDiaRef);
    await set(newRef, pedido);

    const id = newRef.key;
    return res.json({ 
      message: "Pedido criado", 
      id, 
      pedido,
      chaveDia: getChavePedidosDoDia()
    });
  } catch (err) {
    console.error(err);
    return errJson(res, 500, "Erro ao criar pedido");
  }
});

// Ler pedido por id
app.get("/pedido/:id", auth, async (req, res) => {
  try {
    const { id } = req.params;
    if (!id) return errJson(res, 400, "ID obrigatório");

    const pedidosDiaRef = getPedidosDoDiaRef();
    const snap = await get(child(pedidosDiaRef, id));
    if (!snap.exists()) return errJson(res, 404, "Pedido não encontrado");

    return res.json({ id, pedido: snap.val() });
  } catch (err) {
    console.error(err);
    return errJson(res, 500, "Erro ao buscar pedido");
  }
});

// Atualizar pedido por id (substitui campos recebidos)
app.put("/pedido/:id", auth, async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;
    if (!id) return errJson(res, 400, "ID obrigatório");
    if (!updates || Object.keys(updates).length === 0) return errJson(res, 400, "Nada a atualizar");

    // marca atualização
    updates.updatedAt = new Date().toISOString();
    updates.updatedBy = req.session.user?.usuario || null;

    const pedidosDiaRef = getPedidosDoDiaRef();
    await update(child(pedidosDiaRef, id), updates);
    const snap = await get(child(pedidosDiaRef, id));
    return res.json({ message: "Pedido atualizado", id, pedido: snap.exists() ? snap.val() : null });
  } catch (err) {
    console.error(err);
    return errJson(res, 500, "Erro ao atualizar pedido");
  }
});

// Apagar pedido
app.delete("/pedido/:id", auth, async (req, res) => {
  try {
    const { id } = req.params;
    if (!id) return errJson(res, 400, "ID obrigatório");

    const pedidosDiaRef = getPedidosDoDiaRef();
    const snap = await get(child(pedidosDiaRef, id));
    if (!snap.exists()) return errJson(res, 404, "Pedido não encontrado");

    await remove(child(pedidosDiaRef, id));
    return res.json({ message: "Pedido removido", id });
  } catch (err) {
    console.error(err);
    return errJson(res, 500, "Erro ao remover pedido");
  }
});

// Adicionar item a pedido
app.post("/pedido/:id/items", auth, async (req, res) => {
  try {
    const { id } = req.params;
    const item = req.body;
    if (!id) return errJson(res, 400, "ID obrigatório");
    if (!item || !item.produto) return errJson(res, 400, "Item inválido");

    const pedidosDiaRef = getPedidosDoDiaRef();
    const snap = await get(child(pedidosDiaRef, id));
    if (!snap.exists()) return errJson(res, 404, "Pedido não encontrado");

    const pedidoAtual = snap.val();
    pedidoAtual.itens = pedidoAtual.itens || [];
    pedidoAtual.itens.push(item);
    pedidoAtual.updatedAt = new Date().toISOString();

    await set(child(pedidosDiaRef, id), pedidoAtual);
    return res.json({ message: "Item adicionado", id, pedido: pedidoAtual });
  } catch (err) {
    console.error(err);
    return errJson(res, 500, "Erro ao adicionar item");
  }
});

// Listar pedidos (com filtros via query string)
// Ex: GET /pedidos?page=1&limit=20
// Ex: GET /pedidos?nome=João -> filtra por campo exato (nome)
// Se não houver filtros, retorna todos (atenção: para muitos registros, paginar é melhor)
app.get("/pedidos", auth, async (req, res) => {
  try {
    const queryParams = req.query;

    // Se vier busca por campo: exemplo ?nome=João
    const filtroFields = Object.keys(queryParams).filter(k => !["page","limit"].includes(k));
    // paginação simples
    const page = parseInt(queryParams.page) || 1;
    const limit = parseInt(queryParams.limit) || 100;

    const pedidosDiaRef = getPedidosDoDiaRef();
    
    // Se houver exatamente 1 campo para filtrar usando orderByChild + equalTo:
    if (filtroFields.length === 1) {
      const field = filtroFields[0];
      const value = queryParams[field];
      const q = query(pedidosDiaRef, orderByChild(field), equalTo(value));
      const snap = await get(q);
      const result = [];
      snap.forEach(childSnap => {
        result.push({ id: childSnap.key, ...childSnap.val() });
      });
      return res.json({ count: result.length, results: result.slice((page-1)*limit, page*limit) });
    }

    // Caso sem filtros ou múltiplos filtros, pegamos todos e filtramos localmente
    const snapAll = await get(pedidosDiaRef);
    const list = [];
    if (snapAll.exists()) {
      snapAll.forEach(childSnap => {
        list.push({ id: childSnap.key, ...childSnap.val() });
      });
    }

    // aplica filtros múltiplos (AND)
    let filtered = list;
    if (filtroFields.length > 0) {
      filtered = list.filter(item => {
        return filtroFields.every(field => {
          const val = queryParams[field];
          if (item[field] === undefined) return false;
          // comparação simples: string/number exact match (case-insensitive para strings)
          if (typeof item[field] === "string" && typeof val === "string") {
            return item[field].toLowerCase() === val.toLowerCase();
          }
          return item[field] === val;
        });
      });
    }

    const total = filtered.length;
    const paged = filtered.slice((page-1)*limit, page*limit);

    return res.json({ 
      total, 
      page, 
      limit, 
      results: paged,
      chaveDia: getChavePedidosDoDia()
    });
  } catch (err) {
    console.error(err);
    return errJson(res, 500, "Erro ao listar pedidos");
  }
});

// Listar apenas pedidos do dia atual
app.get("/pedidos/hoje", auth, async (req, res) => {
  try {
    const pedidosDiaRef = getPedidosDoDiaRef();
    const snap = await get(pedidosDiaRef);
    
    const list = [];
    if (snap.exists()) {
      snap.forEach(childSnap => {
        list.push({ id: childSnap.key, ...childSnap.val() });
      });
    }

    return res.json({ 
      total: list.length, 
      results: list,
      chaveDia: getChavePedidosDoDia(),
      data: new Date().toISOString().split('T')[0]
    });
  } catch (err) {
    console.error(err);
    return errJson(res, 500, "Erro ao listar pedidos de hoje");
  }
});

// Busca específica (rota auxiliar, usa orderByChild+equalTo)
// Ex: /pedidos/search?field=telefone&value=85988887777
app.get("/pedidos/search", auth, async (req, res) => {
  try {
    const { field, value } = req.query;
    if (!field || !value) return errJson(res, 400, "Parâmetros 'field' e 'value' são necessários");

    const pedidosDiaRef = getPedidosDoDiaRef();
    const q = query(pedidosDiaRef, orderByChild(field), equalTo(value));
    const snap = await get(q);
    const result = [];
    snap.forEach(childSnap => result.push({ id: childSnap.key, ...childSnap.val() }));

    return res.json({ 
      count: result.length, 
      results: result,
      chaveDia: getChavePedidosDoDia()
    });
  } catch (err) {
    console.error(err);
    return errJson(res, 500, "Erro na busca específica");
  }
});

// Healthcheck
app.get("/", (req, res) => {
  res.json({ 
    message: "API Pedidos (sessão + Firebase) v0.2 rodando",
    chaveDiaAtual: getChavePedidosDoDia()
  });
});

// Start
app.listen(PORT, () => {
  console.log(`API rodando na porta ${PORT}`);
  console.log(`Chave do dia atual: ${getChavePedidosDoDia()}`);
});

const express = require("express");
const cors = require("cors");
const admin = require("firebase-admin");

const app = express();
app.use(cors());
app.use(express.json());

/**
 * Carrega as credenciais do Firebase
 * (armazenadas em variável de ambiente no Render)
 */
const serviceAccount = JSON.parse(process.env.FIREBASE_CREDENTIALS);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: process.env.FIREBASE_DB_URL
});

const db = admin.firestore();


// ===============================
//      RECEBER PEDIDO
// ===============================
app.post("/api/pedidos", async (req, res) => {
  try {
    const {
      id,
      cliente,
      valor,
      taxa,
      forma_pagamento,
      itens,
      endereco,
      observacao,
      horario,
      status,
      tipo
    } = req.body;

    if (!id) {
      return res.status(400).json({ error: "Campo 'id' é obrigatório." });
    }

    const pedido = {
      id,
      cliente,
      valor,
      taxa,
      forma_pagamento,
      itens,
      endereco,
      observacao,
      horario,
      status: status || "em produção",
      tipo,
      criado_em: new Date().toISOString()
    };

    await db.collection("pedidos").doc(id).set(pedido);

    res.json({ status: "ok", message: "Pedido registrado com sucesso." });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Erro ao processar pedido." });
  }
});


// ===============================
//     LISTAR TODOS PEDIDOS
// ===============================
app.get("/api/pedidos", async (req, res) => {
  try {
    const snapshot = await db.collection("pedidos").get();
    const pedidos = snapshot.docs.map(doc => doc.data());
    res.json(pedidos);
  } catch (error) {
    res.status(500).json({ error: "Erro ao buscar pedidos." });
  }
});


// ===============================
//     ATUALIZAR STATUS
// ===============================
app.patch("/api/pedidos/:id", async (req, res) => {
  try {
    await db.collection("pedidos").doc(req.params.id).update(req.body);
    res.json({ status: "ok" });
  } catch (error) {
    res.status(500).json({ error: "Erro ao atualizar pedido." });
  }
});


app.get("/", (req, res) => {
  res.send("API do Delivery funcionando 🚀");
});


const port = process.env.PORT || 3000;
app.listen(port, () => console.log("Servidor iniciado na porta " + port));

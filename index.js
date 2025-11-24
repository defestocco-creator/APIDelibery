import express from "express";
import cors from "cors";
import dotenv from "dotenv";
dotenv.config();

import { initializeApp } from "firebase/app";
import { getDatabase, ref, push } from "firebase/database";

// 🔐 Configurações privadas vindas do Render (.env)
const firebaseConfig = {
  apiKey: process.env.FIREBASE_APIKEY,
  authDomain: process.env.FIREBASE_AUTHDOMAIN,
  databaseURL: process.env.FIREBASE_DATABASE,
  projectId: process.env.FIREBASE_PROJECTID,
  storageBucket: process.env.FIREBASE_STORAGE,
  messagingSenderId: process.env.FIREBASE_MSGID,
  appId: process.env.FIREBASE_APPID,
  measurementId: process.env.FIREBASE_MEASURE
};

// Inicializa Firebase (seguro — sem expor chaves)
const firebaseApp = initializeApp(firebaseConfig);
const db = getDatabase(firebaseApp);

const app = express();
app.use(cors());
app.use(express.json());

// 👉 Rota para registrar pedidos
app.post("/pedido", async (req, res) => {
  try {
    const pedido = req.body;

    if (!pedido.nome || !pedido.valor || !pedido.forma_pagamento) {
      return res.status(400).json({
        status: "erro",
        message: "Campos obrigatórios ausentes"
      });
    }

    const pedidosRef = ref(db, "pedidos");
    const novoPedido = await push(pedidosRef, pedido);

    res.json({
      status: "OK",
      message: "Pedido registrado com sucesso!",
      id: novoPedido.key,
      pedido
    });
  } catch (error) {
    console.error("Erro ao registrar pedido:", error);
    res.status(500).json({
      status: "erro",
      message: "Erro interno no servidor"
    });
  }
});

// Porta dinâmica exigida pelo Render
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`API rodando na porta ${PORT}`);
});

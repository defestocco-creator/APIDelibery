import express from "express";
import cors from "cors";
import dotenv from "dotenv";
dotenv.config();

import db from "./firebase.js";
import { ref, push, get, update, remove } from "firebase/database";

const app = express();
app.use(cors());
app.use(express.json());

// ➤ Criar item
app.post("/itens", async (req, res) => {
  try {
    const novoItem = await push(ref(db, "itens"), req.body);
    res.json({ id: novoItem.key, ...req.body });
  } catch (e) {
    res.status(500).json({ erro: e.message });
  }
});

// ➤ Listar itens
app.get("/itens", async (req, res) => {
  try {
    const snapshot = await get(ref(db, "itens"));
    res.json(snapshot.exists() ? snapshot.val() : {});
  } catch (e) {
    res.status(500).json({ erro: e.message });
  }
});

// ➤ Editar item
app.put("/itens/:id", async (req, res) => {
  try {
    await update(ref(db, "itens/" + req.params.id), req.body);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ erro: e.message });
  }
});

// ➤ Deletar item
app.delete("/itens/:id", async (req, res) => {
  try {
    await remove(ref(db, "itens/" + req.params.id));
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ erro: e.message });
  }
});

app.listen(3000, () => console.log("API rodando em http://localhost:3000"));

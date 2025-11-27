// metrics.js — captura métricas automáticas
import { ref, push } from "firebase/database";
import db from "./firebase.js";

// Função para gerar pasta do dia
function pastaMetricas() {
  const hoje = new Date();
  const dd = String(hoje.getDate()).padStart(2, "0");
  const mm = String(hoje.getMonth() + 1).padStart(2, "0");
  const yyyy = hoje.getFullYear();
  return `METRICAS_${dd}${mm}${yyyy}`;
}

export function metricas(req, res, next) {
  const inicio = Date.now();

  res.on("finish", async () => {
    const duracao = Date.now() - inicio;

    const registro = {
      rota: req.originalUrl,
      metodo: req.method,
      status: res.statusCode,
      tempo_ms: duracao,
      timestamp: new Date().toISOString(),
      usuario: req.user?.usuario || "não autenticado"
    };

    try {
      await push(ref(db, pastaMetricas()), registro);
    } catch (err) {
      console.error("Erro ao salvar métrica:", err.message);
    }
  });

  next();
}

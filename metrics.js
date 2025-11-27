import db from "./firebase.js";
import { ref, push } from "firebase/database";

export function metricas(req, res, next) {
  const inicio = Date.now();

  // Aguardar a resposta terminar
  res.on("finish", async () => {
    const tempo = Date.now() - inicio;

    const log = {
      rota: req.originalUrl,
      metodo: req.method,
      status: res.statusCode,
      tempo_ms: tempo,
      usuario: req.user?.usuario || "desconhecido",
      data: new Date().toISOString()
    };

    // Salvar em pasta diária no Firebase
    const pasta = "METRICAS_" + new Date().toISOString().slice(0,10).replace(/-/g,"");

    await push(ref(db, pasta), log);
  });

  next();
}

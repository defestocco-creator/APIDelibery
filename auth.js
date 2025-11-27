// auth.js — Login com Firebase Authentication
import jwt from "jsonwebtoken";
import { signInWithEmailAndPassword } from "firebase/auth";
import auth from "./firebaseAuth.js"; // Firebase #1 (Auth)
import { get, ref } from "firebase/database";
import dbAuth from "./firebaseAuthDB.js"; // RTDB do Firebase #1

export async function login(req, res) {
  const { email, senha } = req.body;

  if (!email || !senha) {
    return res.status(400).json({ erro: "email e senha são obrigatórios" });
  }

  try {
    // Autenticar usuário no Firebase Auth
    const userCred = await signInWithEmailAndPassword(auth, email, senha);
    const uid = userCred.user.uid;

    // Buscar configurações da empresa
    const snap = await get(ref(dbAuth, `APP_CONFIG/${uid}`));
    if (!snap.exists()) {
      return res.status(403).json({ erro: "Usuário sem configuração APP_CONFIG" });
    }

    const empresaConfig = snap.val();

    // Criar JWT contendo UID + nome da empresa
    const token = jwt.sign(
      {
        uid,
        empresa: empresaConfig.appName
      },
      process.env.JWT_SECRET,
      { expiresIn: "12h" }
    );

    res.json({
      ok: true,
      token,
      empresa: empresaConfig.appName,
      config: empresaConfig
    });

  } catch (err) {
    console.error("Erro no login:", err);
    res.status(401).json({ erro: "Credenciais inválidas" });
  }
}

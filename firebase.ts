// Configuração e inicialização do Firebase (cliente / navegador).
// Estas chaves são públicas por design — a segurança fica nas regras do Firestore.
import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyD5mgExupTw0hRMPNBDTd2Lzk0frx_lp1o",
  authDomain: "era-genetica-db.firebaseapp.com",
  projectId: "era-genetica-db",
  storageBucket: "era-genetica-db.firebasestorage.app",
  messagingSenderId: "6522730585",
  appId: "1:6522730585:web:b282b56d23cc0cfd539948",
};

export const app = initializeApp(firebaseConfig);

// Instância do Firestore usada em todo o app.
export const db = getFirestore(app);

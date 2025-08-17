// server.js
import express from "express"; 
import cors from "cors";
import { makeWASocket, useMultiFileAuthState, DisconnectReason } from "@whiskeysockets/baileys";
import chalk from "chalk";
import { Boom } from "@hapi/boom";

const app = express();
app.use(cors()); // Autorise toutes les origines
app.use(express.json());

const PORT = process.env.PORT || 3000;

// Stocke le socket pour réutilisation
let sock;

app.post("/auth", async (req, res) => {
  const { phone } = req.body;
  if (!phone) return res.status(400).json({ error: "Phone number required" });

  try {
    const { state, saveCreds } = await useMultiFileAuthState("./auth_info");

    sock = makeWASocket({
      auth: state,
      printQRInTerminal: false
    });

    // Fonction pour générer le pairing code
    const generatePairingCode = async () => {
      try {
        // Ici on simule requestPairingCode (Baileys n'a pas de méthode officielle pour ça)
        let code = await sock.requestPairingCode(phone); 
        code = code?.match(/.{1,4}/g)?.join("-") || code;
        return code;
      } catch (err) {
        console.error(chalk.red.bold("Failed to generate pairing code:"), err);
        throw err;
      }
    };

    // Événements de connexion
    sock.ev.on("connection.update", async (update) => {
      const { connection, lastDisconnect } = update;
      if (connection === "close") {
        const reason = new Boom(lastDisconnect?.error)?.output.statusCode;
        if (reason === DisconnectReason.loggedOut) {
          console.log(chalk.yellow.bold("Logged out, please scan QR code again."));
        }
        if (reason === DisconnectReason.connectionReplaced) {
          console.log(chalk.yellow.bold("Connection replaced, please close other sessions."));
        }
        if (reason === DisconnectReason.restartRequired) {
          console.log(chalk.yellow.bold("Restart required, restarting..."));
          // restart logic
        }
      }
      if (connection === "open") {
        console.log(chalk.green.bold("Connection successful!"));
      }
    });

    sock.ev.on("creds.update", saveCreds);

    const pairingCode = await generatePairingCode();
    res.json({ pairingCode });

  } catch (err) {
    console.error(chalk.red.bold("Error in /auth:"), err);
    res.status(500).json({ error: "Failed to generate pairing code" });
  }
});

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));


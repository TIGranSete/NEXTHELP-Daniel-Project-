const path = require("path");
const fs = require("fs");

// Ensure production environment on Hostinger/Vercel/etc.
if (!process.env.NODE_ENV) {
  process.env.NODE_ENV = "production";
}

const compiledServerPath = path.join(__dirname, "dist", "server.cjs");

if (!fs.existsSync(compiledServerPath)) {
  console.error("==========================================================");
  console.error("ERRO: O servidor ainda não foi compilado!");
  console.error("Por favor, execute 'npm run build' para compilar o projeto");
  console.error("antes de iniciar a aplicação na Hostinger.");
  console.error("==========================================================");
  process.exit(1);
}

// Requiring the compiled server will automatically start it
const appModule = require(compiledServerPath);

// Export the app for compatibility with various server runners
module.exports = (appModule && typeof appModule === "object" && "default" in appModule) 
  ? appModule.default 
  : appModule;

import "dotenv/config";
import app from "./app.js";

const PORT = process.env.PORT || 3000;

const server = app.listen(PORT, () => {
  console.log(`TaskFlow API running on port ${PORT}`);
});

async function shutdown() {
  console.log("Shutting down server...");

  server.close(async () => {
    const { prisma } = await import("./config/prisma.js");
    await prisma.$disconnect();
    process.exit(0);
  });
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
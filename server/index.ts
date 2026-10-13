import "dotenv/config";
import app from "./app";
import { logger } from "./lib/logger";

const port = Number(process.env.PORT || 5000);

app.listen(port, () => {
  logger.info(`Server listening on http://localhost:${port}`);
  console.log(`\n======================================================`);
  console.log(`  KTAS Tools server running at http://localhost:${port}`);
  console.log(`======================================================\n`);
});

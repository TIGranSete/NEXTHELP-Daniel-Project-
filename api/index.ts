// @ts-ignore
import server from "../dist/server.cjs";

// Resolve the actual Express app instance dynamically
const app = (server && typeof server === "object" && "default" in server) ? server.default : server;

export default (req: any, res: any) => {
  return app(req, res);
};

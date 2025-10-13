import { Router } from "express";
import statusBroadcaster from "../services/statusBroadcaster.js";

const statusController = Router();

statusController.get("/status-stream", (req, res) => {
  statusBroadcaster.handleConnection(req, res);
});

export default statusController;

import express from "express";
import { search } from "./searchController.js";
import { authenticate } from "../../middleware/authMiddleware.js";

const router = express.Router();

router.get("/", authenticate, search);

export default router;

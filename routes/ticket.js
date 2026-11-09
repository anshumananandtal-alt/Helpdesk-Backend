import { Router } from "express";
import { createTicket, getAllTickets, getTicketById, updateTicket, deleteTicket } from "../controllers/ticketController.js";
const router = Router();

// Define routes for ticket operations
router.get("/", getAllTickets);
router.get("/:id", getTicketById);
router.post("/", createTicket);
router.put("/:id", updateTicket);
router.delete("/:id", deleteTicket);

export default router;

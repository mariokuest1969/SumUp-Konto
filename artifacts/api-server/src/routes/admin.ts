import { Router } from "express";
import { clerkClient, getAuth } from "@clerk/express";

const router = Router();

const requireAuth = (req: any, res: any, next: any) => {
  const auth = getAuth(req);
  if (!auth?.userId) return res.status(401).json({ error: "Unauthorized" });
  req.userId = auth.userId;
  next();
};

router.get("/admin/users", requireAuth, async (req: any, res) => {
  try {
    const response = await clerkClient.users.getUserList({ limit: 100, orderBy: "-created_at" });
    const users = response.data.map((u) => ({
      id: u.id,
      email: u.emailAddresses[0]?.emailAddress ?? "",
      firstName: u.firstName ?? "",
      lastName: u.lastName ?? "",
      banned: u.banned,
      locked: u.locked,
      createdAt: u.createdAt,
      lastSignInAt: u.lastSignInAt,
      imageUrl: u.imageUrl,
    }));
    res.json({ users, requestingUserId: req.userId });
  } catch (err: any) {
    res.status(500).json({ error: err.message ?? "Failed to list users" });
  }
});

router.patch("/admin/users/:userId/ban", requireAuth, async (req: any, res) => {
  const { userId } = req.params;
  if (userId === req.userId) return res.status(400).json({ error: "Cannot ban yourself" });
  try {
    await clerkClient.users.banUser(userId);
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message ?? "Failed to ban user" });
  }
});

router.patch("/admin/users/:userId/unban", requireAuth, async (req: any, res) => {
  const { userId } = req.params;
  try {
    await clerkClient.users.unbanUser(userId);
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message ?? "Failed to unban user" });
  }
});

router.delete("/admin/users/:userId", requireAuth, async (req: any, res) => {
  const { userId } = req.params;
  if (userId === req.userId) return res.status(400).json({ error: "Cannot delete yourself" });
  try {
    await clerkClient.users.deleteUser(userId);
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message ?? "Failed to delete user" });
  }
});

export default router;

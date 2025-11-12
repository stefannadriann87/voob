import express = require("express");
const prisma = require("../lib/prisma").default;
const { verifyJWT } = require("../middleware/auth");

const router = express.Router();

// Get employee working hours
router.get("/:employeeId/working-hours", verifyJWT, async (req, res) => {
  const authReq = req as express.Request & { user?: { userId: string; role: string } };
  const { employeeId } = req.params;

  // Only the employee themselves can access their working hours
  if (authReq.user!.userId !== employeeId) {
    return res.status(403).json({ error: "Nu ai permisiunea de a accesa aceste date." });
  }

  try {
    const user = await prisma.user.findUnique({
      where: { id: employeeId },
      select: { workingHours: true },
    });

    if (!user) {
      return res.status(404).json({ error: "Employee-ul nu a fost găsit." });
    }

    return res.json({ workingHours: user.workingHours });
  } catch (error) {
    console.error("Get employee working hours error:", error);
    return res.status(500).json({ error: "Eroare la obținerea programului de lucru." });
  }
});

// Update employee working hours
router.put("/:employeeId/working-hours", verifyJWT, async (req, res) => {
  const authReq = req as express.Request & { user?: { userId: string; role: string } };
  const { employeeId } = req.params;
  const { workingHours }: { workingHours?: any } = req.body;

  // Only the employee themselves can update their working hours
  if (authReq.user!.userId !== employeeId) {
    return res.status(403).json({ error: "Nu ai permisiunea de a actualiza aceste date." });
  }

  try {
    const updatedUser = await prisma.user.update({
      where: { id: employeeId },
      data: {
        workingHours: workingHours || null,
      },
      select: { workingHours: true },
    });

    return res.json({ workingHours: updatedUser.workingHours });
  } catch (error) {
    console.error("Update employee working hours error:", error);
    return res.status(500).json({ error: "Eroare la actualizarea programului de lucru." });
  }
});

// Get employee holidays
router.get("/:employeeId/holidays", verifyJWT, async (req, res) => {
  const authReq = req as express.Request & { user?: { userId: string; role: string } };
  const { employeeId } = req.params;

  // Only the employee themselves can access their holidays
  if (authReq.user!.userId !== employeeId) {
    return res.status(403).json({ error: "Nu ai permisiunea de a accesa aceste date." });
  }

  try {
    const holidays = await prisma.employeeHoliday.findMany({
      where: { employeeId },
      orderBy: { startDate: "asc" },
    });

    return res.json({ holidays });
  } catch (error) {
    console.error("Get employee holidays error:", error);
    return res.status(500).json({ error: "Eroare la obținerea perioadelor de concediu." });
  }
});

// Create employee holiday
router.post("/:employeeId/holidays", verifyJWT, async (req, res) => {
  const authReq = req as express.Request & { user?: { userId: string; role: string } };
  const { employeeId } = req.params;
  const { startDate, endDate, reason }: { startDate?: string; endDate?: string; reason?: string } = req.body;

  // Only the employee themselves can create holidays
  if (authReq.user!.userId !== employeeId) {
    return res.status(403).json({ error: "Nu ai permisiunea de a crea perioade de concediu." });
  }

  if (!startDate || !endDate) {
    return res.status(400).json({ error: "Data de început și data de sfârșit sunt obligatorii." });
  }

  try {
    const holiday = await prisma.employeeHoliday.create({
      data: {
        employeeId,
        startDate: new Date(startDate),
        endDate: new Date(endDate),
        reason: reason?.trim() || null,
      },
    });

    return res.status(201).json({ holiday });
  } catch (error) {
    console.error("Create employee holiday error:", error);
    return res.status(500).json({ error: "Eroare la crearea perioadei de concediu." });
  }
});

// Delete employee holiday
router.delete("/:employeeId/holidays/:holidayId", verifyJWT, async (req, res) => {
  const authReq = req as express.Request & { user?: { userId: string; role: string } };
  const { employeeId, holidayId } = req.params;

  // Only the employee themselves can delete holidays
  if (authReq.user!.userId !== employeeId) {
    return res.status(403).json({ error: "Nu ai permisiunea de a șterge perioade de concediu." });
  }

  try {
    await prisma.employeeHoliday.delete({
      where: { id: holidayId },
    });

    return res.json({ ok: true });
  } catch (error) {
    console.error("Delete employee holiday error:", error);
    return res.status(500).json({ error: "Eroare la ștergerea perioadei de concediu." });
  }
});

export = router;


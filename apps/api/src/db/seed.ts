import { prisma } from "./prisma.js";
import { smtpService } from "../services/smtp/smtp.service.js";

async function seed() {
  console.log("🌱 Starting database seed...");

  // 1. Ensure at least 2 Ethereal sender identities exist
  await smtpService.ensureSendersSeeded();

  // 2. Create or verify a default demonstration user
  const demoEmail = "demo.user@reachinbox.local";
  let demoUser = await prisma.user.findUnique({
    where: { email: demoEmail },
  });

  if (!demoUser) {
    demoUser = await prisma.user.create({
      data: {
        googleId: "google-demo-12345",
        email: demoEmail,
        name: "Alex Demo",
        avatarUrl:
          "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=128&fit=crop&crop=face",
      },
    });
    console.log(
      `[SEED] Created default demo user: ${demoUser.email} (${demoUser.id})`,
    );
  } else {
    console.log(`[SEED] Demo user exists: ${demoUser.email}`);
  }

  console.log("✅ Database seed completed successfully!");
}

seed()
  .catch((err) => {
    console.error("❌ Database seed error:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

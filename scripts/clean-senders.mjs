import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  await prisma.emailMessage.deleteMany({
    where: {
      sender: {
        email: { in: ['sender1@ethereal.email', 'sender2@ethereal.email', 'test_sender_1@ethereal.email', 'test_sender_2@ethereal.email'] }
      }
    }
  });

  await prisma.emailSender.deleteMany({
    where: {
      email: { in: ['sender1@ethereal.email', 'sender2@ethereal.email', 'test_sender_1@ethereal.email', 'test_sender_2@ethereal.email'] }
    }
  });

  console.log('Cleaned old senders.');
}

main().finally(() => prisma.$disconnect());

// One-off bootstrap: no user starts as a Super Admin (User.isSuperAdmin
// defaults to false for everyone, including existing accounts), so the
// very first one has to be granted directly against the database. Usage:
//   npx tsx scripts/promote-super-admin.ts you@example.com
import prisma from "../src/lib/prisma.js";

async function main() {
    const email = process.argv[2];
    if (!email) {
        console.error("Usage: npx tsx scripts/promote-super-admin.ts <email>");
        process.exit(1);
    }

    const user = await prisma.user.findUnique({ where: { email }, select: { id: true, firstname: true, lastName: true, isSuperAdmin: true } });
    if (!user) {
        console.error(`No user found with email ${email}`);
        process.exit(1);
    }
    if (user.isSuperAdmin) {
        console.log(`${user.firstname} ${user.lastName} is already a super admin.`);
        await prisma.$disconnect();
        return;
    }

    await prisma.user.update({ where: { id: user.id }, data: { isSuperAdmin: true } });
    console.log(`${user.firstname} ${user.lastName} (${email}) is now a super admin.`);
    await prisma.$disconnect();
}

main().catch(async (err) => {
    console.error(err);
    await prisma.$disconnect();
    process.exit(1);
});

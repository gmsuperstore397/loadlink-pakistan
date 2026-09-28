'use strict';

require('dotenv').config();

const bcrypt = require('bcryptjs');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

function required(name) {
  const value = String(process.env[name] || '').trim();
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

async function bootstrapAdmin() {
  if (String(process.env.ADMIN_BOOTSTRAP_ENABLED || '').toLowerCase() !== 'true') {
    throw new Error('Admin bootstrap is disabled. Set ADMIN_BOOTSTRAP_ENABLED=true only while running this one-time command.');
  }

  const email = required('ADMIN_EMAIL').toLowerCase();
  const mobile = required('ADMIN_MOBILE').replace(/\s+/g, '');
  const password = required('ADMIN_PASSWORD');

  if (password.length < 10) {
    throw new Error('ADMIN_PASSWORD must be at least 10 characters long.');
  }

  const passwordHash = await bcrypt.hash(password, 12);

  const existingByEmail = await prisma.user.findUnique({ where: { email } });
  const existingByMobile = await prisma.user.findUnique({ where: { mobile } });

  // If email and mobile already belong to different users, use the email account
  // as the canonical admin account. The conflicting user's mobile is cleared so
  // the requested admin mobile can be attached without violating the unique constraint.
  if (existingByEmail && existingByMobile && existingByEmail.id !== existingByMobile.id) {
    await prisma.user.update({
      where: { id: existingByMobile.id },
      data: { mobile: null },
    });
    console.log('ADMIN_BOOTSTRAP: conflicting mobile detached from another user; email account selected as admin');
  }

  const existing = existingByEmail || existingByMobile;

  const user = existing
    ? await prisma.user.update({
        where: { id: existing.id },
        data: {
          email,
          mobile,
          passwordHash,
          role: 'ADMIN',
          status: 'ACTIVE',
          emailVerified: true,
        },
        select: { id: true, fullName: true, email: true, mobile: true, role: true, status: true, emailVerified: true },
      })
    : await prisma.user.create({
        data: {
          fullName: process.env.ADMIN_NAME || 'LoadLink Admin',
          email,
          mobile,
          passwordHash,
          role: 'ADMIN',
          status: 'ACTIVE',
          emailVerified: true,
        },
        select: { id: true, fullName: true, email: true, mobile: true, role: true, status: true, emailVerified: true },
      });

  console.log('ADMIN_BOOTSTRAP_SUCCESS');
  console.log(JSON.stringify(user, null, 2));
  console.log('Password was not printed. Change ADMIN_PASSWORD after login and disable ADMIN_BOOTSTRAP_ENABLED.');
}

module.exports = { bootstrapAdmin };

if (require.main === module) {
  bootstrapAdmin()
    .catch((error) => {
      console.error('ADMIN_BOOTSTRAP_FAILED:', error.message);
      process.exitCode = 1;
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}

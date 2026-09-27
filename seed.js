// DEMO DATA SEED SCRIPT
// Everything created here is clearly demo/sample data for local development
// and QA. None of it represents real users, vehicles or deliveries.
// Run with: npm run seed

const bcrypt = require('bcryptjs');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  console.log('Seeding demo data...');
  const password = await bcrypt.hash('Demo1234!', 10);

  // --- Admin ---
  const admin = await prisma.user.upsert({
    where: { mobile: '03000000000' },
    update: {},
    create: {
      fullName: 'LoadLink Admin (Demo)',
      mobile: '03000000000',
      email: 'admin@loadlink.pk',
      passwordHash: password,
      role: 'ADMIN',
      city: 'Karachi',
      status: 'ACTIVE',
    },
  });

  // --- Demo customer ---
  const customer = await prisma.user.upsert({
    where: { mobile: '03001111111' },
    update: {},
    create: {
      fullName: 'Ahmed Raza (Demo Customer)',
      mobile: '03001111111',
      email: 'ahmed.demo@loadlink.pk',
      passwordHash: password,
      role: 'CUSTOMER',
      city: 'Lahore',
      status: 'ACTIVE',
    },
  });

  // --- Demo verified driver + vehicle ---
  const driverUser = await prisma.user.upsert({
    where: { mobile: '03002222222' },
    update: {},
    create: {
      fullName: 'Imran Baloch (Demo Driver)',
      mobile: '03002222222',
      passwordHash: password,
      role: 'DRIVER',
      city: 'Karachi',
      status: 'ACTIVE',
      driverProfile: {
        create: {
          cnic: '42101-DEMO-1',
          drivingLicense: 'LIC-DEMO-1',
          verification: 'VERIFIED',
          vehicles: {
            create: {
              vehicleType: '10 Wheeler',
              vehicleNumber: 'DEMO-001',
              capacityKg: 10000,
              brand: 'Hino',
              model: '500 Series',
              year: 2020,
              status: 'AVAILABLE',
              isVerified: true,
              latitude: 24.8607,
              longitude: 67.0011,
            },
          },
        },
      },
    },
    include: { driverProfile: { include: { vehicles: true } } },
  });

  // --- Demo driver pending verification ---
  await prisma.user.upsert({
    where: { mobile: '03003333333' },
    update: {},
    create: {
      fullName: 'Bilal Khan (Demo Driver, Pending)',
      mobile: '03003333333',
      passwordHash: password,
      role: 'DRIVER',
      city: 'Islamabad',
      status: 'ACTIVE',
      driverProfile: {
        create: {
          cnic: '61101-DEMO-2',
          drivingLicense: 'LIC-DEMO-2',
          verification: 'PENDING_VERIFICATION',
          vehicles: {
            create: {
              vehicleType: 'Mazda',
              vehicleNumber: 'DEMO-002',
              capacityKg: 2000,
              status: 'OFFLINE',
              isVerified: false,
              latitude: 33.6844,
              longitude: 73.0479,
            },
          },
        },
      },
    },
  });

  // --- Demo load, booking and trip ---
  const driverProfile = await prisma.driverProfile.findFirst({ where: { userId: driverUser.id } });
  const vehicle = await prisma.vehicle.findFirst({ where: { driverId: driverProfile.id } });

  const load = await prisma.load.create({
    data: {
      customerId: customer.id,
      pickupAddress: 'Lahore, Punjab, Pakistan (Demo)',
      pickupLatitude: 31.5497,
      pickupLongitude: 74.3436,
      destinationAddress: 'Karachi, Sindh, Pakistan (Demo)',
      destinationLatitude: 24.8607,
      destinationLongitude: 67.0011,
      description: 'Demo load: household furniture, 20 cartons.',
      weightKg: 6000,
      preferredVehicle: '10 Wheeler',
      status: 'ASSIGNED',
    },
  });

  const booking = await prisma.booking.create({
    data: {
      loadId: load.id,
      customerId: customer.id,
      driverId: driverProfile.id,
      vehicleId: vehicle.id,
      status: 'ACCEPTED',
    },
  });

  await prisma.trip.create({
    data: {
      bookingId: booking.id,
      loadId: load.id,
      driverId: driverProfile.id,
      vehicleId: vehicle.id,
      pickup: load.pickupAddress,
      destination: load.destinationAddress,
      currentLatitude: 29.0,
      currentLongitude: 70.0,
      status: 'IN_TRANSIT',
      startedAt: new Date(),
    },
  });

  console.log('Demo data seeded:');
  console.log('  Admin:    03000000000 / Demo1234!');
  console.log('  Customer: 03001111111 / Demo1234!');
  console.log('  Driver:   03002222222 / Demo1234! (verified)');
  console.log('  Driver:   03003333333 / Demo1234! (pending verification)');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

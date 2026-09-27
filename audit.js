const prisma = require('./prisma');

async function audit(req, action, entity, entityId, metadata) {
  try {
    await prisma.auditLog.create({
      data: {
        userId: req?.user?.id || null,
        action,
        entity: entity || null,
        entityId: entityId || null,
        ip: req?.ip || null,
        metadata: metadata ? JSON.stringify(metadata) : null,
      },
    });
  } catch (e) {
    console.error('audit failed:', e.message);
  }
}
module.exports = audit;
